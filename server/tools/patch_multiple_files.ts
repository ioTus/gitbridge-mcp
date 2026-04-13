import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const patchMultipleFilesSchema = {
  name: "patch_multiple_files",
  category: "file",
  description: "Apply targeted text edits across multiple files in a single atomic commit. Supports replace, insert_after, insert_before, and delete operations per file. If any operation fails, none are applied.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      branch: {
        type: "string",
        description: "Branch name (default: main)",
        default: "main",
      },
      files: {
        type: "array",
        description: "Array of files to patch. Each file specifies a path and its operations.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path in the repo" },
            operations: {
              type: "array",
              description: "Edit operations to apply sequentially to this file",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["replace", "insert_after", "insert_before", "delete"],
                    description: "Operation type",
                  },
                  old: {
                    type: "string",
                    description: "For 'replace': exact string to find and replace (must be unique in the file)",
                  },
                  new: {
                    type: "string",
                    description: "For 'replace': replacement string",
                  },
                  match: {
                    type: "string",
                    description: "For 'insert_after', 'insert_before', 'delete': exact string to match (must be unique in the file)",
                  },
                  content: {
                    type: "string",
                    description: "For 'insert_after', 'insert_before': content to insert",
                  },
                },
                required: ["type"],
              },
            },
          },
          required: ["path", "operations"],
        },
      },
      commit_message: {
        type: "string",
        description: "Commit message (auto-generated if not provided)",
      },
    },
    required: ["owner", "repo", "files"],
  },
};

interface PatchOperation {
  type: "replace" | "insert_after" | "insert_before" | "delete";
  old?: string;
  new?: string;
  match?: string;
  content?: string;
}

interface OperationSummary {
  type: string;
  line: number;
  preview?: string;
  lines_added?: number;
  lines_removed?: number;
}

interface FileSummary {
  path: string;
  operations_applied: number;
  summary: OperationSummary[];
}

function validateOperation(op: PatchOperation, index: number, filePath: string): string | null {
  switch (op.type) {
    case "replace":
      if (!op.old) return `${filePath} — Operation ${index}: 'replace' requires 'old' parameter`;
      if (op.new === undefined || op.new === null)
        return `${filePath} — Operation ${index}: 'replace' requires 'new' parameter`;
      break;
    case "insert_after":
    case "insert_before":
      if (!op.match)
        return `${filePath} — Operation ${index}: '${op.type}' requires 'match' parameter`;
      if (op.content === undefined || op.content === null)
        return `${filePath} — Operation ${index}: '${op.type}' requires 'content' parameter`;
      break;
    case "delete":
      if (!op.match) return `${filePath} — Operation ${index}: 'delete' requires 'match' parameter`;
      break;
    default:
      return `${filePath} — Operation ${index}: unknown type '${(op as any).type}'. Must be replace, insert_after, insert_before, or delete`;
  }
  return null;
}

function findMatch(
  content: string,
  needle: string,
  opIndex: number,
  opType: string,
  filePath: string
): { error: string } | { index: number; line: number } {
  const first = content.indexOf(needle);
  if (first === -1) {
    return {
      error: `${filePath} — Operation ${opIndex} (${opType}): match string not found in file. Ensure the string exists exactly as specified.`,
    };
  }
  const second = content.indexOf(needle, first + 1);
  if (second !== -1) {
    return {
      error: `${filePath} — Operation ${opIndex} (${opType}): match string found multiple times in file. Provide a more specific (unique) string.`,
    };
  }
  const line = content.substring(0, first).split("\n").length;
  return { index: first, line };
}

