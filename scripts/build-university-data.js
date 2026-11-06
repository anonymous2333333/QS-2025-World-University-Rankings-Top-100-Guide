const fs = require('fs');
const path = require('path');

const SOURCE_MD = path.resolve(__dirname, '..', 'QS2025 top100.md');
const OUTPUT_JSON = path.resolve(__dirname, '..', 'data', 'universities.json');
const OUTPUT_INLINE = path.resolve(__dirname, '..', 'data', 'universities.inline.js');
const corrections = require('../data/rank-corrections.json');
const { sourceId, normalizeDataset } = require('../js/core.js');

const regionMap = {
    '美国': '北美',
    '加拿大': '北美',
    '英国': '欧洲',
    '法国': '欧洲',
    '德国': '欧洲',
    '瑞士': '欧洲',
    '荷兰': '欧洲',
    '瑞典': '欧洲',
    '丹麦': '欧洲',
    '比利时': '欧洲',
    '爱尔兰': '欧洲',
    '芬兰': '欧洲',
    '西班牙': '欧洲',
    '葡萄牙': '欧洲',
    '意大利': '欧洲',
    '中国': '亚洲',
    '中国香港': '亚洲',
    '中国台湾': '亚洲',
    '新加坡': '亚洲',
    '韩国': '亚洲',
    '日本': '亚洲',
    '马来西亚': '亚洲',
    '印度': '亚洲',
    '澳大利亚': '大洋洲',
    '新西兰': '大洋洲',
    '阿根廷': '拉丁美洲',
    '巴西': '拉丁美洲',
    '智利': '拉丁美洲',
    '墨西哥': '拉丁美洲',
    '俄罗斯': '欧洲',
    '以色列': '中东',
    '沙特阿拉伯': '中东',
    '阿联酋': '中东'
};

const flagMap = {
    '美国': '🇺🇸',
    '英国': '🇬🇧',
    '中国': '🇨🇳',
    '中国香港': '🇭🇰',
    '中国台湾': '🇹🇼',
    '新加坡': '🇸🇬',
    '瑞士': '🇨🇭',
    '加拿大': '🇨🇦',
    '法国': '🇫🇷',
    '德国': '🇩🇪',
    '澳大利亚': '🇦🇺',
    '韩国': '🇰🇷',
    '日本': '🇯🇵',
    '荷兰': '🇳🇱',
    '瑞典': '🇸🇪',
    '丹麦': '🇩🇰',
    '比利时': '🇧🇪',
    '爱尔兰': '🇮🇪',
    '新西兰': '🇳🇿',
    '阿根廷': '🇦🇷',
    '巴西': '🇧🇷',
    '智利': '🇨🇱',
    '俄罗斯': '🇷🇺',
    '墨西哥': '🇲🇽',
    '马来西亚': '🇲🇾',
    '以色列': '🇮🇱',
    '沙特阿拉伯': '🇸🇦',
    '阿联酋': '🇦🇪',
    '芬兰': '🇫🇮',
    '意大利': '🇮🇹',
    '葡萄牙': '🇵🇹',
    '西班牙': '🇪🇸'
};

function ensureOutputDir() {
    const dir = path.dirname(OUTPUT_JSON);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function parseTable(block) {
    const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('|'));
    const dataLines = lines.filter(line => /\|\s*\d+\s*\|/.test(line));
    return dataLines.map(line => {
        const columns = line
            .slice(1, -1).split('|')
            .map(col => col.trim());
        const [rankStr, nameRaw = '', countryRaw = '', highlightRaw = ''] = columns;
        const rank = parseInt(rankStr, 10);
        let nameEn = '';
        let nameZh = nameRaw;
        const match = nameRaw.match(/(.+?)（(.+?)）/);
        if (match) {
            nameZh = match[1].trim();
            nameEn = match[2].trim();
        } else {
            nameZh = nameRaw.trim();
        }
        return {
            rank,
            nameZh,
            nameEn,
            country: countryRaw.replace(/\s+/g, ''),
            highlight: highlightRaw.replace(/\s+/g, ' ').trim()
        };
    });
}

