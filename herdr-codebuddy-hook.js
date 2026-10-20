#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

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
  }

}

main().catch(() => {});
