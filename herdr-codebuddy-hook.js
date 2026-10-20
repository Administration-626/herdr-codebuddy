#!/usr/bin/env node
'use strict';

const { spawn, execFile } = require('node:child_process');

const EVENT_STATES = {
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  // PreToolUse runs before the permission prompt; the tool events that follow
  // clear a 'blocked' left by an approved prompt, and the next tool call's
  // PreToolUse recovers after a denied one instead of holding it until Stop.
  PreToolUse: 'working',
  PostToolUse: 'working',
  PostToolUseFailure: 'working',
  Stop: 'idle',
  Notification: 'blocked',
};

// CodeBuddy sets its OSC terminal title to the current task; copy it to the pane
// and tab labels so multi-agent fleets show what each CodeBuddy is doing.
// Fire-and-forget: every failure is swallowed and the whole sync is capped at 2s.
function syncTitle(herdr, pane) {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 2000);
    execFile(herdr, ['agent', 'get', pane], { timeout: 2000, windowsHide: true }, (error, stdout) => {
      if (error) return done();
      let info;
      try {
        info = JSON.parse(stdout).result;
      } catch {
        return done();
      }
      const title = typeof info.terminal_title_stripped === 'string' ? info.terminal_title_stripped.trim() : '';
      const tabId = typeof info.tab_id === 'string' ? info.tab_id : '';
      if (!title || /[\x00-\x1f]/.test(title)) return done();
      const renames = [['pane', 'rename', pane, title]];
      if (tabId) renames.push(['tab', 'rename', tabId, title]);
      for (const renameArgs of renames) {
        const child = spawn(herdr, renameArgs, { detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', () => {});
        child.unref();
      }
      done();
    });
  });
}

async function main() {
  const { HERDR_ENV, HERDR_PANE_ID, HERDR_BIN_PATH } = process.env;
  if (HERDR_ENV !== '1' || !HERDR_PANE_ID || !HERDR_BIN_PATH) return;

  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return;
  }

  const name = event.hook_event_name || event.event;
  const release = name === 'SessionEnd';
  if (!release && !Object.hasOwn(EVENT_STATES, name)) return;
  if (name === 'Notification' && event.notification_type !== 'permission_prompt') return;

  // Compaction keeps the session and runs mid-turn, before the agent continues,
  // so the pane is working; /clear starts a new, empty session and is idle.
  const state = name === 'SessionStart' && event.source === 'compact' ? 'working' : EVENT_STATES[name];

  const args = [
    'pane', release ? 'release-agent' : 'report-agent', HERDR_PANE_ID,
    '--source', 'custom:codebuddy',
    '--agent', 'codebuddy',
    '--seq', String(Date.now()),
  ];

  if (!release) args.push('--state', state);
  if (name === 'SessionStart' && typeof event.session_id === 'string'
      && /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(event.session_id)) {
    args.push(
      '--agent-session-id', event.session_id,
      '--', 'codebuddy', '--resume', event.session_id,
    );
  }
  if (name === 'Notification') args.push('--message', event.message || 'CodeBuddy permission required');

  if (process.env.HERDR_CODEBUDDY_DRY_RUN === '1') {
    console.log(JSON.stringify({ binary: HERDR_BIN_PATH, args }));
  } else {
    const child = spawn(HERDR_BIN_PATH, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    if (name === 'SessionStart' || name === 'Stop') {
      await syncTitle(HERDR_BIN_PATH, HERDR_PANE_ID);
    }
  }

}

main().catch(() => {});
