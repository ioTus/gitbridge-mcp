# MCP schema overhead audit

## Method

Claude token usage metadata is not exposed by the available programmatic model
query, so this audit uses the approved tokenizer fallback. Both snapshots are
serialized identically with `JSON.stringify`: the ordered `ListTools` array,
containing only each tool's `name`, `description`, and `inputSchema`.

- Issue #44 baseline: local commit `746f6fd`, captured before description edits
- Issue #45 retirement baseline: local commit `8655251`, containing all 25
  schemas immediately before the four singular tools were retired
- Tokenizer: `js-tiktoken` using `cl100k_base`
- Reproduce: `npm run audit:schema`

The audit command reconstructs the baseline from that Git commit in a temporary
directory, imports its exact registry, and applies the same serializer and
tokenizer to both snapshots. Baseline counts are not hardcoded.
The audit preserves Issue #44's historical 24-tool comparison by reconstructing
the optimized retirement baseline. It then separately compares the complete
25-tool retirement baseline with the current 21-tool registry.

## Result

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Tokens | 4,586 | 3,159 | 31.12% |
| Characters | 22,469 | 14,883 | 33.76% |
| UTF-8 bytes | 22,475 | 14,883 | 33.78% |

The subsequently added `read_files` schema is reported separately at 183 tokens
and is not folded into this historical 24-tool before/after result.

### Singular-tool retirement

| Metric | 25 tools | 21 tools | Reduction |
| --- | ---: | ---: | ---: |
| Tokens | 3,341 | 2,712 | 18.83% |
| Characters | 15,701 | 12,759 | 18.74% |
| UTF-8 bytes | 15,701 | 12,759 | 18.74% |

The 629-token reduction comes from removing `read_file`, `write_file`,
`patch_file`, and `check_file_status` from the advertised schema. Their
permanent runtime migration errors remain server-side and therefore cost no
schema tokens.

The subsequently added `session_bootstrap` schema is reported separately by
the audit command at 157 tokens, preserving the historical 25→21 retirement
measurement. The complete current 22-tool schema measures 2,868 tokens.

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

An internal model evaluator received the complete 21-tool schema and ten fixed
requests covering each retired tool's replacement plus the issue-tool controls.
It chose the expected active tool in all 10/10 scenarios.
The structured evaluator result is checked in as
[`schema-routing-evaluation.json`](schema-routing-evaluation.json).

| Scenario | Expected | 21-tool result |
| --- | --- | --- |
| Read exact file contents | `read_files` | pass |
| Targeted edit in one file | `patch_multiple_files` | pass |
| Targeted edits in several files | `patch_multiple_files` | pass |
| Full-content write for one file | `push_multiple_files` | pass |
| Full-content writes for several files | `push_multiple_files` | pass |
| Check 20 file SHAs/sizes without content | `read_files` | pass |
| Read an issue and its comments | `read_issue` | pass |
| Update issue title and labels | `update_issue` | pass |
| Add an issue comment | `add_issue_comment` | pass |
| List filtered issues | `list_issues` | pass |

`npm run test:schema-routing` also guards the distinguishing routing signals in
these schemas.

After `session_bootstrap` was added, the same evaluator received the complete
22-tool schema and eight fixed requests. It selected `session_bootstrap` for
both startup requests and retained the expected tools for all six controls
(8/8); the checked-in evaluator artifact records both the historical and
current runs.

## Durable usage window

Schema profile splitting is deferred until the durable event store contains
either 30 days of production observations or 500 production tool calls.
Telemetry has no HTTP/dashboard read surface; run `npm run audit:tool-usage`
from the workspace for the per-tool/version summary and threshold readiness.