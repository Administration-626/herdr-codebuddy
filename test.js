'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = __dirname;
const HOOK = path.join(ROOT, 'herdr-codebuddy-hook.js');
const INSTALLER = path.join(ROOT, 'install.js');
const BASE_ENV = {
  ...process.env,
  HERDR_ENV: '1',
  HERDR_PANE_ID: 'pane-test',
  HERDR_BIN_PATH: '/fake/herdr',
  HERDR_CODEBUDDY_DRY_RUN: '1',
};

function runHook(event, extra = {}, envOverrides = {}) {
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: event, ...extra }),
    encoding: 'utf8',
    env: { ...BASE_ENV, ...envOverrides },
  }).trim();
  return stdout ? JSON.parse(stdout) : null;
}

test('does not report outside a Herdr pane', () => {
  const result = runHook('UserPromptSubmit', {}, { HERDR_ENV: '', HERDR_PANE_ID: '' });
  assert.equal(result, null);
});

test('maps lifecycle and permission events to report-agent states', () => {
  const cases = [
    ['SessionStart', { session_id: 'session-abc' }, 'idle'],
    ['SessionStart', { session_id: 'session-compact', source: 'compact' }, 'working'],
    ['SessionStart', { session_id: 'session-clear', source: 'clear' }, 'idle'],
    ['UserPromptSubmit', {}, 'working'],
    ['PreToolUse', {}, 'working'],
    ['PostToolUse', {}, 'working'],
    ['PostToolUseFailure', {}, 'working'],
    ['Stop', {}, 'idle'],
    ['Notification', { notification_type: 'permission_prompt' }, 'blocked'],
  ];
  for (const [event, payload, state] of cases) {
    const result = runHook(event, payload);
    assert.equal(result.binary, '/fake/herdr');
    assert.deepEqual(result.args.slice(0, 3), ['pane', 'report-agent', 'pane-test']);
    assert.equal(result.args[result.args.indexOf('--state') + 1], state);
    assert.ok(result.args.includes('--source') && result.args.includes('custom:codebuddy'));
    assert.ok(result.args.includes('--agent') && result.args.includes('codebuddy'));
    assert.ok(Number(result.args[result.args.indexOf('--seq') + 1]) > 0);
    if (event === 'SessionStart') {
      assert.equal(result.args[result.args.indexOf('--agent-session-id') + 1], payload.session_id);
      assert.deepEqual(result.args.slice(result.args.indexOf('--') + 1), [
        'codebuddy', '--resume', payload.session_id,
      ]);
    }
  }
});

test('omits recovery data for invalid session IDs', () => {
  const result = runHook('SessionStart', { session_id: "bad'id" });
  assert.ok(!result.args.includes('--agent-session-id'));
  assert.ok(!result.args.includes('--'));
});

test('passes the permission message through and falls back to a default', () => {
  const withMessage = runHook('Notification', { notification_type: 'permission_prompt', message: 'Allow running rm -rf?' });
  assert.equal(withMessage.args[withMessage.args.indexOf('--message') + 1], 'Allow running rm -rf?');
  const fallback = runHook('Notification', { notification_type: 'permission_prompt' });
  assert.equal(fallback.args[fallback.args.indexOf('--message') + 1], 'CodeBuddy permission required');
});

test('releases the reported agent on SessionEnd', () => {
  const result = runHook('SessionEnd');
  assert.deepEqual(result.args.slice(0, 3), ['pane', 'release-agent', 'pane-test']);
  assert.ok(!result.args.includes('--state'));
});

test('ignores unrelated notifications and malformed JSON', () => {
  assert.equal(runHook('Notification', { notification_type: 'idle_prompt' }), null);
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: '{bad json',
    encoding: 'utf8',
    env: BASE_ENV,
  }).trim();
  assert.equal(stdout, '');
});

