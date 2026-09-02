const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.join(__dirname, 'dist');
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

console.log('Building extension scripts with esbuild...');
execSync('npx esbuild src/popup.ts --bundle --format=iife --platform=browser --outfile=dist/popup.js', { stdio: 'inherit' });
execSync('npx esbuild src/content.ts --bundle --format=iife --platform=browser --outfile=dist/content.js', { stdio: 'inherit' });

console.log('Copying static extension assets...');
fs.copyFileSync(path.join(__dirname, 'popup.html'), path.join(dist, 'popup.html'));
fs.copyFileSync(path.join(__dirname, 'manifest.json'), path.join(dist, 'manifest.json'));

console.log('Browser extension built successfully in dist/');
