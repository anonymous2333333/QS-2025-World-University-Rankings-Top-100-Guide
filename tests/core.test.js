'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../js/core.js');
const {buildDataset, parseTable, extractSectionBodies} = require('../scripts/build-university-data.js');
const data = require('../data/universities.json');
const rows = C.normalizeDataset(data);
const select = patch => C.filterUniversities(rows, {...C.DEFAULT_FILTERS, ...patch});
const sample = {rank: 1, name: '测试院校', nameEn: 'Test University', country: '中国', region: '亚洲'};
const storage = value => ({getItem: () => value, setItem() {}});

test('100 records have independent stable identifiers, even when ranks tie', () => {
    assert.equal(rows.length, 100);
    assert.equal(new Set(rows.map(row => row.id)).size, 100);
    assert.equal(rows.find(row => row.id === 'qs2025-033').rank, 32);
    assert.equal(rows.find(row => row.id === 'qs2025-032').rank, 32);
    assert.equal(select({rank: '11-50'}).length, 42);
    assert.equal(rows.find(row => row.id === 'qs2025-048').rank, 47);
});
test('all 100 biographies and visiting chapters are complete', () => {
    assert.ok(data.every(row => row.history.length > 30 && row.visit.length > 30));
    assert.match(data.find(row => row.sourceIndex === 58).history, /卡内基/);
    assert.match(data.find(row => row.sourceIndex === 94).history, /莫斯科/);
    assert.doesNotMatch(data.find(row => row.sourceIndex === 94).history, /墨西哥/);
    assert.match(data.find(row => row.sourceIndex === 95).history, /墨西哥/);
});
test('a rebuild matches both committed data channels exactly', () => {
    assert.deepEqual(buildDataset(), data);
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync('data/universities.inline.js', 'utf8'), context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.__QS_UNIVERSITIES__)), data);
});
test('generator accepts CRLF and preserves regenerated data', () => {
    const source = fs.readFileSync('QS2025 top100.md', 'utf8');
    assert.deepEqual(buildDataset(source.replace(/\r?\n/g, '\r\n')), data);
});
test('generator rejects missing rows and incomplete chapters before saving', () => {
    const source = fs.readFileSync('QS2025 top100.md', 'utf8');
    assert.throws(() => buildDataset(source.replace(/^\|\s*100\s*\|[^\n]*\n/m, '')), /数据不完整/);
    assert.throws(() => buildDataset('broken'), /无法定位/);
});
test('parser preserves empty table columns instead of shifting country and highlight', () => {
    const [row] = parseTable('| 1 | 测试（Test） | | 内容 |');
    assert.equal(row.country, ''); assert.equal(row.highlight, '内容');
});
test('bold headings and duplicate source numbering resolve by exact school identity', () => {
    const sections = extractSectionBodies('## **94. 学校甲**\n**历史背景与学科优势:**\n甲的历史\n**参观攻略:**\n甲的攻略\n## 94. 学校乙\n**历史背景与学科优势**：\n乙的历史\n**参观攻略**：\n乙的攻略\n', [{rank: 94, nameZh: '学校甲'}, {rank: 95, nameZh: '学校乙'}]);
    assert.equal(sections[94].history, '甲的历史');
    assert.equal(sections[95].history, '乙的历史');
});
test('generator does not attach UBC to the shorter Columbia University name', () => {
    assert.match(data.find(row => row.sourceIndex === 38).history, /UBC|不列颠/);
    assert.doesNotMatch(data.find(row => row.sourceIndex === 34).history, /UBC/);
});
test('invalid rows, field types and duplicates cannot crash normalization', () => {
    const normalized = C.normalizeDataset([null, [], 0, {}, {...sample, name: 44}, {...sample, rank: -1}, sample, {...sample, rank: 2}]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].history, '');
    assert.throws(() => C.normalizeDataset({}), /数组/);
    assert.throws(() => C.normalizeDataset([null]), /没有可用/);
});
test('stats are calculated from records and sum correctly', () => {
    assert.equal(new Set(rows.map(row => row.country)).size, 25);
    assert.equal(new Set(rows.map(row => row.region)).size, 5);
    assert.equal(rows.filter(row => row.country === '美国').length, 25);
});
test('Chinese, English abbreviations, diacritics and space-separated keywords search correctly', () => {
    assert.equal(select({q: ' MIT '})[0].id, 'qs2025-001');
    assert.ok(select({q: '香港'}).length === 5);
    assert.equal(select({q: 'ETH 瑞士'})[0].name, '苏黎世联邦理工学院');
    const accent = C.normalizeDataset([{...sample, nameEn: 'Université Test'}]);
    assert.equal(C.filterUniversities(accent, {...C.DEFAULT_FILTERS, q: 'universite'}).length, 1);
});
test('region, country, rank and subject filters combine and return only matching rows', () => {
    const result = select({region: '亚洲', country: '中国', rank: '11-50', subject: 'engineering'});
    assert.ok(result.length > 0);
    assert.ok(result.every(row => row.country === '中国' && row.rank >= 11 && row.rank <= 50 && row.subjects.includes('engineering')));
});
test('an impossible filter combination returns an empty array', () => {
    assert.equal(select({region: '欧洲', country: '中国'}).length, 0);
});
test('favorites are intersected with active filters', () => {
    const result = C.filterUniversities(rows, {...C.DEFAULT_FILTERS, country: '英国', favorites: true}, ['qs2025-001', 'qs2025-002']);
    assert.deepEqual(result.map(row => row.id), ['qs2025-002']);
});
test('sorting remains deterministic and never mutates the source', () => {
    const before = rows.map(row => row.id);
    assert.equal(select({sort: 'rank-desc'})[0].rank, 100);
    assert.equal(select({sort: 'rank-asc'})[0].rank, 1);
    assert.deepEqual(rows.map(row => row.id), before);
    assert.equal(select({sort: 'name'}).length, 100);
});
test('pagination clamps invalid or stale pages after filtering', () => {
    assert.equal(C.paginate(rows, 999).page, 9);
    assert.equal(C.paginate([], 3).page, 1);
    assert.equal(C.paginate([], 3).rows.length, 0);
    assert.equal(C.paginate(rows, -2).rows.length, 12);
    assert.equal(C.paginate(rows, 9).rows.length, 4);
});
test('URLs validate enums, cap input and discard nonexistent schools', () => {
    const decoded = C.decodeState('?q=' + 'a'.repeat(200) + '&page=-1&sort=hack&view=hack&country=unknown&school=missing', rows);
    assert.equal(decoded.filters.q.length, 160);
    assert.equal(decoded.filters.page, 1);
    assert.equal(decoded.filters.sort, 'rank-asc');
    assert.equal(decoded.filters.country, 'all');
    assert.equal(decoded.detail, null);
});
test('URL state round-trips a school with tied rank and a comparison list', () => {
    const filters = {...C.DEFAULT_FILTERS, q: '浙江', region: '亚洲', country: '中国', page: 2, view: 'list', favorites: true};
    const search = C.encodeState(filters, 'qs2025-048', ['qs2025-047', 'qs2025-048']);
    const decoded = C.decodeState(search, rows);
    assert.deepEqual(decoded.filters, filters);
    assert.equal(decoded.detail, 'qs2025-048');
    assert.deepEqual(decoded.compare, ['qs2025-047', 'qs2025-048']);
});
test('an explicitly empty comparison URL clears storage, while no parameter preserves it', () => {
    assert.deepEqual(C.decodeState('?compare=', rows).compare, []);
    assert.equal(C.decodeState('', rows).compare, null);
});
test('comparison links cap, deduplicate and drop stale IDs', () => {
    const ids = rows.slice(0, 6).map(row => row.id);
    const decoded = C.decodeState('?compare=' + ['missing', ...ids, ids[0]].join(','), rows);
    assert.deepEqual(decoded.compare, ids.slice(0, 4));
});
test('corrupt JSON, absent storage and wrong preference versions are handled', () => {
    assert.equal(C.readPreferences(storage('{broken'), rows).available, false);
    assert.deepEqual(C.readPreferences(storage(null), rows).favorites, []);
    assert.deepEqual(C.readPreferences(storage('{"version":1,"favorites":["qs2025-001"]}'), rows).favorites, []);
    const blocked = {getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }};
    assert.equal(C.readPreferences(blocked, rows).available, false);
    assert.equal(C.savePreferences(blocked, {favorites: [], compare: [], theme: 'dark'}), false);
});
test('stale and invalid persisted IDs are discarded', () => {
    const prefs = C.readPreferences(storage(JSON.stringify({version: 2, favorites: ['qs2025-001', null, 'old', 'qs2025-001'], compare: rows.slice(0, 7).map(row => row.id), theme: 'invalid'})), rows);
    assert.deepEqual(prefs.favorites, ['qs2025-001']);
    assert.equal(prefs.compare.length, 4);
    assert.equal(prefs.theme, 'system');
});
test('preference writes include a version and exclude transient UI state', () => {
    let saved;
    const result = C.savePreferences({setItem(key, value) { assert.equal(key, C.STORAGE_KEY); saved = JSON.parse(value); }}, {favorites: ['qs2025-001'], compare: [], theme: 'dark', q: 'private query'});
    assert.equal(result, true);
    assert.deepEqual(Object.keys(saved).sort(), ['compare', 'favorites', 'theme', 'version']);
});
test('HTML metacharacters are always escaped including attributes', () => {
    assert.equal(C.escapeHTML('<img onerror="alert(1)">&\''), '&lt;img onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});
test('CSV includes a UTF-8 BOM, quoted newlines and escaped quotes', () => {
    const csv = C.toCSV([{...sample, highlight: 'a,"b"\nc'}]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"a,""b""\nc"'));
});
test('CSV blocks spreadsheet formulas even after leading whitespace and control characters', () => {
    for (const name of ['=1+1', '+SUM(A1)', '-2+4', '@SUM(A1)', ' \t=HYPERLINK("bad")']) {
        const csv = C.toCSV([{...sample, name}]);
        assert.ok(csv.includes('"\''));
    }
});
test('online loading validates a complete response', async () => {
    const loaded = await C.loadDataset({fetcher: async () => ({ok: true, json: async () => data}), fallback: []});
    assert.equal(loaded.source, 'network'); assert.equal(loaded.rows.length, 100);
});
test('HTTP, JSON, schema and partial-response failures fall back to complete inline data', async () => {
    const fetchers = [
        async () => ({ok: false, status: 503}),
        async () => ({ok: true, json: async () => { throw new Error('Invalid JSON'); }}),
        async () => ({ok: true, json: async () => ({broken: true})}),
        async () => ({ok: true, json: async () => data.slice(0, 3)}),
        async () => { throw new Error('Network Error'); }
    ];
    for (const fetcher of fetchers) {
        const result = await C.loadDataset({fetcher, fallback: data});
        assert.equal(result.source, 'fallback'); assert.equal(result.rows.length, 100);
    }
});
test('a hung request times out even when the transport ignores AbortSignal', async () => {
    const result = await C.loadDataset({fetcher: () => new Promise(() => {}), fallback: data, timeoutMs: 10});
    assert.equal(result.source, 'fallback'); assert.equal(result.rows.length, 100);
});
test('file protocol uses inline data without attempting fetch', async () => {
    let requested = false;
    const result = await C.loadDataset({fetcher: () => { requested = true; throw new Error('CORS'); }, fallback: data, preferInline: true});
    assert.equal(requested, false); assert.equal(result.source, 'inline');
});
test('both data channels failing gives a recoverable, actionable error', async () => {
    await assert.rejects(C.loadDataset({fetcher: async () => { throw new Error('offline'); }, fallback: []}), /data 文件夹后重试/);
});
test('astronomy does not produce a false literature subject tag', () => {
    const caltech = rows.find(row => row.id === 'qs2025-010');
    assert.ok(caltech.subjects.includes('science'));
    assert.ok(!caltech.subjects.includes('humanities'));
});
