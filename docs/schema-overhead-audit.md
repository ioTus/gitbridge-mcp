# MCP schema overhead audit

## Method

Claude token usage metadata is not exposed by the available programmatic model
query, so this audit uses the approved tokenizer fallback. Both snapshots are
serialized identically with `JSON.stringify`: the ordered `ListTools` array,
containing only each tool's `name`, `description`, and `inputSchema`.

- Baseline: local commit `746f6fd`, captured before description edits
- Tokenizer: `js-tiktoken` using `cl100k_base`
- Reproduce: `npm run audit:schema`

The audit command reconstructs the baseline from that Git commit in a temporary
directory, imports its exact registry, and applies the same serializer and
tokenizer to both snapshots. Baseline counts are not hardcoded.

## Result

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Tokens | 4,586 | 3,159 | 31.11% |
| Characters | 22,469 | 14,883 | 33.76% |
| UTF-8 bytes | 22,475 | 14,883 | 33.78% |

Required fields, defaults, enum values, and runtime behavior are unchanged.
Common `owner`, `repo`, and `format` prose was minimized because their names,
types, enum, and default already communicate the contract.

## Per-tool token counts

| Tool | Before | After |
| --- | ---: | ---: |
| `read_file` | 242 | 145 |
| `write_file` | 253 | 172 |
| `push_multiple_files` | 295 | 201 |
| `list_files` | 138 | 95 |
| `create_issue` | 173 | 129 |
| `update_issue` | 206 | 166 |
| `list_issues` | 178 | 121 |
| `add_issue_comment` | 132 | 97 |
| `read_issue` | 117 | 82 |
| `search_files` | 163 | 109 |
| `move_file` | 189 | 140 |
| `delete_file` | 167 | 112 |
| `queue_write` | 251 | 164 |
| `flush_queue` | 158 | 106 |
| `get_recent_commits` | 142 | 97 |
| `create_repo` | 186 | 130 |
| `create_branch` | 134 | 100 |
| `list_branches` | 120 | 78 |
| `get_file_diff` | 173 | 119 |
| `get_project_board` | 134 | 86 |
| `move_issue_to_column` | 175 | 122 |
| `patch_file` | 353 | 241 |
| `patch_multiple_files` | 371 | 264 |
| `check_file_status` | 157 | 104 |

## Fixed tool-selection spot-check

An internal model evaluator received the complete before and after schemas and
the same eight requests. It chose the expected tool in all 8/8 scenarios for
both snapshots.
The structured evaluator result is checked in as
[`schema-routing-evaluation.json`](schema-routing-evaluation.json).

| Scenario | Expected | Before | After |
| --- | --- | --- | --- |
| Read exact file contents | `read_file` | pass | pass |
| Targeted edit in one file | `patch_file` | pass | pass |
| Targeted edits in several files | `patch_multiple_files` | pass | pass |
| Full-content writes for several files | `push_multiple_files` | pass | pass |
| Read an issue and its comments | `read_issue` | pass | pass |
| Update issue title and labels | `update_issue` | pass | pass |
| Add an issue comment | `add_issue_comment` | pass | pass |
| List filtered issues | `list_issues` | pass | pass |

`npm run test:schema-routing` also guards the distinguishing routing signals in
these schemas.

## Durable usage window

Schema profile splitting is deferred until the durable event store contains
either 30 days of production observations or 500 production tool calls.
Telemetry has no HTTP/dashboard read surface; run `npm run audit:tool-usage`
from the workspace for the per-tool/version summary and threshold readiness.