const { spawn } = require('child_process');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const commands = [
  {
    name: 'api',
    args: ['run', 'dev:server'],
    env: {
      PORT: process.env.PORT || '5000',
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
  },
  {
    name: 'client',
    args: ['run', 'dev:client'],
    env: {
      VITE_API_PROXY_TARGET: process.env.VITE_API_PROXY_TARGET || `http://localhost:${process.env.PORT || '5000'}`,
    },
  },
];

const children = commands.map(({ name, args, env }) => {
  const child = spawn(npmCmd, args, {
    env: { ...process.env, ...env },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code) => {
    if (code && !shuttingDown) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

let shuttingDown = false;

const shutdown = (code = 0) => {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