test('uninstall leaves settings alone when the adapter is absent', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-codebuddy-home-'));
  try {
    const settingsDir = path.join(home, '.codebuddy');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsFile = path.join(settingsDir, 'settings.json');
    const original = JSON.stringify({ theme: 'dark' });
    fs.writeFileSync(settingsFile, original);
    execFileSync(process.execPath, [INSTALLER, 'uninstall'], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
    });
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), original);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('installer keeps one backup of the hook it replaces', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-codebuddy-home-'));
  try {
    const settingsDir = path.join(home, '.codebuddy');
    const hooksDir = path.join(settingsDir, 'hooks');
    const hookFile = path.join(hooksDir, 'herdr-codebuddy-hook.js');
    const backupFile = `${hookFile}.bak`;
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const runInstaller = action => execFileSync(process.execPath, [INSTALLER, action], { env, encoding: 'utf8' });

    runInstaller('install');
    assert.ok(!fs.existsSync(backupFile));

    fs.appendFileSync(hookFile, '// local edit\n');
    const settingsFile = path.join(settingsDir, 'settings.json');
    assert.equal(runInstaller('install'), [
      `Replaced hook script ${hookFile} (backup: ${backupFile}).`,
      'Restart CodeBuddy to load them.',
    ].join('\n') + '\n');
    assert.ok(fs.readFileSync(backupFile, 'utf8').endsWith('// local edit\n'));
    assert.ok(!fs.readFileSync(hookFile, 'utf8').endsWith('// local edit\n'));

    assert.equal(runInstaller('install'), `Hooks already installed in ${settingsFile}.\nRestart CodeBuddy to load them.\n`);
    assert.deepEqual(fs.readdirSync(hooksDir).filter(name => name.endsWith('.bak')).sort(), ['herdr-codebuddy-hook.js.bak']);
    assert.ok(fs.readFileSync(backupFile, 'utf8').endsWith('// local edit\n'));

    runInstaller('uninstall');
    assert.ok(!fs.existsSync(hookFile));
    assert.ok(!fs.existsSync(backupFile));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('installer is idempotent and uninstall preserves unrelated hooks', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-codebuddy-home-'));
  try {
    const settingsDir = path.join(home, '.codebuddy');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsFile = path.join(settingsDir, 'settings.json');
    const original = {
      theme: 'dark',
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }],
      },
    };
    fs.writeFileSync(settingsFile, JSON.stringify(original, null, 2));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const runInstaller = action => execFileSync(process.execPath, [INSTALLER, action], { env, encoding: 'utf8' });

    const first = runInstaller('install');
    assert.match(first, /^Installed hooks in .*settings\.json \(backup: .*\.bak\)\.\nRestart CodeBuddy to load them\.\n$/);

    assert.equal(runInstaller('install'), `Hooks already installed in ${settingsFile}.\nRestart CodeBuddy to load them.\n`);
    const settingsBackups = fs.readdirSync(settingsDir).filter(name => /^settings\.json\.herdr-codebuddy-.*\.bak$/.test(name));
    assert.equal(settingsBackups.length, 1);

    const installed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.equal(installed.theme, 'dark');
    assert.equal(installed.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact');
    assert.equal(installed.hooks.Stop.length, 2);
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'Notification', 'SessionEnd']) {
      assert.equal(installed.hooks[event].filter(entry => entry.hooks?.some(hook => hook.command?.includes('herdr-codebuddy-hook.js'))).length, 1);
    }
    assert.ok(fs.existsSync(path.join(settingsDir, 'hooks', 'herdr-codebuddy-hook.js')));

    const removed = runInstaller('uninstall');
    assert.match(removed, /^Removed Herdr CodeBuddy hooks from .*settings\.json \(backup: .*\)\.\n$/);
    const uninstalled = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.equal(uninstalled.theme, 'dark');
    assert.equal(uninstalled.hooks.Stop.length, 1);
    assert.equal(uninstalled.hooks.Stop[0].hooks[0].command, 'echo user-hook');
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Notification', 'SessionEnd']) {
      assert.ok(!Object.hasOwn(uninstalled.hooks, event));
    }
    assert.ok(!fs.existsSync(path.join(settingsDir, 'hooks', 'herdr-codebuddy-hook.js')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
