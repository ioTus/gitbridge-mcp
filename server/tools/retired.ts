export const retiredToolErrors: Readonly<Record<string, string>> = {
  read_file:
    'read_file is retired — use read_files with paths: ["<path>"]',
  patch_file:
    "patch_file is retired — use patch_multiple_files with files: [{path, operations}]",
  write_file:
    "write_file is retired — use push_multiple_files with files: [{path, content}]",
  check_file_status:
    "check_file_status is retired — use read_files with metadata_only: true",
};

export function retiredToolError(name: string): string | undefined {
  return retiredToolErrors[name];
}

export function missingToolResult(name: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: retiredToolError(name) ?? `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
}

interface MissingToolActivity {
  tool: string;
  args: Record<string, unknown>;
  outcome: "error";
  duration_ms: 0;
  error_class: "validation";
  session?: string;
  request_id?: string;
}

export function dispatchMissingTool(
  name: string,
  args: Record<string, unknown>,
  context: { session?: string; request_id?: string },
  schedule: (activity: MissingToolActivity) => void,
) {
  schedule({
    tool: name,
    args,
    outcome: "error",
    duration_ms: 0,
    error_class: "validation",
    session: context.session,
    request_id: context.request_id,
  });
  return missingToolResult(name);
}