/* The UI deliberately has no build step or remote runtime dependencies. */
(function () {
    'use strict';
    const C = window.QSCore;
    if (!C) { document.getElementById('dataStatus').textContent = '页面脚本缺失，请恢复 js/core.js 后刷新。'; return; }
    const $ = id => document.getElementById(id);
    const e = C.escapeHTML;
    const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const state = {rows: [], filters: {...C.DEFAULT_FILTERS}, favorites: [], compare: [], theme: 'system', detail: null, ready: false};
    const storage = {getItem(key) { return window.localStorage.getItem(key); }, setItem(key, value) { window.localStorage.setItem(key, value); }};
    let geography = null;
    let searchTimer;
    let toastTimer;
    let initVersion = 0;
    let storageWarningShown = false;
    const dialogFocus = new WeakMap();
    const detailRequests = new Map();
    let inlineDatasetPromise = null;
    let detailGeneration = 0;
    let comparisonGeneration = 0;
    let photoGeneration = 0;
    let activePhoto = null;
    const countryNames = {
        '美国': 'United States of America', '加拿大': 'Canada', '英国': 'United Kingdom', '瑞士': 'Switzerland',
        '法国': 'France', '德国': 'Germany', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞典': 'Sweden',
        '爱尔兰': 'Ireland', '丹麦': 'Denmark', '俄罗斯': 'Russia', '中国': 'China', '中国台湾': 'Taiwan',
        '日本': 'Japan', '韩国': 'South Korea', '澳大利亚': 'Australia', '新西兰': 'New Zealand',
        '阿根廷': 'Argentina', '巴西': 'Brazil', '智利': 'Chile', '墨西哥': 'Mexico', '马来西亚': 'Malaysia'
    };
    const markerCountries = {'中国香港': [114.17, 22.3], '新加坡': [103.82, 1.35]};
    const tiedRanks = new Set();
    const countBy = (rows, key) => rows.reduce((counts, row) => { counts.set(row[key], (counts.get(row[key]) || 0) + 1); return counts; }, new Map());
    const byId = id => state.rows.find(row => row.id === id);
    const resultRows = () => C.filterUniversities(state.rows, state.filters, state.favorites);
    const paragraphs = text => (text || '原资料暂未提供这部分内容。').split(/\n\s*\n/).filter(Boolean).map(part => `<p>${e(part).replace(/\n/g, '<br>')}</p>`).join('');

    function toast(message) {
        clearTimeout(toastTimer);
        $('toast').textContent = message;
        $('toast').hidden = false;
        toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300);
    }
    function persist() {
        if (!C.savePreferences(storage, state) && !storageWarningShown) {
            storageWarningShown = true;
            toast('浏览器未能保存记录，当前页面仍可收藏和对比；刷新后记录可能丢失。');
        }
    }
    function applyTheme() {
        const dark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        $('themeButton').innerHTML = icon(dark ? 'sun' : 'moon');
        $('themeButton').setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
        document.querySelector('meta[name="theme-color"]').content = dark ? '#111b2e' : '#f5f8fc';
        if (state.ready) renderMap(resultRows());
    }
    function syncURL(mode = 'replace') {
        try {
            const url = new URL(location.href);
            url.search = C.encodeState(state.filters, state.detail, state.compare);
            history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
        } catch (_) { /* file:// or embedded privacy modes may reject History writes. */ }
    }
    function resetFilters() {
        clearTimeout(searchTimer);
        state.filters = {...C.DEFAULT_FILTERS, view: state.filters.view};
        render(); syncURL();
    }
    function changeFilters(patch, focusResults = false) {
        clearTimeout(searchTimer);
        state.filters = {...state.filters, q: $('searchInput').value, ...patch, page: 1};
        render(); syncURL();
        if (focusResults) scrollToResults();
    }
    function scrollToResults() {
        $('universities').scrollIntoView({behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
    }
    function selectCountry(country) {
        // Selecting a map country is a clear navigation action: release only a conflicting region.
        const row = state.rows.find(item => item.country === country);
        changeFilters({country, region: state.filters.region !== 'all' && state.filters.region !== row?.region ? 'all' : state.filters.region}, true);
        $('resultCount').tabIndex = -1;
        $('resultCount').focus({preventScroll: true});
    }
    function renderFilterControls() {
        const counts = countBy(state.rows, 'region');
        if (!$('filterTabs').children.length) {
            $('filterTabs').innerHTML = [['all', state.rows.length], ...counts].map(([region, count], index) => `<button type="button" class="region-button" data-region="${e(region)}" id="region-${index}" aria-pressed="false"><span>${region === 'all' ? '全部区域' : e(region)}</span><span>${count}</span></button>`).join('');
        }
        $('filterTabs').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.region === state.filters.region)));
        const countryRows = state.filters.region === 'all' ? state.rows : state.rows.filter(row => row.region === state.filters.region);
        const countryCounts = [...countBy(countryRows, 'country')].sort((a, b) => b[1] - a[1]);
        $('countrySelect').innerHTML = '<option value="all">全部国家与地区</option>' + countryCounts.map(([country, count]) => `<option value="${e(country)}">${e(country)}（${count}）</option>`).join('');
        if (state.filters.country !== 'all' && !countryCounts.some(([country]) => country === state.filters.country)) state.filters.country = 'all';
        $('countrySelect').value = state.filters.country;
        $('rankSelect').value = state.filters.rank;
        $('subjectSelect').value = state.filters.subject;
        $('sortSelect').value = state.filters.sort;
        $('favoritesOnly').checked = state.filters.favorites;
        if ($('searchInput').value !== state.filters.q) $('searchInput').value = state.filters.q;
        $('favoritesButton').setAttribute('aria-pressed', String(state.filters.favorites));
        $('favoritesCount').textContent = state.favorites.length;
        $('gridView').setAttribute('aria-pressed', String(state.filters.view === 'grid'));
        $('listView').setAttribute('aria-pressed', String(state.filters.view === 'list'));
        const labels = {
            q: state.filters.q ? `搜索：${state.filters.q}` : '', region: state.filters.region,
            country: state.filters.country, rank: $('rankSelect').selectedOptions[0]?.textContent,
            subject: C.SUBJECTS[state.filters.subject]?.label, favorites: state.filters.favorites ? '已收藏' : ''
        };
        $('activeFilters').innerHTML = Object.entries(labels).filter(([key, label]) => label && state.filters[key] !== C.DEFAULT_FILTERS[key]).map(([key, label]) => `<button class="filter-chip" type="button" data-clear-filter="${key}" aria-label="取消${e(label)}筛选">${e(label)}${icon('close')}</button>`).join('');
    }
    function rankBadge(row) {
        return `<div class="rank-badge${row.rank <= 3 ? ' top-rank' : ''}"><span>#</span><strong>${row.rank}</strong>${tiedRanks.has(row.rank) ? '<small>并列</small>' : ''}</div>`;
    }
    function photoFrame(photo, className = '', loading = 'lazy') {
        if (!photo) return `<div class="photo-frame ${className} is-missing"><span class="photo-placeholder">校园照片暂不可用</span></div>`;
        return `<div class="photo-frame ${className}"><img data-campus-photo src="${e(photo.path)}" alt="${e(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="${loading}" decoding="async"><span class="photo-placeholder">照片未能加载，学校资料仍可阅读</span><button class="photo-credit-button" type="button" data-photo="${photo.id}" aria-label="查看${e(photo.alt)}的图片与许可">${photo.creditLine ? e(photo.creditLine) + ' · ' : ''}图源与许可 ↗</button></div>`;
    }
    function renderCard(row) {
        const saved = state.favorites.includes(row.id);
        const selected = state.compare.includes(row.id);
        return `<article class="university-card" data-school="${row.id}">
            ${photoFrame(row.cover, 'card-photo')}
            <div class="card-topline">${rankBadge(row)}<button type="button" class="icon-button bookmark-button" data-action="favorite" data-id="${row.id}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}${e(row.name)}">${icon('bookmark')}</button></div>
            <div class="card-main"><h3><button type="button" class="school-title" data-action="detail" data-id="${row.id}">${e(row.name)}</button></h3><p class="university-name-en" lang="en">${e(row.nameEn)}</p></div>
            <p class="card-location"><span aria-hidden="true">${e(row.flag)}</span><span>${e(row.city || row.country)}</span></p>
            ${row.guideAvailable ? '<span class="guide-badge">参访指南已核对</span>' : '<span class="archive-badge">2025 年度资料</span>'}
            <div class="card-tags">${row.subjects.slice(0, 2).map(key => `<span class="subject-tag">${e(C.SUBJECTS[key].label)}</span>`).join('')}</div>
            <p class="card-highlight">${e(row.highlight || '了解这所大学的历史与校园参访资料。')}</p>
            <div class="card-bottom"><button type="button" class="compare-button" data-action="compare" data-id="${row.id}" aria-pressed="${selected}" aria-label="${selected ? '从对比中移除' : '加入对比'}${e(row.name)}">${icon(selected ? 'check' : 'compare')}${selected ? '已加入对比' : '加入对比'}</button><button type="button" class="details-button" data-action="detail" data-id="${row.id}" aria-label="查看${e(row.name)}详情">了解学校${icon('chevron')}</button></div>
        </article>`;
    }
    function render() {
        if (!state.ready) return;
        const focused = document.activeElement;
        const focusKey = focused?.dataset?.action && focused.dataset.id ? {action: focused.dataset.action, id: focused.dataset.id} : null;
        const regionFocus = focused?.dataset?.region;
        renderFilterControls();
        const rows = resultRows();
        const page = C.paginate(rows, state.filters.page);
        state.filters.page = page.page;
        $('universitiesGrid').classList.toggle('list-view', state.filters.view === 'list');
        $('universitiesGrid').setAttribute('aria-busy', 'false');
        $('resultCount').innerHTML = `找到 <strong>${rows.length}</strong> 所院校<span> / 共 ${state.rows.length} 所</span>`;
        $('exportButton').disabled = !rows.length;
        $('universitiesGrid').innerHTML = page.rows.length ? page.rows.map(renderCard).join('') : `<div class="empty-state">${icon(state.filters.favorites ? 'bookmark' : 'search')}<h3>${state.filters.favorites && !state.favorites.length ? '把心仪的学校，留在这里。' : '暂时没有匹配的院校'}</h3><p>${state.filters.favorites && !state.favorites.length ? '点击学校卡片右上角的收藏图标，建立你的院校清单。' : '试着减少一些筛选条件，或换一个学校简称。'}</p><button type="button" class="secondary-button" data-reset>查看全部院校</button></div>`;
        renderPagination(page, rows.length);
        renderCountryButtons();
        renderMap(rows);
        renderCompareTray();
        if (focusKey && !focused.isConnected) {
            const target = Array.from(document.querySelectorAll('[data-action][data-id]')).find(node => node.dataset.action === focusKey.action && node.dataset.id === focusKey.id);
            if (target) target.focus({preventScroll: true});
            else if (!focused.isConnected) { $('resultCount').tabIndex = -1; $('resultCount').focus({preventScroll: true}); }
        } else if (regionFocus) {
            Array.from($('filterTabs').querySelectorAll('button')).find(node => node.dataset.region === regionFocus)?.focus({preventScroll: true});
        }
    }
    function renderPagination(page, total) {
        $('pagination').hidden = total <= C.PAGE_SIZE;
        $('pagination').innerHTML = total > C.PAGE_SIZE ? `<button type="button" class="page-button page-direction" data-page="${page.page - 1}" ${page.page === 1 ? 'disabled' : ''}>上一页</button>${Array.from({length: page.totalPages}, (_, i) => `<button type="button" class="page-button" data-page="${i + 1}" ${page.page === i + 1 ? 'aria-current="page"' : ''} aria-label="第 ${i + 1} 页">${i + 1}</button>`).join('')}<button type="button" class="page-button page-direction" data-page="${page.page + 1}" ${page.page === page.totalPages ? 'disabled' : ''}>下一页</button>` : '';
    }
    function renderCountryButtons() {
        const counts = countBy(C.filterUniversities(state.rows, {...state.filters, country: 'all'}, state.favorites), 'country');
        const countries = [...countBy(state.rows, 'country')].sort((a, b) => b[1] - a[1]);
        const button = ([country]) => `<button type="button" class="country-chip" data-country="${e(country)}" aria-pressed="${state.filters.country === country}">${e(country)}<span>${counts.get(country) || 0}</span></button>`;
        $('countryShortcuts').innerHTML = countries.slice(0, 5).map(button).join('');
        $('countryDirectory').innerHTML = countries.map(button).join('');
    }
    function renderCompareTray() {
        $('compareTray').hidden = !state.compare.length;
        document.body.classList.toggle('has-compare', !!state.compare.length);
        $('compareCount').textContent = `${state.compare.length} / ${C.MAX_COMPARE}`;
        $('compareItems').innerHTML = state.compare.map(byId).filter(Boolean).map(row => `<span class="compare-item">${e(row.name)}<button type="button" class="icon-button" data-remove-compare="${row.id}" aria-label="从对比中移除${e(row.name)}">${icon('close')}</button></span>`).join('');
        $('openCompare').disabled = state.compare.length < 2;
        $('openCompare').title = state.compare.length < 2 ? '至少选择 2 所学校' : '比较已选学校';
    }
    function toggleFavorite(id) {
        const row = byId(id);
        if (!row) return;
        const selected = state.favorites.includes(id);
        state.favorites = selected ? state.favorites.filter(item => item !== id) : [...state.favorites, id];
        persist(); render();
        if (state.detail === id) updateDetailButtons(row);
        syncURL();
        toast(`${selected ? '已取消收藏' : '已收藏'}：${row.name}`);
    }
    function toggleCompare(id) {
        const row = byId(id);
        if (!row) return;
        if (state.compare.includes(id)) state.compare = state.compare.filter(item => item !== id);
        else if (state.compare.length >= C.MAX_COMPARE) { toast('最多同时对比 4 所学校，请先移除一所。'); return; }
        else state.compare.push(id);
        persist(); render(); syncURL();
        if (state.detail) updateDetailButtons(byId(state.detail));
    }
    function openDialog(dialog) {
        if (dialog.open) return;
        if (typeof dialog.showModal !== 'function') { toast('当前浏览器不支持详情弹窗，请使用新版浏览器或阅读完整原始资料。'); return; }
        dialogFocus.set(dialog, document.activeElement);
        dialog.showModal();
        document.body.classList.add('dialog-open');
    }
    function closeDialog(dialog) { if (dialog.open) dialog.close(); }
    function loadInlineDataset() {
        const complete = () => {
            try { return window.__QS_UNIVERSITIES__?.length === 100 && C.normalizeDataset(window.__QS_UNIVERSITIES__).length === 100; }
            catch (_) { return false; }
        };
        if (complete()) return Promise.resolve(window.__QS_UNIVERSITIES__);
        if (inlineDatasetPromise) return inlineDatasetPromise;
        inlineDatasetPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'data/universities.inline.js?v=3.0.0';
            script.dataset.inlineFallback = 'true';
            const timer = setTimeout(() => finish(new Error('内置资料读取超时')), 6000);
            function finish(error) {
                clearTimeout(timer); script.onload = null; script.onerror = null;
                if (error) { script.remove(); inlineDatasetPromise = null; reject(error); }
                else resolve(window.__QS_UNIVERSITIES__);
            }
            script.onload = () => complete() ? finish() : finish(new Error('内置资料格式无效或不完整'));
            script.onerror = () => finish(new Error('缺少内置资料脚本'));
            document.head.appendChild(script);
        });
        return inlineDatasetPromise;
    }
    async function ensureDetail(id) {
        const existing = byId(id);
        if (existing?.detailsLoaded) return existing;
        if (detailRequests.has(id)) return detailRequests.get(id);
        const request = C.loadUniversityDetail({id, fetcher: window.fetch?.bind(window), fallbackLoader: loadInlineDataset}).then(row => {
            const index = state.rows.findIndex(item => item.id === id);
            if (index !== -1) state.rows[index] = row;
            return row;
        }).catch(error => { detailRequests.delete(id); throw error; });
        detailRequests.set(id, request);
        return request;
    }
    function sourceLinks(sources) {
        return sources.map(source => `<a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗</a>`).join('');
    }
    function renderGuide(guide) {
        if (!guide) return '';
        const facts = [['预约怎么做', guide.visit.booking], ['费用怎么查', guide.visit.fee], ['哪些地方能进', guide.visit.access], ['公共交通与到访', guide.visit.arrival]];
        return `<section class="detail-section visit-guide"><div class="guide-heading"><h3>先把参访安排好</h3><span>核对日期 ${e(guide.reviewedOn)}</span></div><p class="campus-label">${e(guide.campus)}${guide.visit.address ? ' · ' + e(guide.visit.address) : ''}</p><dl class="visit-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><div class="visit-actions"><a class="primary-button" href="${e(guide.visit.officialUrl)}" target="_blank" rel="noopener noreferrer">打开官方参访入口 ↗</a>${guide.visit.address ? `<a class="secondary-button" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(guide.visit.address)}" target="_blank" rel="noopener noreferrer">查看地址地图 ↗</a>` : ''}</div><p class="field-help">已核对校区、参访入口与交通建议；不代表全校历史或学科断言均已核验。出发前再确认当日公告。</p></section><section class="detail-section"><h3>到校园里看什么</h3><div class="campus-highlights">${guide.highlights.map(place => `<div><h4>${e(place.title)}</h4><p>${e(place.text)}</p></div>`).join('')}</div></section><section class="detail-section sources-section"><h3>这份指南的依据</h3><div class="detail-source">${sourceLinks(guide.sources)}</div></section>`;
    }
    function renderDetailBody(row, pending = false, error = '') {
        const guide = row.guide;
        const update = row.institutionUpdate;
        $('modalBody').innerHTML = `<div class="detail-header">${rankBadge(row)}<h2 id="detailTitle">${e(row.name)}</h2><p class="university-name-en" lang="en">${e(row.nameEn)}</p><p class="card-location"><span aria-hidden="true">${e(row.flag)}</span><span>${e(row.city || row.country)} / ${e(row.region)}</span></p></div>${photoFrame(row.cover, 'detail-photo', 'eager')}<div class="detail-actions" id="detailActions"></div><div class="detail-content">${update ? `<aside class="institution-update"><h3>名称与资料更新</h3><p>${e(update.text)}</p><p class="field-help">核对日期 ${e(update.checkedOn)}</p><div class="detail-source">${sourceLinks(update.sources)}</div></aside>` : ''}${pending ? '<p class="detail-loading" role="status">正在读取这所学校的详细资料…</p>' : error ? `<div class="detail-error" role="status"><p>${e(error)}</p><button type="button" class="secondary-button" data-retry-detail="${row.id}">重新读取详情</button></div>` : `<section class="detail-section"><h3>${guide ? '先认识这所学校' : '原资料亮点'}</h3><div class="prose">${paragraphs(guide?.overview || row.highlight)}</div>${!guide ? '<p class="field-help">以下介绍沿用原项目，尚未逐项独立核验。</p>' : ''}</section>${renderGuide(guide)}${row.photos.length > 1 ? `<section class="detail-section campus-gallery-section"><h3>再看几处校园风景</h3><div class="campus-gallery">${row.photos.map(photo => `<figure>${photoFrame(photo, 'gallery-photo')}<figcaption>${e(photo.title)}<small>${e(photo.campus)}</small></figcaption></figure>`).join('')}</div></section>` : ''}<details class="legacy-reading"><summary>历史故事与原始整理资料（未逐项核验）</summary><section class="detail-section"><h3>历史背景与学科故事</h3><div class="prose">${paragraphs(row.history)}</div></section>${!guide ? `<section class="detail-section"><h3>原始参访资料</h3><div class="prose">${paragraphs(row.visit)}</div></section>` : ''}</details><p class="reading-note">名次口径：QS 2025。${tiedRanks.has(row.rank) ? '此名次包含并列学校。' : ''}照片是注明来源的真实校园影像，不代表实时景象或当前开放范围。${!guide ? '此校参访安排尚未做结构化核对，出行前请自行确认学校官网。' : ''}</p><div class="detail-source"><a href="https://www.topuniversities.com/world-university-rankings/2025" target="_blank" rel="noopener noreferrer">QS 年度来源 ↗</a><a href="IMAGE_CREDITS.md" target="_blank" rel="noopener">全部照片署名与许可 ↗</a><a href="QS2025%20top100.md" target="_blank" rel="noopener">原始整理资料 ↗</a></div>`}</div>`;
        updateDetailButtons(row);
    }
    async function openDetail(id, mode = 'push') {
        const row = byId(id);
        if (!row) return;
        const generation = ++detailGeneration;
        state.detail = id;
        renderDetailBody(row, !row.detailsLoaded);
        openDialog($('detailModal'));
        $('detailModal').scrollTop = 0;
        syncURL(mode);
        if (row.detailsLoaded) return;
        try {
            const full = await ensureDetail(id);
            if (state.detail !== id || generation !== detailGeneration || !$('detailModal').open) return;
            renderDetailBody(full);
        } catch (error) {
            if (state.detail === id && generation === detailGeneration && $('detailModal').open) renderDetailBody(row, false, error.message);
        }
    }
    async function openPhoto(id) {
        if (!/^qs2025-\d{3}-[1-9]$/.test(id)) return;
        const institutionId = id.slice(0, -2);
        const generation = ++photoGeneration;
        $('photoBody').innerHTML = '<p class="detail-loading" role="status">正在读取照片署名与许可…</p>';
        openDialog($('photoModal'));
        try {
            const row = await ensureDetail(institutionId);
            const photo = row.photos.find(item => item.id === id);
            if (generation !== photoGeneration || !$('photoModal').open) return;
            if (!photo) throw new Error('这张照片的署名资料暂不可用');
            activePhoto = {institutionId, id};
            $('photoBody').innerHTML = `<div class="lightbox-image photo-frame"><img data-campus-photo src="${e(photo.path)}" alt="${e(photo.alt)}" width="${photo.width}" height="${photo.height}" decoding="async"><span class="photo-placeholder">照片未能加载，图源与署名仍可查看</span></div><div class="photo-provenance"><h3>${e(row.name)} · ${e(photo.title)}</h3><p class="campus-label">${e(photo.campus)}</p><p><strong>摄影 / 作者：</strong>${e(photo.author)}</p><p><strong>许可：</strong><a href="${e(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(photo.license)} ↗</a> · <a href="${e(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">原始图源与完整说明 ↗</a></p><p class="adaptation">${e(photo.adaptation)}</p><div class="lightbox-nav">${row.photos.map((item, index) => `<button type="button" class="secondary-button" data-photo="${item.id}" ${item.id === id ? 'aria-current="true"' : ''}>照片 ${index + 1}</button>`).join('')}</div></div>`;
        } catch (error) {
            if (generation === photoGeneration && $('photoModal').open) $('photoBody').innerHTML = `<div class="detail-error"><p>${e(error.message)}</p><a href="IMAGE_CREDITS.md" target="_blank" rel="noopener">查看全部图片署名与许可 ↗</a></div>`;
        }
    }
    function updateDetailButtons(row) {
        if (!row || !$('detailActions')) return;
        const focused = document.activeElement;
        const action = $('detailActions').contains(focused) ? focused.dataset.action : null;
        const saved = state.favorites.includes(row.id), compared = state.compare.includes(row.id);
        $('detailActions').innerHTML = `<button type="button" class="secondary-button" data-action="favorite" data-id="${row.id}" aria-pressed="${saved}">${icon('bookmark')}${saved ? '已收藏' : '收藏学校'}</button><button type="button" class="secondary-button" data-action="compare" data-id="${row.id}" aria-pressed="${compared}">${icon(compared ? 'check' : 'compare')}${compared ? '已加入对比' : '加入对比'}</button><button type="button" class="secondary-button" data-share>${icon('arrow')}分享学校</button>${row.website ? `<a class="secondary-button" href="${e(row.website)}" target="_blank" rel="noopener noreferrer">学校官网 ↗</a>` : ''}`;
        if (action) $('detailActions').querySelector(`[data-action="${action}"]`)?.focus({preventScroll: true});
    }
    async function openComparison() {
        const selected = [...state.compare];
        let rows = selected.map(byId).filter(Boolean);
        if (rows.length < 2) { toast('至少选择 2 所学校再开始对比。'); return; }
        const generation = ++comparisonGeneration;
        $('compareBody').innerHTML = '<p class="detail-loading" role="status">正在准备院校资料…</p>';
        openDialog($('compareModal'));
        const outcomes = await Promise.allSettled(selected.map(ensureDetail));
        if (!$('compareModal').open || generation !== comparisonGeneration || selected.join(',') !== state.compare.join(',')) return;
        rows = outcomes.map((result, index) => result.status === 'fulfilled' ? result.value : byId(selected[index]));
        const longCell = text => {
            const full = text || '原资料未提供';
            return full.length > 220 ? paragraphs(full.slice(0, 220) + '…') + `<details><summary>展开完整资料</summary>${paragraphs(full)}</details>` : paragraphs(full);
        };
        const rowsHTML = [
            ['QS 2025 名次', row => `<span class="comparison-rank">#${row.rank}</span>${tiedRanks.has(row.rank) ? '（并列）' : ''}`],
            ['国家 / 地区', row => `${e(row.flag)} ${e(row.country)}`],
            ['地理区域', row => e(row.region)],
            ['资料亮点', row => paragraphs(row.highlight)],
            ['概览与资料', row => longCell(row.guide?.overview || row.history || '详情暂未读取，请稍后重试')],
            ['参访预约', row => longCell(row.guide?.visit.booking || row.visit || '参访安排尚未核对')],
            ['费用与开放', row => longCell(row.guide ? row.guide.visit.fee + '\n\n' + row.guide.visit.access : '以学校官方当期安排为准')],
            ['来源与核对', row => row.guide ? e(row.guide.reviewedOn) + '<div class="detail-source">' + sourceLinks(row.guide.sources) + '</div>' : '原资料未逐项核验']
        ].map(([label, value]) => `<tr><th scope="row">${label}</th>${rows.map(row => `<td>${value(row)}</td>`).join('')}</tr>`).join('');
        $('compareBody').innerHTML = `<div class="compare-intro"><p>同一年度，一起看清不同。手机上可左右滑动表格。</p><button type="button" class="text-button" data-share>复制对比链接</button></div><div class="compare-table-scroll" tabindex="0" role="region" aria-label="可横向滚动的院校对比表"><table class="compare-table"><caption>20 校参访指南附官方来源；其余为原始整理资料。名次口径为 QS 2025，学科亮点不是学科排名。</caption><thead><tr><th scope="col">比较项目</th>${rows.map(row => `<th scope="col">${e(row.name)}<p class="university-name-en" lang="en">${e(row.nameEn)}</p></th>`).join('')}</tr></thead><tbody>${rowsHTML}</tbody></table></div>`;
        openDialog($('compareModal'));
        $('compareModal').scrollTop = 0;
    }
    async function share() {
        if (location.protocol === 'file:') { toast('本地文件链接只适用于本机。部署网页后可分享，当前可先导出院校清单。'); return; }
        syncURL();
        const url = location.href;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用');
            await navigator.clipboard.writeText(url);
            toast('已复制链接，包含当前筛选、学校与对比清单。');
        } catch (_) {
            $('shareUrl').value = url;
            openDialog($('shareModal'));
            $('shareUrl').select();
        }
    }
    function exportCSV() {
        if ($('searchInput').value !== state.filters.q) changeFilters({q: $('searchInput').value});
        const rows = resultRows();
        if (!rows.length) return;
        try {
            const blob = new Blob([C.toCSV(rows)], {type: 'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `QS2025-院校清单-${rows.length}所.csv`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast(`已导出当前全部 ${rows.length} 所院校（包含其他分页）。`);
        } catch (_) { toast('当前浏览器无法下载，请换用完整浏览器重试。'); }
    }

    async function prepareGeography() {
        try {
            if (!window.d3 || !window.topojson) throw new Error('地图依赖缺失');
            if (window.__WORLD_TOPO__) {
                geography = window.topojson.feature(window.__WORLD_TOPO__, window.__WORLD_TOPO__.objects.countries);
            } else {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4500);
                try {
                    const response = await fetch('data/world-110m.json', {signal: controller.signal});
                    if (!response.ok) throw new Error('地图数据读取失败');
                    const topology = await response.json();
                    geography = window.topojson.feature(topology, topology.objects.countries);
                } finally { clearTimeout(timer); }
            }
            if (!geography?.features?.length) throw new Error('地图数据无效');
        } catch (_) { geography = null; }
        if (state.ready) renderMap(resultRows());
    }
    function renderMap(rows) {
        const svg = $('worldMap');
        $('mapTooltip').hidden = true;
        $('mapFallback').hidden = !!geography;
        if (!geography || !window.d3) { svg.replaceChildren(); return; }
        const d3 = window.d3;
        const counts = countBy(rows, 'country');
        const reverseNames = Object.fromEntries(Object.entries(countryNames).map(([local, english]) => [english, local]));
        // Fixed viewBox scales naturally and needs no resize listener or repeated layout reads.
        const projection = d3.geoNaturalEarth1().fitExtent([[8, 15], [592, 300]], {type: 'Sphere'});
        const path = d3.geoPath(projection);
        const dark = document.documentElement.dataset.theme === 'dark';
        const colors = dark ? ['#384c6b', '#4d6994', '#5884c0', '#6c9be1', '#8cb6fb'] : ['#dce6f3', '#b7cef3', '#8aafea', '#5188d8', '#245bd6'];
        const color = count => colors[count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4];
        const map = d3.select(svg);
        map.selectAll('*').remove();
        map.append('path').attr('class', 'map-graticule').attr('d', path(d3.geoGraticule10()));
        const paths = map.append('g').selectAll('path').data(geography.features.filter(feature => feature.properties.name !== 'Antarctica')).join('path')
            .attr('d', path).attr('class', feature => {
                const country = reverseNames[feature.properties.name];
                return `map-country ${country ? 'has-data' : ''} ${state.filters.country === country ? 'selected' : ''}`;
            }).attr('fill', feature => color(counts.get(reverseNames[feature.properties.name]) || 0));
        paths.each(function (feature) {
            const country = reverseNames[feature.properties.name];
            if (!country) return;
            const selection = d3.select(this);
            const label = `${country}，当前结果 ${counts.get(country) || 0} 所，点击筛选`;
            selection.attr('tabindex', 0).attr('role', 'button').attr('aria-label', label).append('title').text(label);
            selection.on('click', () => selectCountry(country)).on('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCountry(country); }
            }).on('mouseenter', event => showMapTooltip(country, counts.get(country) || 0, event))
                .on('mouseleave blur', () => { $('mapTooltip').hidden = true; });
        });
        Object.entries(markerCountries).forEach(([country, coordinates]) => {
            const [x, y] = projection(coordinates);
            const dot = map.append('circle').attr('class', 'map-marker').attr('cx', x).attr('cy', y).attr('r', 4)
                .attr('tabindex', 0).attr('role', 'button').attr('aria-label', `${country}，当前结果 ${counts.get(country) || 0} 所，点击筛选`)
                .on('click', () => selectCountry(country)).on('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCountry(country); } })
                .on('mouseenter', event => showMapTooltip(country, counts.get(country) || 0, event)).on('mouseleave blur', () => { $('mapTooltip').hidden = true; });
            dot.append('title').text(`${country}：${counts.get(country) || 0} 所`);
        });
    }
    function showMapTooltip(country, count, event) {
        const tooltip = $('mapTooltip');
        tooltip.textContent = `${country} · 当前结果 ${count} 所`;
        const rect = $('worldMapContainer').getBoundingClientRect();
        tooltip.style.left = `${Math.max(5, Math.min(event.clientX - rect.left - 40, rect.width - 170))}px`;
        tooltip.style.top = `${Math.max(4, event.clientY - rect.top - 34)}px`;
        tooltip.hidden = false;
    }

    function bindEvents() {
        document.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            if (button.dataset.action === 'detail') openDetail(button.dataset.id);
            else if (button.dataset.action === 'favorite') toggleFavorite(button.dataset.id);
            else if (button.dataset.action === 'compare') toggleCompare(button.dataset.id);
            else if ('region' in button.dataset) changeFilters({region: button.dataset.region, country: 'all'});
            else if ('country' in button.dataset) selectCountry(button.dataset.country);
            else if ('page' in button.dataset) {
                clearTimeout(searchTimer);
                state.filters.page = Number(button.dataset.page);
                render(); syncURL(); scrollToResults();
                $('resultCount').tabIndex = -1; $('resultCount').focus({preventScroll: true});
            } else if ('clearFilter' in button.dataset) {
                const key = button.dataset.clearFilter;
                changeFilters({[key]: C.DEFAULT_FILTERS[key], ...(key === 'region' ? {country: 'all'} : {})});
                $('searchInput').focus({preventScroll: true});
            } else if ('reset' in button.dataset) resetFilters();
            else if (button.dataset.removeCompare) toggleCompare(button.dataset.removeCompare);
            else if (button.dataset.close) closeDialog($(button.dataset.close));
            else if ('share' in button.dataset) share();
            else if (button.dataset.photo) openPhoto(button.dataset.photo);
            else if (button.dataset.retryDetail) openDetail(button.dataset.retryDetail, 'replace');
        });
        $('searchInput').addEventListener('input', event => {
            if (event.isComposing) return;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => changeFilters({q: $('searchInput').value}), 180);
        });
        $('searchInput').addEventListener('compositionend', () => { clearTimeout(searchTimer); changeFilters({q: $('searchInput').value}); });
        [['countrySelect', 'country'], ['rankSelect', 'rank'], ['subjectSelect', 'subject'], ['sortSelect', 'sort']].forEach(([id, key]) => $(id).addEventListener('change', () => changeFilters({[key]: $(id).value})));
        $('favoritesOnly').addEventListener('change', () => changeFilters({favorites: $('favoritesOnly').checked}));
        $('favoritesButton').addEventListener('click', () => { state.filters = {...C.DEFAULT_FILTERS, favorites: !state.filters.favorites, view: state.filters.view}; render(); syncURL(); scrollToResults(); });
        $('gridView').addEventListener('click', () => changeFilters({view: 'grid'}));
        $('listView').addEventListener('click', () => changeFilters({view: 'list'}));
        $('resetFilters').addEventListener('click', resetFilters);
        $('toggleFilters').addEventListener('click', () => { const open = !$('filtersPanel').classList.contains('is-open'); $('filtersPanel').classList.toggle('is-open', open); $('toggleFilters').setAttribute('aria-expanded', String(open)); $('toggleFilters').textContent = open ? '收起筛选条件' : '展开筛选条件'; });
        $('mapReset').addEventListener('click', resetFilters);
        $('exportButton').addEventListener('click', exportCSV);
        $('themeButton').addEventListener('click', () => { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); });
        $('clearCompare').addEventListener('click', () => { state.compare = []; persist(); render(); syncURL(); toast('已清空对比清单。'); });
        $('openCompare').addEventListener('click', openComparison);
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } });
            dialog.addEventListener('close', () => {
                if (dialog.id === 'detailModal') { detailGeneration++; state.detail = null; syncURL(); }
                if (dialog.id === 'compareModal') comparisonGeneration++;
                if (dialog.id === 'photoModal') { photoGeneration++; activePhoto = null; }
                document.body.classList.toggle('dialog-open', !!document.querySelector('dialog[open]'));
                const previousFocus = dialogFocus.get(dialog);
                if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
                else if (previousFocus?.dataset?.id) {
                    const target = Array.from(document.querySelectorAll('[data-action="detail"][data-id]')).find(node => node.dataset.id === previousFocus.dataset.id);
                    target?.focus({preventScroll: true});
                }
            });
        });
        document.addEventListener('error', event => { const image = event.target; if (image.tagName === 'IMG' && image.hasAttribute('data-campus-photo')) { image.hidden = true; image.closest('.photo-frame')?.classList.add('is-missing'); } }, true);
        document.addEventListener('keydown', event => {
            if ($('photoModal').open && activePhoto && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { const row = byId(activePhoto.institutionId); const index = row.photos.findIndex(photo => photo.id === activePhoto.id); const next = (index + (event.key === 'ArrowRight' ? 1 : row.photos.length - 1)) % row.photos.length; event.preventDefault(); openPhoto(row.photos[next].id); return; }
            if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && !event.target.isContentEditable) {
                event.preventDefault(); $('searchInput').focus(); scrollToResults();
            }
        });
        window.addEventListener('popstate', () => {
            if (!state.ready) return;
            closeDialog($('photoModal'));
            closeDialog($('compareModal'));
            clearTimeout(searchTimer);
            const decoded = C.decodeState(location.search, state.rows);
            state.filters = decoded.filters;
            if (decoded.compare !== null) state.compare = decoded.compare;
            state.detail = decoded.detail;
            render();
            if (decoded.detail) openDetail(decoded.detail, 'replace');
            else if ($('detailModal').open) closeDialog($('detailModal'));
            persist();
        });
        window.addEventListener('storage', event => {
            if (event.key !== C.STORAGE_KEY || !state.ready) return;
            const saved = C.readPreferences(storage, state.rows);
            state.favorites = saved.favorites; state.compare = saved.compare; state.theme = saved.theme;
            render(); applyTheme(); syncURL();
            if (state.detail) updateDetailButtons(byId(state.detail));
        });
        window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.theme === 'system') applyTheme(); });
    }
    async function init() {
        const version = ++initVersion;
        $('universitiesGrid').setAttribute('aria-busy', 'true');
        $('universitiesGrid').innerHTML = '<p class="loading">正在读取 2025 年度院校资料…</p>';
        $('dataStatus').textContent = '正在读取院校资料…';
        try {
            const loaded = await C.loadDataset({fetcher: window.fetch?.bind(window), fallbackLoader: loadInlineDataset, preferInline: location.protocol === 'file:'});
            if (version !== initVersion) return;
            state.rows = loaded.rows;
            const prefs = C.readPreferences(storage, state.rows);
            state.favorites = prefs.favorites; state.compare = prefs.compare; state.theme = prefs.theme;
            const decoded = C.decodeState(location.search, state.rows);
            state.filters = decoded.filters;
            if (decoded.compare !== null) state.compare = decoded.compare;
            state.detail = decoded.detail;
            tiedRanks.clear();
            countBy(state.rows, 'rank').forEach((count, rank) => { if (count > 1) tiedRanks.add(rank); });
            state.ready = true;
            $('universityCount').textContent = state.rows.length;
            $('countryCount').textContent = countBy(state.rows, 'country').size;
            $('regionCount').textContent = countBy(state.rows, 'region').size;
            $('dataStatus').textContent = loaded.source === 'fallback' ? '在线资料暂不可用，已使用内置的完整 2025 年资料。' : loaded.source === 'inline' ? '已读取本地资料，收藏与对比可离线使用。' : '2025 年度资料 · 名次保留并列 · 参访信息请向学校确认';
            $('dataStatus').classList.toggle('warning', loaded.source === 'fallback');
            applyTheme(); render();
            if (state.detail) openDetail(state.detail, 'replace');
            if (decoded.compare !== null) persist();
            syncURL();
            if (!prefs.available) toast('已忽略不可读取的本地记录，当前页面仍可正常使用。');
        } catch (error) {
            if (version !== initVersion) return;
            state.ready = false;
            $('universitiesGrid').setAttribute('aria-busy', 'false');
            $('universitiesGrid').innerHTML = `<div class="empty-state">${icon('globe')}<h3>院校资料暂时无法读取</h3><p>${e(error.message)}</p><button class="primary-button" type="button" id="retryLoad">重新读取</button></div>`;
            $('retryLoad').addEventListener('click', init);
            $('dataStatus').textContent = '请检查 data/catalog.json 或 data/universities.inline.js 是否存在。';
            $('resultCount').textContent = '资料读取失败，可重试';
        }
    }
    bindEvents();
    applyTheme();
    init();
    prepareGeography();
})();
