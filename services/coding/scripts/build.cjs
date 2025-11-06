/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(root, 'src', 'server.js'), path.join(distDir, 'server.js'));

console.log('[coding] build artifact written to dist/server.js');

