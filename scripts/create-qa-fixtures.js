'use strict';
// Creates disposable routes under dist/qa; a regular build removes them again.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('请先执行 npm run build');
const original = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const name of ['fallback', 'missing-map', 'missing-data']) {
    const folder = path.join(dist, 'qa', name);
    fs.mkdirSync(folder, {recursive: true});
    let page = original;
    if (name === 'missing-map') {
        for (const src of ['vendors/d3.min.js', 'vendors/topojson-client.min.js', 'data/world-110m.inline.js']) {
            page = page.replace(`    <script src="${src}" defer></script>\n`, '');
        }
    }
    if (name === 'missing-data') page = page.replace('    <script src="data/universities.inline.js" defer></script>\n', '');
    for (const file of ['favicon.svg', 'styles.css', 'vendors/d3.min.js', 'vendors/topojson-client.min.js', 'data/world-110m.inline.js', 'data/universities.inline.js', 'js/core.js', 'script.js']) {
        page = page.replaceAll(`"${file}"`, `"../../${file}"`);
    }
    fs.writeFileSync(path.join(folder, 'index.html'), page);
}
for (const width of [320, 390, 768]) {
    const folder = path.join(dist, 'qa', `viewport-${width}`);
    fs.mkdirSync(folder, {recursive: true});
    fs.writeFileSync(path.join(folder, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${width}px 响应式检查</title><body style="margin:0;padding:20px;background:#e2e9f2;font:13px sans-serif;color:#172b4d"><h1 style="font-size:16px;margin:0 0 12px">${width}px 视口（实际站点嵌入预览）</h1><iframe title="${width}px 大学探索页面" src="../../index.html?compare=" style="border:1px solid #b8c8dd;background:white;display:block;width:${width}px;height:844px"></iframe></body></html>`);
}
console.log('已创建 QA 路由：/qa/fallback/、/qa/missing-map/、/qa/missing-data/、/qa/viewport-{320,390,768}/。常规 build 会清除这些夹具。');
