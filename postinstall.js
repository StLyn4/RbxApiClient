const fs = require('fs');
const { execSync } = require('child_process');

if (!fs.existsSync('./.dev')) {
  execSync(
    'node build.js',
    { stdio: 'inherit' }
  );

  if (fs.existsSync('./build.js')) fs.unlinkSync('./build.js');
  if (fs.existsSync('./postinstall.js')) fs.unlinkSync('./postinstall.js');

  execSync('npm uninstall axios-concurrency js-beautify rimraf');
}