function applyOperations(
  originalContent: string,
  operations: PatchOperation[],
  filePath: string
): { error: string } | { content: string; summary: OperationSummary[] } {
  let content = originalContent;
  const summary: OperationSummary[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    switch (op.type) {
      case "replace": {
        const result = findMatch(content, op.old!, i, "replace", filePath);
        if ("error" in result) return result;

        content =
          content.substring(0, result.index) +
          op.new! +
          content.substring(result.index + op.old!.length);

        const preview =
          op.new!.length > 80 ? op.new!.substring(0, 80) + "..." : op.new!;
        summary.push({ type: "replace", line: result.line, preview });
        break;
      }
      case "insert_after": {
        const result = findMatch(content, op.match!, i, "insert_after", filePath);
        if ("error" in result) return result;

        const matchEnd = result.index + op.match!.length;
        const lineEnd = content.indexOf("\n", matchEnd);
        const insertPos = lineEnd === -1 ? content.length : lineEnd;
        const insertion = "\n" + op.content!;

        content =
          content.substring(0, insertPos) +
          insertion +
          content.substring(insertPos);

        const linesAdded = op.content!.split("\n").length;
        summary.push({ type: "insert_after", line: result.line, lines_added: linesAdded });
        break;
      }
      case "insert_before": {
        const result = findMatch(content, op.match!, i, "insert_before", filePath);
        if ("error" in result) return result;

        const lineStart = content.lastIndexOf("\n", result.index - 1) + 1;
        const insertion = op.content! + "\n";

        content =
          content.substring(0, lineStart) +
          insertion +
          content.substring(lineStart);

        const linesAdded = op.content!.split("\n").length;
        summary.push({ type: "insert_before", line: result.line, lines_added: linesAdded });
        break;
      }
      case "delete": {
        const result = findMatch(content, op.match!, i, "delete", filePath);
        if ("error" in result) return result;

        const linesRemoved = op.match!.split("\n").length;
        const lineStart = content.lastIndexOf("\n", result.index - 1) + 1;
        const matchEndOffset = result.index + op.match!.length;
        const lineEnd = content.indexOf("\n", matchEndOffset);
        const deleteEnd = lineEnd === -1 ? content.length : lineEnd + 1;

        content =
          content.substring(0, lineStart) + content.substring(deleteEnd);

        summary.push({ type: "delete", line: result.line, lines_removed: linesRemoved });
        break;
      }
    }
  }

  return { content, summary };
}

