const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '..', 'data', 'universities.json');

function fail(message) {
    console.error(`[SMOKE CHECK FAILED] ${message}`);
    process.exit(1);
}

function main() {
    if (!fs.existsSync(dataPath)) {
        fail(`未找到数据文件: ${dataPath}`);
    }

    let data = null;
    try {
        data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } catch (error) {
        fail(`数据文件 JSON 解析失败: ${error.message}`);
    }

    if (!Array.isArray(data)) {
        fail('universities.json 必须是数组');
    }

    if (!data.length) {
        fail('universities.json 为空');
    }

    const invalid = data.filter(item => !item || !Number.isInteger(item.rank) || !item.name || !item.country);
    if (invalid.length) {
        fail(`存在 ${invalid.length} 条缺少核心字段（rank/name/country）的记录`);
    }

    const ranks = data.map(item => item.rank);
    const hasDuplicateRank = new Set(ranks).size !== ranks.length;
    if (hasDuplicateRank) {
        fail('存在重复 rank');
    }

    console.log(`[SMOKE CHECK PASSED] 共 ${data.length} 条院校数据，结构校验通过。`);
}

main();
