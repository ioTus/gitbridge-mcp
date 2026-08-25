import { octokit, validateOwnerRepo, ownerRepoParams, logToolCall } from "../lib/github.js";

export const patchFileSchema = {
  name: "patch_file",
  category: "file",
  description:
    "Atomically apply ordered edits to one file. Supports replace, insert_after, insert_before, and delete; old/match text must be unique.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...ownerRepoParams,
      path: { type: "string", description: "Repository file path." },
      branch: {
        type: "string",
        description: "Branch name.",
        default: "main",
      },
      operations: {
        type: "array",
        description: "Ordered edit operations.",
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
              description: "Unique exact text for replace.",
            },
            new: {
              type: "string",
              description: "Replacement text.",
            },
            match: {
              type: "string",
              description: "Unique exact text for insert or delete.",
            },
            content: {
              type: "string",
              description: "Text for insert operations.",
            },
          },
          required: ["type"],
        },
      },
      commit_message: {
        type: "string",
        description: "Commit message.",
      },
    },
    required: ["owner", "repo", "path", "operations"],
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

function validateOperation(
  op: PatchOperation,
  index: number
): string | null {
  switch (op.type) {
    case "replace":
      if (!op.old) return `Operation ${index}: 'replace' requires 'old' parameter`;
      if (op.new === undefined || op.new === null)
        return `Operation ${index}: 'replace' requires 'new' parameter`;
      break;
    case "insert_after":
    case "insert_before":
      if (!op.match)
        return `Operation ${index}: '${op.type}' requires 'match' parameter`;
      if (op.content === undefined || op.content === null)
        return `Operation ${index}: '${op.type}' requires 'content' parameter`;
      break;
    case "delete":
      if (!op.match) return `Operation ${index}: 'delete' requires 'match' parameter`;
      break;
    default:
      return `Operation ${index}: unknown type '${(op as any).type}'. Must be replace, insert_after, insert_before, or delete`;
  }
  return null;
}

function findMatch(
  content: string,
  needle: string,
  opIndex: number,
  opType: string
): { error: string } | { index: number; line: number } {
  const first = content.indexOf(needle);
  if (first === -1) {
    return {
      error: `Operation ${opIndex} (${opType}): match string not found in file. Ensure the string exists exactly as specified.`,
    };
  }
  const second = content.indexOf(needle, first + 1);
  if (second !== -1) {
    return {
      error: `Operation ${opIndex} (${opType}): match string found multiple times in file. Provide a more specific (unique) string.`,
    };
  }
  const line = content.substring(0, first).split("\n").length;
  return { index: first, line };
}

function applyOperations(
  originalContent: string,
  operations: PatchOperation[]
): { error: string } | { content: string; summary: OperationSummary[] } {
  let content = originalContent;
  const summary: OperationSummary[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    switch (op.type) {
      case "replace": {
        const result = findMatch(content, op.old!, i, "replace");
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
        const result = findMatch(content, op.match!, i, "insert_after");
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
        summary.push({
          type: "insert_after",
          line: result.line,
          lines_added: linesAdded,
        });
        break;
      }
      case "insert_before": {
        const result = findMatch(content, op.match!, i, "insert_before");
        if ("error" in result) return result;

        const lineStart = content.lastIndexOf("\n", result.index - 1) + 1;
        const insertion = op.content! + "\n";

        content =
          content.substring(0, lineStart) +
          insertion +
          content.substring(lineStart);

        const linesAdded = op.content!.split("\n").length;
        summary.push({
          type: "insert_before",
          line: result.line,
          lines_added: linesAdded,
        });
        break;
      }
      case "delete": {
        const result = findMatch(content, op.match!, i, "delete");
        if ("error" in result) return result;

        const linesRemoved = op.match!.split("\n").length;
        const lineStart = content.lastIndexOf("\n", result.index - 1) + 1;
        const matchEndOffset = result.index + op.match!.length;
        const lineEnd = content.indexOf("\n", matchEndOffset);
        const deleteEnd = lineEnd === -1 ? content.length : lineEnd + 1;

        content =
          content.substring(0, lineStart) + content.substring(deleteEnd);

        summary.push({
          type: "delete",
          line: result.line,
          lines_removed: linesRemoved,
        });
        break;
      }
    }
  }

  return { content, summary };
}

export async function patchFile(args: {
  owner?: string;
  repo?: string;
  path: string;
  branch?: string;
  operations: PatchOperation[];
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
  const { path, branch = "main", operations } = args;

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Error: 'operations' must be a non-empty array of edit operations.",
        },
      ],
      isError: true,
    };
  }

  for (let i = 0; i < operations.length; i++) {
    const err = validateOperation(operations[i], i);
    if (err) {
      return {
        content: [{ type: "text", text: `Error: ${err}` }],
        isError: true,
      };
    }
  }

  const commitMessage =
    args.commit_message ||
    `Claude: patch ${path} (${operations.length} operation${operations.length > 1 ? "s" : ""})`;

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    const data = response.data;

    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: '${path}' is not a readable file.`,
          },
        ],
        isError: true,
      };
    }

    const originalContent = Buffer.from(
      data.content as string,
      "base64"
    ).toString("utf-8");
    const sha = data.sha;

    const result = applyOperations(originalContent, operations);
    if ("error" in result) {
      logToolCall(
        "patch_file",
        { owner, repo, path, branch, operationCount: operations.length },
        "error",
        result.error
      );
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }

    const encodedContent = Buffer.from(result.content).toString("base64");

    let commitSha: string;
    try {
      const putResponse = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: commitMessage,
        content: encodedContent,
        branch,
        sha,
      });
      const returnedSha = putResponse.data.commit.sha;
      if (!returnedSha) {
        throw new Error("GitHub did not return a commit SHA");
      }
      commitSha = returnedSha;
    } catch (error: any) {
      if (error.status === 409) {
        logToolCall(
          "patch_file",
          { owner, repo, path, branch },
          "error",
          "Conflict: file modified since read"
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: Conflict — the file was modified since it was read. Re-read the file and retry your patch.`,
            },
          ],
          isError: true,
        };
      }
      throw error;
    }

    logToolCall(
      "patch_file",
      { owner, repo, path, branch, operationCount: operations.length },
      "success",
      `commit: ${commitSha}, ${operations.length} ops applied`
    );

    const responseBody = {
      success: true,
      commit_sha: commitSha,
      operations_applied: operations.length,
      summary: result.summary,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(responseBody, null, 2),
        },
      ],
    };
  } catch (error: any) {
    const message =
      error.status === 404
        ? `File not found: '${path}' on branch '${branch}' in ${owner}/${repo}`
        : `Failed to patch file: ${error.message}`;
    logToolCall(
      "patch_file",
      { owner, repo, path, branch },
      "error",
      message
    );
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
