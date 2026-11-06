'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const C = require('../js/core.js');
const full = require('../data/universities.json');
const catalog = require('../data/catalog.json');
const media = require('../data/campus-media.json');
const guides = require('../data/verified-guides.json');
const {buildPhotoCredits} = require('../scripts/build-photo-credits.js');
const response = json => ({ok: true, json: async () => json});

test('lean catalog retains identities, covers and search but no biographies or galleries', () => {
    const a = C.normalizeDataset(catalog), b = C.normalizeDataset(full);
    assert.deepEqual(a.map(row => row.id), b.map(row => row.id));
    for (const row of a) {
        const detail = b.find(item => item.id === row.id);
        assert.equal(row.rank, detail.rank);
        assert.deepEqual(row.cover, detail.cover);
        assert.equal(row.guideAvailable, Boolean(detail.guide));
    }
    assert.ok(a.every(row => row.cover && !row.detailsLoaded && !row.history && !row.photos.length));
    assert.ok(fs.statSync('data/catalog.json').size < fs.statSync('data/universities.json').size / 5);
    assert.equal(C.filterUniversities(a, {...C.DEFAULT_FILTERS, q: 'Cambridge'})[0].id, 'qs2025-005');
    assert.ok(!fs.readFileSync('index.html', 'utf8').includes('<script src="data/universities.inline.js"'));
});
test('100 detail documents equal the full offline channel and belong to their requested school', () => {
    for (const row of full) assert.deepEqual(JSON.parse(fs.readFileSync(`data/details/${row.id}.json`, 'utf8')), row);
});
test('140 local photos cover 100 schools with explicit authors, licences and unmodified asset hashes', () => {
    assert.equal(media.photos.length, 140);
    assert.equal(new Set(media.photos.map(p => p.id)).size, 140);
    assert.equal(new Set(media.photos.filter(p => p.isCover).map(p => p.institutionId)).size, 100);
    for (const p of media.photos) {
        assert.ok(C.normalizeMedia(p, true), p.id);
        assert.match(p.license, /CC BY|CC0|Public domain/);
        assert.match(p.sourceUrl, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
        assert.ok(p.campus && p.alt && p.title && p.adaptation, p.id);
        const bytes = fs.readFileSync(p.path);
        assert.equal(bytes.length, p.bytes, p.id);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256, p.id);
        assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    }
    assert.equal(fs.readFileSync('IMAGE_CREDITS.md', 'utf8'), buildPhotoCredits());
});
test('20 scoped visiting guides have 3 photos, official links, sources and review dates', () => {
    assert.equal(Object.keys(guides).length, 20);
    for (const [id, g] of Object.entries(guides)) {
        assert.equal(full.find(row => row.id === id).photos.length, 3);
        assert.ok(C.safeHttpURL(g.website) && C.safeHttpURL(g.visit.officialUrl), id);
        assert.match(g.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(g.sources.length >= 1 && g.highlights.length === 3, id);
        assert.ok(['booking', 'fee', 'access', 'arrival'].every(key => g.visit[key].length > 10), id);
        assert.ok(g.reviewScope.includes('参访入口与限制'), id);
        assert.ok(g.sources.every(source => source.checkedOn && source.supports.length && C.safeHttpURL(source.url)), id);
    }
});
test('known factual corrections retain historical ranking identity and explain institution changes', () => {
    const row = id => full.find(r => r.id === `qs2025-${id}`);
    assert.match(row('005').history, /霍金.*不能将他列为诺贝尔奖得主/);
    assert.match(row('046').nameEn, /Institut Polytechnique de Paris/);
    assert.match(row('046').history, /École Polytechnique 是成员学校之一/);
    assert.doesNotMatch(row('047').visit, /大学站.*直达校园/);
    assert.match(row('082').institutionUpdate.text, /2026/);
    assert.match(row('085').institutionUpdate.text, /2024.*10.*1/);
    assert.equal(row('085').id, 'qs2025-085');
});
test('media normalization rejects URL traversal, mismatched identities and unlicensed photos', () => {
    const photo = media.photos[0];
    for (const path of ['../secrets', 'https://example.com/a.webp', 'assets/campuses/qs2025-002-1.webp']) assert.equal(C.normalizeMedia({...photo, path}, true), null);
    assert.equal(C.normalizeMedia({...photo, license: ''}, true), null);
    assert.equal(C.normalizeMedia({...photo, sourceUrl: 'javascript:alert(1)'}, true), null);
    const row = C.normalizeDataset([{...full[0], cover: full[1].cover, photos: full[1].photos}])[0];
    assert.equal(row.cover, null); assert.deepEqual(row.photos, []);
    assert.equal(C.safeHttpURL('https://name:pass@example.com'), '');
});
test('successful online catalog loading never requests the full fallback', async () => {
    let fallbackCalls = 0, url;
    const loaded = await C.loadDataset({fetcher: async requested => {url = requested; return response(catalog);}, fallbackLoader: async () => {fallbackCalls++; return full;}});
    assert.equal(url, 'data/catalog.json'); assert.equal(fallbackCalls, 0);
    assert.equal(loaded.source, 'network'); assert.ok(!loaded.rows[0].detailsLoaded);
});
test('catalog failure invokes the lazy fallback exactly once and keeps full details', async () => {
    let calls = 0;
    const loaded = await C.loadDataset({fetcher: async () => ({ok: false}), fallbackLoader: async () => {calls++; return full;}});
    assert.equal(calls, 1); assert.equal(loaded.source, 'fallback'); assert.ok(loaded.rows[0].detailsLoaded);
});
test('a detail request loads only the requested record with no fallback on success', async () => {
    let url, fallback = false;
    const row = await C.loadUniversityDetail({id: full[19].id, fetcher: async requested => {url = requested; return response(full[19]);}, fallbackLoader: async () => {fallback = true; return full;}});
    assert.equal(url, 'data/details/qs2025-020.json'); assert.equal(row.id, full[19].id); assert.equal(fallback, false);
});
test('wrong, incomplete and malformed detail responses use the matching offline school', async () => {
    for (const invalid of [full[1], catalog[0], null, {...full[0], id: undefined}, {...full[0], photos: []}, {...full[0], history: ''}]) {
        const row = await C.loadUniversityDetail({id: full[0].id, fetcher: async () => response(invalid), fallbackLoader: async () => full});
        assert.equal(row.id, full[0].id); assert.ok(row.detailsLoaded);
    }
});
test('hung detail transport times out and a missing fallback produces an actionable retry error', async () => {
    const row = await C.loadUniversityDetail({id: full[0].id, fetcher: () => new Promise(() => {}), timeoutMs: 10, fallbackLoader: async () => full});
    assert.equal(row.id, full[0].id);
    await assert.rejects(C.loadUniversityDetail({id: full[0].id, fetcher: async () => response(null), fallbackLoader: async () => []}), /重试/);
    await assert.rejects(C.loadUniversityDetail({id: '../secret', fetcher: async () => response(full[0])}), /编号/);
});
