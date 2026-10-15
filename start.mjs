import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

function fail(message) {
  console.error(message);
  process.exit(1);
}
const password = process.env.OPENCODE_SERVER_PASSWORD;
if (!password || password.length < 24) {
  fail('Set OPENCODE_SERVER_PASSWORD to a unique password of at least 24 characters.');
}
const portText = process.env.PORT || process.env.SERVER_PORT || '4096';
const port = Number(portText);
if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
  fail('PORT (or SERVER_PORT) must be an integer between 1 and 65535.');
}
const project = resolve(process.env.OPENCODE_PROJECT_DIR || process.cwd());
if (!existsSync(project)) fail('OPENCODE_PROJECT_DIR does not exist.');
const state = resolve(process.env.OPENCODE_DATA_DIR || '.opencode-data');
const env = {
  ...process.env,
  OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME || 'opencode',
  OPENCODE_CONFIG: resolve('opencode.json'),
  XDG_DATA_HOME: join(state, 'data'),
  XDG_STATE_HOME: join(state, 'state'),
  XDG_CACHE_HOME: join(state, 'cache'),
  XDG_CONFIG_HOME: join(state, 'config')
};
for (const key of ['XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']) {
  mkdirSync(env[key], { recursive: true, mode: 0o700 });
}
const binary = resolve('node_modules/.bin/opencode');
if (!existsSync(binary)) fail('OpenCode is missing. Install dependencies with npm ci.');
console.log(`Starting authenticated OpenCode on 0.0.0.0:${port}`);
console.log(`Project: ${project}; state: ${state}`);
console.log('WARNING: Tools auto-approved. Use a dedicated isolated workload and HTTPS.');
const child = spawn(binary, ['serve', '--hostname', '0.0.0.0', '--port', String(port)], {
  cwd: project, env, stdio: 'inherit'
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => fail(`Cannot start OpenCode: ${error.message}`));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
