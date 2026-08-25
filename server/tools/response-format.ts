import type { ToolSchema } from "./registry.js";

export type ResponseFormat = "compact" | "pretty";

type ToolResult = {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
};

const formatProperty = {
  type: "string",
  enum: ["compact", "pretty"],
  default: "compact",
  description: "Output style.",
};

/**
 * Adds the common output preference without requiring every tool schema to
 * duplicate it. Schemas are copied so tool definitions remain immutable.
 */
export function addResponseFormat(schema: ToolSchema): ToolSchema {
  return {
    ...schema,
    inputSchema: {
      ...schema.inputSchema,
      properties: {
        ...schema.inputSchema.properties,
        format: formatProperty,
      },
    },
  };
}

export function splitResponseFormat(args: Record<string, unknown> | undefined): {
  format: ResponseFormat;
  handlerArgs: Record<string, unknown>;
} {
  const { format, ...handlerArgs } = args || {};
  return { format: format === "pretty" ? "pretty" : "compact", handlerArgs };
}

function compactListFiles(text: string): string | undefined {
  try {
    const items = JSON.parse(text);
    if (!Array.isArray(items)) return undefined;
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const entry = item as { path?: unknown; name?: unknown; type?: unknown };
        // A listing is relative to the requested directory. Using the API's
        // full path is both redundant and needlessly expensive.
        const name = entry.name;
        if (typeof name !== "string") return undefined;
        return entry.type === "dir" && !name.endsWith("/") ? `${name}/` : name;
      })
      .filter((path): path is string => Boolean(path))
      .join("\n");
  } catch {
    return undefined;
  }
}

function compactWriteFile(text: string): string {
  const path = text.match(/File '([^']+)'/)?.[1];
  const sha = text.match(/Commit SHA:\s*([^\s]+)/)?.[1];
  if (path && sha) return `${path} ${sha}`;
  return text.trim();
}

function compactJson(text: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return undefined;
  }
}

const contentBearingTools = new Set([
  "read_file",
  "read_issue",
  "get_project_board",
  "get_file_diff",
]);

const mutationTools = new Set([
  "write_file",
  "push_multiple_files",
  "create_issue",
  "update_issue",
  "add_issue_comment",
  "move_file",
  "delete_file",
  "queue_write",
  "flush_queue",
  "create_repo",
  "create_branch",
  "move_issue_to_column",
  "patch_file",
  "patch_multiple_files",
]);

function compactMutation(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^Issue #(\d+) updated successfully\.$/, "Issue #$1"))
    .map((line) => line.replace(/^File '(.+)' (?:deleted successfully|copied to)'.$/, "File '$1'"))
    .map((line) => line.replace(/^Comment added to issue #(\d+)\.$/, "Issue #$1"))
    .filter((line) =>
      !/^(?:Successfully |Issue created successfully\.|Repository created successfully\.|You can now write files )/i.test(line)
    )
    .join("; ");
}

/**
 * Formats successful tool output at the MCP boundary. Handlers still receive
 * their original arguments and retain their existing API/logging behavior.
 */
export function formatToolResponse(
  toolName: string,
  result: ToolResult,
  format: ResponseFormat,
): ToolResult {
  if (format === "pretty" || result.isError || !result.content) return result;

  return {
    ...result,
    content: result.content.map((item) => {
      if (item.type !== "text" || typeof item.text !== "string") return item;
      const original = item.text;

      // These formats contain load-bearing source, body, title, or patch
      // lines and must remain byte-for-byte intact.
      if (contentBearingTools.has(toolName)) return item;

      if (toolName === "list_files") {
        return { ...item, text: compactListFiles(original) ?? original };
      }

      if (toolName === "write_file") {
        return { ...item, text: compactWriteFile(original) };
      }

      const json = compactJson(original);
      if (json !== undefined) return { ...item, text: json };

      if (mutationTools.has(toolName)) {
        return { ...item, text: compactMutation(original) };
      }

      // Do not rewrite an unfamiliar response: it may contain user content.
      return { ...item, text: original.trim() };
    }),
  };
}