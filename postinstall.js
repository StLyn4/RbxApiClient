import fs from 'fs';
import { execSync } from 'child_process';

if (!fs.existsSync('./.dev')) {
  execSync(
    'node build.js',
    { stdio: 'inherit' }
  );

  if (fs.existsSync('./build.js')) fs.unlinkSync('./build.js');
  if (fs.existsSync('./postinstall.js')) fs.unlinkSync('./postinstall.js');

  execSync('npm uninstall axios-concurrency js-beautify rimraf');
}
