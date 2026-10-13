# herdr-codebuddy

This adapter reports CodeBuddy hook events to Herdr. It does not change Herdr or add process and screen detection.

| CodeBuddy event | Herdr state/action |
| --- | --- |
| `SessionStart` | `idle`; includes `session_id` when provided |
| `UserPromptSubmit` | `working` |
| `Stop` | `idle` |
| `Notification` (`permission_prompt`) | `blocked` |
| `SessionEnd` | `release-agent` |

The hook runs only inside a Herdr pane (`HERDR_ENV=1`, `HERDR_PANE_ID`, and `HERDR_BIN_PATH`). It requires Node.js on the hook command's `PATH`. Reporting failures do not interrupt CodeBuddy. Event ordering uses an epoch-millisecond `--seq`, so two reports in the same millisecond can share a sequence.

## Install

```sh
node install.js install
```

The installer adds hooks to `~/.codebuddy/settings.json`, backs up the existing file when it changes, and copies the hook to `~/.codebuddy/hooks/`. Restart CodeBuddy after installation. Existing unrelated hooks are retained.

## Uninstall

```sh
node install.js uninstall
```

## Test

```sh
npm test
```

## Limitations

- No Herdr process detection or screen-state manifest.
- No Herdr restart recovery command; CodeBuddy resume support has not been verified.
- Renaming a pane in Herdr still updates its sidebar label. This adapter does not automatically copy CodeBuddy's terminal title to the Herdr pane/tab, as the hook in [discussion #3981](https://github.com/herdrdev/herdr/discussions/3981) does.
- Permission notifications use a generic message; the original notification text is not forwarded.
- Uses the hook event names and settings format shown in discussion #3981. Real-session testing is still needed.

Reference: [Add Herdr support to your agent](https://herdr.dev/docs/add-herdr-support/).
