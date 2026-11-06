'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function buildPhotoCredits(media = require('../data/campus-media.json')) {
    const cell = text => String(text || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    return '# 校园照片署名与许可\n\n' +
        '本项目使用真实校园照片。原图来自 Wikimedia Commons，逐张保留原图页面、作者和许可；请以原始文件页面的完整许可说明为准。图片不适用项目代码的许可。\n\n' +
        `资料核对日期：${media.reviewedOn}。共 ${media.photos.length} 张，覆盖 100 所学校，其中 20 所各有 3 张。照片拍摄时间见原图页面，不代表实时开放状态。\n\n` +
        '本站派生文件经过缩放、移除元数据并转为 WebP，未改变场景内容；采用与对应原图相同的许可。CC BY-SA 图片的派生文件继续按对应的相同方式共享许可提供。请同时保留原作者、原始来源、许可链接及修改说明。\n\n' +
        '| 学校 / 照片 | 图示校区或地点 | 摄影 / 作者 | 原始来源 | 许可 | 本站文件 |\n| --- | --- | --- | --- | --- | --- |\n' +
        media.photos.map(p => `| ${cell(p.schoolName)} · ${cell(p.title)} | ${cell(p.campus)} | ${cell(p.author)} | [${cell(p.file)}](${p.sourceUrl}) | [${cell(p.license)}](${p.licenseUrl}) | [${p.id}](${p.path}) |`).join('\n') + '\n';
}
if (require.main === module) {
    fs.writeFileSync(path.join(root, 'IMAGE_CREDITS.md'), buildPhotoCredits());
    console.log('已同步生成 140 张校园照片的署名与许可');
}
module.exports = {buildPhotoCredits};
