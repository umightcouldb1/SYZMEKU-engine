const { spawnSync } = require('child_process');
const path = require('path');

const themeArg = process.argv.find((arg) => arg.startsWith('--theme='));
const theme = themeArg ? themeArg.split('=')[1] : 'BigSis_Fusion';

if (theme !== 'BigSis_Fusion') {
  console.error(`Unsupported theme: ${theme}`);
  process.exit(1);
}

const buildCommand = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const buildArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm.cmd run build']
  : ['run', 'build'];

const result = spawnSync(buildCommand, buildArgs, {
  cwd: path.resolve(__dirname, '..', 'client'),
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log('Dashboard status: [FUSION_ACTIVE]');
console.log('Identity Persona: [Jarvis: 1.0 | Griot: 1.0 | SAM: 1.0 | Ironheart: 1.0]');
