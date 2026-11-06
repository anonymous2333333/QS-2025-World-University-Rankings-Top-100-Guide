'use strict';
// Optional static export for GitHub Pages or other static hosts. No packages required.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const staging = path.join(root, 'dist.tmp');
const files = ['index.html', 'styles.css', 'script.js', 'favicon.svg', 'js', 'data', 'vendors', 'QS2025 top100.md'];
files.forEach(file => { if (!fs.existsSync(path.join(root, file))) throw new Error(`缺少必要文件：${file}`); });
fs.rmSync(staging, {recursive: true, force: true});
fs.mkdirSync(staging, {recursive: true});
files.forEach(file => fs.cpSync(path.join(root, file), path.join(staging, file), {recursive: true}));
fs.rmSync(dist, {recursive: true, force: true});
fs.renameSync(staging, dist);
console.log('静态站点已导出到 dist/');
