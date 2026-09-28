/**
 * Runs the API server and the Vite dev server together with prefixed output,
 * so `npm run dev:all` is the single command for local development.
 */
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const procs = [];

function start(label, command, args, colour) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows
  });

  const prefix = `\x1b[${colour}m[${label}]\x1b[0m `;
  const forward = stream => {
    let buffer = '';
    stream.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) process.stdout.write(prefix + line + '\n');
      }
    });
  };
  forward(child.stdout);
  forward(child.stderr);

  child.on('exit', code => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
    shutdown(code ?? 0);
  });

  procs.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of procs) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('api', npm, ['run', 'server'], '36');
start('web', npm, ['run', 'dev'], '35');
