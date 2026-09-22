const fs = require('fs');
const path = require('path');

const SOURCE_MD = path.resolve(__dirname, '..', 'QS2025 top100.md');
const OUTPUT_JSON = path.resolve(__dirname, '..', 'data', 'universities.json');

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
    '丹麦': '欧洲',
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
            .split('|')
            .map(col => col.trim())
            .filter(Boolean);
        const [rankStr, nameRaw = '', countryRaw = '', highlightRaw = ''] = columns;
        const rank = parseInt(rankStr, 10);
        let name = nameRaw;
        let nameEn = '';
        let nameZh = nameRaw;
        const match = nameRaw.match(/(.+?)[（(](.+?)[）)]/);
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

function extractSectionBodies(content) {
    const sections = {};
    const sectionRegex = /##\s+(\d+)\.[^\n]*\n([\s\S]*?)(?=\n##\s+\d+\.|$)/g;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
        const rank = parseInt(match[1], 10);
        const body = match[2].trim();
        const historyMatch = body.match(/\*\*历史背景与学科优势[^\n]*\*\*:?([\s\S]*?)(?=\n\s*\*\*参观攻略|\n\s*---|$)/);
        const visitMatch = body.match(/\*\*参观攻略[^\n]*\*\*:?([\s\S]*?)(?=\n\s*---|$)/);
        const clean = (text = '') => text
            .replace(/^-{3,}$/gm, '')
            .replace(/\r/g, '')
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
        rank: entry.rank,
        name: entry.nameZh,
        nameEn: entry.nameEn,
        country: entry.country,
        region,
        flag,
        highlight: entry.highlight,
        history,
        visit
    };
}

function buildDataset() {
    const raw = fs.readFileSync(SOURCE_MD, 'utf-8');
    const tableStart = raw.indexOf('| 排名');
    const tableEnd = raw.indexOf('\n\n## 1.');
    if (tableStart === -1 || tableEnd === -1) {
        throw new Error('无法定位Markdown中的表格或详细章节');
    }
    const tableBlock = raw.slice(tableStart, tableEnd);
    const sectionsContent = raw.slice(tableEnd);

    const tableEntries = parseTable(tableBlock);
    const sectionDetails = extractSectionBodies(sectionsContent);

    const dataset = tableEntries.map(entry => enrichEntry(entry, sectionDetails[entry.rank]));

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

function validateDataset(dataset) {
    const errors = [];
    const warnings = [];
    const rankSet = new Set();
    const duplicateRanks = [];
    const missingRequired = [];
    const missingNarratives = [];

    for (const item of dataset) {
        if (!Number.isInteger(item.rank) || item.rank <= 0) {
            errors.push(`存在非法排名: ${item.rank}`);
        }
        if (rankSet.has(item.rank)) {
            duplicateRanks.push(item.rank);
        }
        rankSet.add(item.rank);

        if (!item.name || !item.country) {
            missingRequired.push(`${item.rank}-${item.name || '未命名'}`);
        }

        if (!item.history || !item.visit) {
            missingNarratives.push(`${item.rank}-${item.name}`);
        }
    }

    if (duplicateRanks.length) {
        errors.push(`存在重复排名: ${[...new Set(duplicateRanks)].join(', ')}`);
    }

    if (dataset.length !== 100) {
        warnings.push(`当前数据条数为 ${dataset.length}，预期应为 100。`);
    }

    if (missingRequired.length) {
        errors.push(`存在缺少必填字段（name/country）的院校: ${missingRequired.join(', ')}`);
    }

    if (missingNarratives.length) {
        warnings.push(`以下院校缺少历史背景或参观攻略: ${missingNarratives.join(', ')}`);
    }

    warnings.forEach(msg => console.warn(`[WARN] ${msg}`));
    if (errors.length) {
        throw new Error(errors.join('\n'));
    }
}

function main() {
    try {
        ensureOutputDir();
        const dataset = buildDataset();
        validateDataset(dataset);
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(dataset, null, 2), 'utf-8');
        console.log(`已生成 ${dataset.length} 条院校数据 -> ${OUTPUT_JSON}`);
    } catch (error) {
        console.error('构建高校数据失败:');
        console.error(error.message || error);
        process.exitCode = 1;
    }
}

main();
