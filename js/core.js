/* Pure, shared application logic. UMD keeps both file:// and Node tests build-free. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.QSCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const MAX_COMPARE = 4;
    const PAGE_SIZE = 12;
    const STORAGE_KEY = 'qs-explorer:v2';
    const DEFAULT_FILTERS = Object.freeze({q: '', region: 'all', country: 'all', rank: 'all', subject: 'all', sort: 'rank-asc', favorites: false, view: 'grid', page: 1});
    // These are text matches in the original guide, not official QS subject rankings.
    const SUBJECTS = Object.freeze({
        engineering: {label: '工程与技术', words: ['工程', '技术', '计算机', '人工智能', '电子', '材料', '机械', '航天']},
        science: {label: '自然科学', words: ['物理', '化学', '数学', '自然科学', '地球', '海洋', '环境']},
        health: {label: '医学与生命科学', words: ['医学', '生命', '生物', '药学', '健康', '农业']},
        humanities: {label: '人文与社会科学', words: ['人文', '文学', '历史', '哲学', '社会', '法律', '法学', '政治', '考古']},
        business: {label: '商科与经济', words: ['商学', '商科', '经济', '金融', '会计', '管理']}
    });
    const asText = (value, limit = 30000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
    const fold = value => asText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
    const sourceId = index => `qs2025-${String(index).padStart(3, '0')}`;

    function normalizeDataset(raw) {
        if (!Array.isArray(raw)) throw new Error('院校数据应为数组');
        const ids = new Set();
        const names = new Set();
        const rows = [];
        raw.forEach((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
            const rank = Number(entry.rank);
            const name = asText(entry.name, 200);
            if (!name || !Number.isInteger(rank) || rank < 1 || rank > 9999) return;
            const sourceIndex = Number.isInteger(entry.sourceIndex) && entry.sourceIndex > 0 ? entry.sourceIndex : index + 1;
            const id = /^[a-z0-9-]{1,80}$/.test(entry.id || '') ? entry.id : sourceId(sourceIndex);
            const identity = fold(name);
            if (ids.has(id) || names.has(identity)) return;
            ids.add(id);
            names.add(identity);
            const highlight = asText(entry.highlight || entry.highlights || entry.strengths, 2000);
            const row = {
                id, sourceIndex, rank, name, nameEn: asText(entry.nameEn, 250),
                country: asText(entry.country, 100) || '其他地区', region: asText(entry.region, 80) || '其他',
                flag: asText(entry.flag, 20) || '🌐', highlight,
                history: asText(entry.history).replace(/^[：:\s]+/, ''),
                visit: asText(entry.visit).replace(/^[：:\s]+/, '')
            };
            const subjectText = highlight;
            row.subjects = Object.keys(SUBJECTS).filter(key => SUBJECTS[key].words.some(word =>
                word === '文学' ? /(^|[^天])文学/.test(subjectText) : subjectText.includes(word)));
            row.searchText = fold([name, row.nameEn, row.country, row.region, highlight].join(' '));
            rows.push(row);
        });
        if (!rows.length) throw new Error('没有可用的院校记录');
        return rows.sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex);
    }

    function validEnum(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
    function sanitizeFilters(input = {}, rows = []) {
        const page = Number(input.page);
        const regions = ['all', ...new Set(rows.map(row => row.region))];
        const countries = ['all', ...new Set(rows.map(row => row.country))];
        return {
            q: asText(input.q, 160),
            region: validEnum(input.region, regions, 'all'), country: validEnum(input.country, countries, 'all'),
            rank: validEnum(input.rank, ['all', '1-10', '11-50', '51-100'], 'all'),
            subject: validEnum(input.subject, ['all', ...Object.keys(SUBJECTS)], 'all'),
            sort: validEnum(input.sort, ['rank-asc', 'rank-desc', 'name'], 'rank-asc'),
            favorites: input.favorites === true || input.favorites === '1',
            view: validEnum(input.view, ['grid', 'list'], 'grid'),
            page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000) : 1
        };
    }
    function filterUniversities(rows, filters, favorites = []) {
        const saved = new Set(favorites);
        const tokens = fold(filters.q).split(/\s+/).filter(Boolean);
        const range = /^(\d+)-(\d+)$/.exec(filters.rank);
        return rows.filter(row =>
            (filters.region === 'all' || row.region === filters.region) &&
            (filters.country === 'all' || row.country === filters.country) &&
            (!range || (row.rank >= Number(range[1]) && row.rank <= Number(range[2]))) &&
            (filters.subject === 'all' || row.subjects.includes(filters.subject)) &&
            (!filters.favorites || saved.has(row.id)) &&
            tokens.every(token => row.searchText.includes(token))
        ).sort((a, b) => filters.sort === 'rank-desc' ? b.rank - a.rank || a.sourceIndex - b.sourceIndex :
            filters.sort === 'name' ? a.nameEn.localeCompare(b.nameEn, 'en') || a.sourceIndex - b.sourceIndex :
            a.rank - b.rank || a.sourceIndex - b.sourceIndex);
    }
    function paginate(rows, page, size = PAGE_SIZE) {
        const totalPages = Math.max(1, Math.ceil(rows.length / size));
        const safePage = Math.max(1, Math.min(Math.trunc(Number(page)) || 1, totalPages));
        return {rows: rows.slice((safePage - 1) * size, safePage * size), page: safePage, totalPages};
    }
    function uniqueKnownIds(ids, rows, limit = Infinity) {
        const known = new Set(rows.map(row => row.id));
        return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && known.has(id)))].slice(0, limit) : [];
    }
    function readPreferences(storage, rows) {
        const empty = {favorites: [], compare: [], theme: 'system', available: true};
        try {
            const text = storage.getItem(STORAGE_KEY);
            if (!text) return empty;
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object' || data.version !== 2) return empty;
            return {favorites: uniqueKnownIds(data.favorites, rows), compare: uniqueKnownIds(data.compare, rows, MAX_COMPARE),
                theme: validEnum(data.theme, ['light', 'dark', 'system'], 'system'), available: true};
        } catch (_) { return {...empty, available: false}; }
    }
    function savePreferences(storage, preferences) {
        try { storage.setItem(STORAGE_KEY, JSON.stringify({version: 2, favorites: preferences.favorites, compare: preferences.compare, theme: preferences.theme})); return true; }
        catch (_) { return false; }
    }
    function decodeState(search, rows) {
        const params = new URLSearchParams(search);
        const raw = Object.fromEntries(params);
        const filters = sanitizeFilters(raw, rows);
        const detail = rows.some(row => row.id === params.get('school')) ? params.get('school') : null;
        // Presence is meaningful: ?compare= clears an existing local shortlist.
        const compare = params.has('compare') ? uniqueKnownIds((params.get('compare') || '').split(','), rows, MAX_COMPARE) : null;
        return {filters, detail, compare};
    }
    function encodeState(filters, detail, compare = []) {
        const params = new URLSearchParams();
        Object.entries(DEFAULT_FILTERS).forEach(([key, defaultValue]) => {
            if (filters[key] !== defaultValue) params.set(key, key === 'favorites' ? '1' : String(filters[key]));
        });
        if (detail) params.set('school', detail);
        params.set('compare', compare.join(','));
        return params.toString();
    }
    async function loadDataset({fetcher, fallback, url = 'data/universities.json', timeoutMs = 5000, expectedCount = 100, preferInline = false}) {
        function validate(raw) {
            const rows = normalizeDataset(raw);
            if (rows.length !== raw.length || (expectedCount && rows.length !== expectedCount)) throw new Error('院校数据不完整或包含无效记录');
            return rows;
        }
        if (preferInline && Array.isArray(fallback) && fallback.length) return {rows: validate(fallback), source: 'inline'};
        let timer;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        try {
            if (typeof fetcher !== 'function') throw new Error('当前环境不支持读取数据');
            const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('读取院校数据超时')); }, timeoutMs); });
            const request = (async () => {
                const response = await fetcher(url, {cache: 'no-cache', signal: controller?.signal});
                if (!response.ok) throw new Error(`读取失败（${response.status}）`);
                return validate(await response.json());
            })();
            return {rows: await Promise.race([request, timeout]), source: 'network'};
        } catch (error) {
            try { return {rows: validate(fallback), source: 'fallback', reason: String(error.message || error)}; }
            catch (_) { throw new Error('院校数据暂时无法读取，请检查 data 文件夹后重试'); }
        } finally { clearTimeout(timer); }
    }
    function toCSV(rows) {
        const cell = value => {
            let text = String(value ?? '');
            // Protect spreadsheet users even when leading whitespace/control characters precede a formula.
            if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        };
        return '\uFEFF' + [['QS 2025名次', '学校', '英文名', '国家或地区', '区域', '原资料亮点', '固定编号'], ...rows.map(row => [row.rank, row.name, row.nameEn, row.country, row.region, row.highlight, row.id])].map(row => row.map(cell).join(',')).join('\r\n');
    }
    return {MAX_COMPARE, PAGE_SIZE, STORAGE_KEY, DEFAULT_FILTERS, SUBJECTS, escapeHTML, normalizeDataset, sanitizeFilters, filterUniversities, paginate, uniqueKnownIds, readPreferences, savePreferences, decodeState, encodeState, loadDataset, toCSV, sourceId};
});
