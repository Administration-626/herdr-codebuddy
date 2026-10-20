# herdr-codebuddy

[![test](https://github.com/Ziy1-Tan/herdr-codebuddy/actions/workflows/test.yml/badge.svg)](https://github.com/Ziy1-Tan/herdr-codebuddy/actions/workflows/test.yml)

CodeBuddy hooks report session state to Herdr. This adds no Herdr process or screen detection.

| CodeBuddy event | Herdr report |
| --- | --- |
| `SessionStart` (`startup`, `resume`, `clear`) | `idle`, with the session ID and `codebuddy --resume` command when available |
| `SessionStart` (`compact`) | `working` — the turn continues after compaction |
| `UserPromptSubmit` | `working` |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | `working` |
| `Stop` | `idle` |
| `Notification` (`permission_prompt`) | `blocked`, with the event's message |
| `SessionEnd` | release the agent |

The tool events keep the reported state honest: approving a permission
prompt otherwise left the pane reported as `blocked` until `Stop`. The
failure event covers a tool that fails or is interrupted after approval.

## Observed Herdr-side behavior

Verified on Linux with Herdr 0.9.5 and CodeBuddy 2.170.0:

- After `Stop` reports `idle`, Herdr itself advances the pane to `done` once
  it settles, so `herdr agent list` and the sidebar show `done` (not `idle`)
  between turns. The hook only ever reports `idle`; `done` is Herdr's own
  completion detection on top.
- Multiple CodeBuddy instances in different panes report concurrently
  without interference — each hook reports only its own `HERDR_PANE_ID`.
- Hook stdin arrives as single-line JSON with `hook_event_name`, matching
  the Claude Code hook schema.

## Install

Requirements: `curl`, Node.js, and CodeBuddy.

```sh
curl -fsSL https://raw.githubusercontent.com/Ziy1-Tan/herdr-codebuddy/main/install.sh | sh
```

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/Ziy1-Tan/herdr-codebuddy/main/install.sh | sh -s -- uninstall
```


For a local checkout, run `node install.js install` or `node install.js uninstall`.

## Test

```sh
npm test
```

Reference: [Add Herdr support to your agent](https://herdr.dev/docs/add-herdr-support/).
