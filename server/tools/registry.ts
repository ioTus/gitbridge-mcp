import { readFileSchema } from "./read_file.js";
import { readFilesSchema } from "./read_files.js";
import { writeFileSchema } from "./write_file.js";
import { pushMultipleFilesSchema } from "./push_multiple_files.js";
import { listFilesSchema } from "./list_files.js";
import { createIssueSchema } from "./create_issue.js";
import { updateIssueSchema } from "./update_issue.js";
import { listIssuesSchema } from "./list_issues.js";
import { addIssueCommentSchema } from "./add_issue_comment.js";
import { readIssueSchema } from "./read_issue.js";
import { searchFilesSchema } from "./search_files.js";
import { moveFileSchema } from "./move_file.js";
import { deleteFileSchema } from "./delete_file.js";
import { queueWriteSchema } from "./queue_write.js";
import { flushQueueSchema } from "./flush_queue.js";
import { getRecentCommitsSchema } from "./get_recent_commits.js";
import { createRepoSchema } from "./create_repo.js";
import { createBranchSchema } from "./create_branch.js";
import { listBranchesSchema } from "./list_branches.js";
import { getFileDiffSchema } from "./get_file_diff.js";
import { getProjectBoardSchema } from "./get_project_board.js";
import { moveIssueToColumnSchema } from "./move_issue_to_column.js";
import { patchFileSchema } from "./patch_file.js";
import { patchMultipleFilesSchema } from "./patch_multiple_files.js";
import { checkFileStatusSchema } from "./check_file_status.js";
import { addResponseFormat } from "./response-format.js";

export interface ToolSchema {
  name: string;
  category: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

const toolSchemas: ToolSchema[] = [
  readFileSchema,
  readFilesSchema,
  writeFileSchema,
  pushMultipleFilesSchema,
  listFilesSchema,
  createIssueSchema,
  updateIssueSchema,
  listIssuesSchema,
  addIssueCommentSchema,
  readIssueSchema,
  searchFilesSchema,
  moveFileSchema,
  deleteFileSchema,
  queueWriteSchema,
  flushQueueSchema,
  getRecentCommitsSchema,
  createRepoSchema,
  createBranchSchema,
  listBranchesSchema,
  getFileDiffSchema,
  getProjectBoardSchema,
  moveIssueToColumnSchema,
  patchFileSchema,
  patchMultipleFilesSchema,
  checkFileStatusSchema,
] as ToolSchema[];

export const allToolSchemas: ToolSchema[] = toolSchemas.map(addResponseFormat);
export const activeToolSchemas = allToolSchemas;
export const phase2ToolSchemas: ToolSchema[] = [];