export async function patchMultipleFiles(args: {
  owner?: string;
  repo?: string;
  branch?: string;
  files: Array<{ path: string; operations: PatchOperation[] }>;
  commit_message?: string;
}) {
  const validated = validateOwnerRepo(args);
  if ("error" in validated) {
    return {
      content: [{ type: "text", text: `Error: ${validated.error}` }],
      isError: true,
    };
  }
  const { owner, repo } = validated;
  const { branch = "main", files } = args;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return {
      content: [{ type: "text", text: "Error: 'files' must be a non-empty array." }],
      isError: true,
    };
  }

  const seen = new Set<string>();
  for (const file of files) {
    if (!file.path) {
      return {
        content: [{ type: "text", text: "Error: each file entry must have a 'path' property." }],
        isError: true,
      };
    }
    if (seen.has(file.path)) {
      return {
        content: [{ type: "text", text: `Error: duplicate file path '${file.path}'. Each path must appear only once.` }],
        isError: true,
      };
    }
    seen.add(file.path);

    if (!file.operations || !Array.isArray(file.operations) || file.operations.length === 0) {
      return {
        content: [{ type: "text", text: `Error: '${file.path}' must have a non-empty 'operations' array.` }],
        isError: true,
      };
    }

    for (let i = 0; i < file.operations.length; i++) {
      const err = validateOperation(file.operations[i], i, file.path);
      if (err) {
        return {
          content: [{ type: "text", text: `Error: ${err}` }],
          isError: true,
        };
      }
    }
  }

  if (files.length > 50) {
    console.log(`[${new Date().toISOString()}] [MCP] patch_multiple_files: large batch warning — ${files.length} files requested`);
  }

  const totalOps = files.reduce((sum, f) => sum + f.operations.length, 0);
  const commitMessage =
    args.commit_message ||
    `Claude: patch ${files.length} files (${totalOps} operation${totalOps !== 1 ? "s" : ""})`;

  try {
    const refResponse = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const baseCommitSha = refResponse.data.object.sha;

    const commitResponse = await octokit.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
    const baseTreeSha = commitResponse.data.tree.sha;

    const readResults = await Promise.all(
      files.map(async (file) => {
        try {
          const response = await octokit.repos.getContent({
            owner,
            repo,
            path: file.path,
            ref: baseCommitSha,
          });
          const data = response.data;

          if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
            return { path: file.path, error: `'${file.path}' is not a readable file.` };
          }

          const content = Buffer.from(data.content as string, "base64").toString("utf-8");
          return { path: file.path, content, operations: file.operations };
        } catch (error: any) {
          if (error.status === 404) {
            return { path: file.path, error: `File not found: '${file.path}' on branch '${branch}'` };
          }
          return { path: file.path, error: `Failed to read '${file.path}': ${error.message}` };
        }
      })
    );

    const readErrors = readResults.filter((r) => "error" in r && r.error);
    if (readErrors.length > 0) {
      const errorList = readErrors.map((r) => `- ${(r as any).error}`).join("\n");
      logToolCall(
        "patch_multiple_files",
        { owner, repo, branch, fileCount: files.length },
        "error",
        `${readErrors.length} file(s) could not be read`
      );
      return {
        content: [{
          type: "text",
          text: `Error: ${readErrors.length} file(s) could not be read:\n${errorList}`,
        }],
        isError: true,
      };
    }

    const patchedFiles: Array<{ path: string; content: string; summary: OperationSummary[]; opsApplied: number }> = [];
    const patchErrors: string[] = [];

    for (const result of readResults) {
      const r = result as { path: string; content: string; operations: PatchOperation[] };
      const patchResult = applyOperations(r.content, r.operations, r.path);
      if ("error" in patchResult) {
        patchErrors.push(patchResult.error);
      } else {
        patchedFiles.push({
          path: r.path,
          content: patchResult.content,
          summary: patchResult.summary,
          opsApplied: r.operations.length,
        });
      }
    }

    if (patchErrors.length > 0) {
      const errorList = patchErrors.map((e) => `- ${e}`).join("\n");
      logToolCall(
        "patch_multiple_files",
        { owner, repo, branch, fileCount: files.length },
        "error",
        `${patchErrors.length} patch operation(s) failed`
      );
      return {
        content: [{
          type: "text",
          text: `Error: ${patchErrors.length} patch operation(s) failed (no changes applied):\n${errorList}`,
        }],
        isError: true,
      };
    }

    const tree = await Promise.all(
      patchedFiles.map(async (file) => {
        const blob = await octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.data.sha,
        };
      })
    );

    const newTree = await octokit.git.createTree({ owner, repo, base_tree: baseTreeSha, tree });

    const newCommit = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.data.sha,
      parents: [baseCommitSha],
    });

    try {
      await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.data.sha });
    } catch (refError: any) {
      if (refError.status === 422 || refError.status === 409) {
        logToolCall(
          "patch_multiple_files",
          { owner, repo, branch, fileCount: files.length },
          "error",
          "Conflict: branch changed during patch"
        );
        return {
          content: [{
            type: "text",
            text: `Error: Conflict — the branch '${branch}' was updated while the patch was being prepared. No changes were applied. Re-read the affected files and retry.`,
          }],
          isError: true,
        };
      }
      throw refError;
    }

    const fileSummaries: FileSummary[] = patchedFiles.map((f) => ({
      path: f.path,
      operations_applied: f.opsApplied,
      summary: f.summary,
    }));

    logToolCall(
      "patch_multiple_files",
      { owner, repo, branch, fileCount: files.length, totalOps },
      "success",
      `commit: ${newCommit.data.sha}, ${files.length} files, ${totalOps} ops`
    );

    const responseBody = {
      success: true,
      commit_sha: newCommit.data.sha,
      branch,
      files_patched: files.length,
      total_operations: totalOps,
      files: fileSummaries,
    };

    return {
      content: [{
        type: "text",
        text: `✅ Writing to: ${owner}/${repo}\n${JSON.stringify(responseBody, null, 2)}`,
      }],
    };
  } catch (error: any) {
    const message = `Failed to patch multiple files: ${error.message}`;
    logToolCall(
      "patch_multiple_files",
      { owner, repo, branch, fileCount: files.length },
      "error",
      message
    );
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
