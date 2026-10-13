# herdr-codebuddy

CodeBuddy hooks report session state to Herdr. This adds no Herdr process or screen detection.

| CodeBuddy event | Herdr report |
| --- | --- |
| `SessionStart` | `idle`, with `session_id` when available |
| `UserPromptSubmit` | `working` |
| `Stop` | `idle` |
| `Notification` (`permission_prompt`) | `blocked` |
| `SessionEnd` | release the agent |

The hook reports only when CodeBuddy runs in a Herdr pane and `HERDR_ENV`, `HERDR_PANE_ID`, and `HERDR_BIN_PATH` are set. It requires `node` on `PATH`. State reports run asynchronously; failures do not block CodeBuddy. On session start and stop, a background task copies CodeBuddy's terminal title to the Herdr pane name, which is shown in the sidebar. It reads `terminal_title_stripped` from `herdr agent get` and leaves the pane unchanged if the title is empty. Tab names are not changed. Automatic updates can replace a pane name set manually in Herdr. The `--seq` value is the current time in milliseconds, so events in the same millisecond may share a value.

## Install

Requirements: `curl`, Node.js, and CodeBuddy.

```sh
curl -fsSL https://raw.githubusercontent.com/Ziy1-Tan/herdr-codebuddy/main/install.sh | sh
```

The script downloads the installer and hook to a temporary directory; it does not clone the repository. The installer adds hooks to `~/.codebuddy/settings.json`, backs up the file if it changes, and copies the hook to `~/.codebuddy/hooks/`. Existing hooks are retained. Restart CodeBuddy after installation.

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/Ziy1-Tan/herdr-codebuddy/main/install.sh | sh -s -- uninstall
```

For a local checkout, run `node install.js install` or `node install.js uninstall`.

## Test

```sh
npm test
```

## Limitations

- No Herdr process detection or screen-state manifest.
- No Herdr restart recovery command; CodeBuddy resume support has not been verified.
- Permission notifications use a generic message; the original notification text is not forwarded.
- Hook names and settings follow [discussion #3981](https://github.com/herdrdev/herdr/discussions/3981), which reports a live test with CodeBuddy 2.150.0. This repo's tests cover sample event payloads and mocked Herdr commands, not an interactive CodeBuddy session.

Reference: [Add Herdr support to your agent](https://herdr.dev/docs/add-herdr-support/).