function extractSectionBodies(content, entries = []) {
    const sections = {};
    const headings = [...content.matchAll(/^##\s+(?:\*\*)?(\d+)\.\s*([^\n]*)\n/gm)];
    for (let index = 0; index < headings.length; index++) {
        const match = headings[index];
        // Some source headings are bold and two are numbered 94. Match names first
        // so UNAM's chapter can never overwrite Moscow State University's chapter.
        const entry = entries.filter(row => match[2].includes(row.nameZh)).sort((a, b) => b.nameZh.length - a.nameZh.length)[0];
        const rank = entry ? entry.rank : parseInt(match[1], 10);
        if (sections[rank]) throw new Error(`重复的院校章节：${rank}`);
        const body = content.slice(match.index + match[0].length, headings[index + 1]?.index ?? content.length).trim();
        const historyMatch = body.match(/\*\*历史背景与学科优势[^\n]*\*\*:?([\s\S]*?)(?=\n\s*\*\*参观攻略|\n\s*---|$)/);
        const visitMatch = body.match(/\*\*参观攻略[^\n]*\*\*:?([\s\S]*?)(?=\n\s*---|$)/);
        const clean = (text = '') => text
            .replace(/^-{3,}$/gm, '')
            .replace(/\r/g, '')
            .replace(/^[：:\s]+/, '')
            .trim();
        sections[rank] = {
            history: clean(historyMatch ? historyMatch[1] : ''),
            visit: clean(visitMatch ? visitMatch[1] : '')
        };
    }
    return sections;
}

function enrichEntry(entry, details) {
    const region = regionMap[entry.country] || '其他';
    const flag = flagMap[entry.country] || '🌐';
    const history = (details?.history || '').trim();
    const visit = (details?.visit || '').trim();
    return {
        id: sourceId(entry.rank),
        sourceIndex: entry.rank,
        rank: corrections.ranksBySourceIndex[entry.rank] || entry.rank,
        name: corrections.namesBySourceIndex[entry.rank]?.name || entry.nameZh,
        nameEn: corrections.namesBySourceIndex[entry.rank]?.nameEn || entry.nameEn,
        country: entry.country,
        region,
        flag,
        highlight: entry.highlight,
        history,
        visit
    };
}

function buildDataset(source = fs.readFileSync(SOURCE_MD, 'utf-8')) {
    const raw = source.replace(/\r\n?/g, '\n');
    const tableStart = raw.indexOf('| 排名');
    const tableEnd = raw.indexOf('\n\n## 1.');
    if (tableStart === -1 || tableEnd === -1) {
        throw new Error('无法定位Markdown中的表格或详细章节');
    }
    const tableBlock = raw.slice(tableStart, tableEnd);
    const sectionsContent = raw.slice(tableEnd);

    const tableEntries = parseTable(tableBlock);
    const sectionDetails = extractSectionBodies(sectionsContent, tableEntries);

    const dataset = tableEntries.map(entry => enrichEntry(entry, sectionDetails[entry.rank]));

    if (dataset.length !== 100 || normalizeDataset(dataset).length !== 100 ||
        new Set(dataset.map(row => row.sourceIndex)).size !== 100 ||
        dataset.some(row => row.sourceIndex < 1 || row.sourceIndex > 100 || !row.history || !row.visit)) {
        throw new Error('数据不完整：须包含 100 个独立编号和完整的历史、参访章节；不会覆盖现有输出');
    }

    const missingNameEn = dataset.filter(item => !item.nameEn);
    if (missingNameEn.length) {
        console.warn('以下院校缺少英文名称，请在JSON中手动补充:', missingNameEn.map(item => `${item.rank}-${item.name}`));
    }

    const missingRegion = dataset.filter(item => !regionMap[item.country]);
    if (missingRegion.length) {
        console.warn('以下院校缺少地区映射:', [...new Set(missingRegion.map(item => item.country))]);
    }

    return dataset;
}

function main() {
    ensureOutputDir();
    const dataset = buildDataset();
    const serialized = JSON.stringify(dataset, null, 2);
    // Generate both channels from one serialization. Validate before writing either output.
    fs.writeFileSync(OUTPUT_JSON + '.tmp', serialized + '\n', 'utf-8');
    fs.writeFileSync(OUTPUT_INLINE + '.tmp', 'window.__QS_UNIVERSITIES__ = ' + serialized + ';\n', 'utf-8');
    fs.renameSync(OUTPUT_JSON + '.tmp', OUTPUT_JSON);
    fs.renameSync(OUTPUT_INLINE + '.tmp', OUTPUT_INLINE);
    console.log(`已同步生成 ${dataset.length} 条院校数据（JSON + 离线脚本），保留并列名次。`);
}

if (require.main === module) main();
module.exports = { parseTable, extractSectionBodies, buildDataset };
