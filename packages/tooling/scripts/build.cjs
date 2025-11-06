/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const distDir = path.join(root, '..', 'dist');
const srcFile = path.join(root, '..', 'src', 'config.js');
const distFile = path.join(distDir, 'config.js');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(srcFile, distFile);

console.log(`[tooling] copied ${path.relative(process.cwd(), srcFile)} -> ${path.relative(process.cwd(), distFile)}`);

