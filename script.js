const DATA_URL = 'data/universities.json';
const WORLD_TOPO_URL = 'data/world-110m.json';
const FALLBACK_DATASET = Array.isArray(window.__QS_UNIVERSITIES__) ? window.__QS_UNIVERSITIES__ : [];
const WORLD_TOPOLOGY = window.__WORLD_TOPO__ || null;

const COUNTRY_NAME_TOPO_MAP = {
    '中国': 'China',
    '中国香港': 'Hong Kong',
    '中国台湾': 'Taiwan',
    '中国澳门': 'Macao',
    '美国': 'United States of America',
    '英国': 'United Kingdom',
    '加拿大': 'Canada',
    '法国': 'France',
    '德国': 'Germany',
    '瑞士': 'Switzerland',
    '荷兰': 'Netherlands',
    '瑞典': 'Sweden',
    '丹麦': 'Denmark',
    '比利时': 'Belgium',
    '爱尔兰': 'Ireland',
    '芬兰': 'Finland',
    '西班牙': 'Spain',
    '葡萄牙': 'Portugal',
    '意大利': 'Italy',
    '俄罗斯': 'Russia',
    '日本': 'Japan',
    '韩国': 'South Korea',
    '新加坡': 'Singapore',
    '马来西亚': 'Malaysia',
    '印度': 'India',
    '以色列': 'Israel',
    '沙特阿拉伯': 'Saudi Arabia',
    '阿联酋': 'United Arab Emirates',
    '阿根廷': 'Argentina',
    '巴西': 'Brazil',
    '智利': 'Chile',
    '墨西哥': 'Mexico',
    '澳大利亚': 'Australia',
    '新西兰': 'New Zealand',
    '挪威': 'Norway',
    '波兰': 'Poland',
    '奥地利': 'Austria',
    '捷克': 'Czech Rep.',
    '匈牙利': 'Hungary',
    '希腊': 'Greece',
    '南非': 'South Africa',
    '埃及': 'Egypt',
    '土耳其': 'Turkey',
    '泰国': 'Thailand'
};

const COLOR_BY_CLASS = {
    '0': '#e5e7eb',
    '1': '#bfdbfe',
    '2-3': '#7dd3fc',
    '4-5': '#0ea5e9',
    '6plus': '#0284c7'
};

// DOM 元素
const universitiesGrid = document.getElementById('universitiesGrid');
const filterTabsContainer = document.getElementById('filterTabs');
const countryStatsContainer = document.getElementById('countryStats');
const searchInput = document.getElementById('searchInput');
const expandButton = document.getElementById('expandButton');
const modal = document.getElementById('detailModal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');
const worldMap = document.getElementById('worldMap');
const tooltipCountry = document.getElementById('tooltipCountry');
const tooltipUniversities = document.getElementById('tooltipUniversities');
const mapTooltip = document.getElementById('mapTooltip');
const worldMapContainer = document.getElementById('worldMapContainer');

// 状态
let universities = [];
let currentRegion = 'all';
let currentSearchTerm = '';
let isExpanded = false;
let regionStats = {};
let countryToUniversities = {};
let normalizedCountryStats = {};
let worldGeoJson = null;
let mapResizeTimer = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    setLoadingState(true, '数据加载中，请稍候…');

    try {
        await loadUniversityData();
        regionStats = calculateRegionStats();
        countryToUniversities = groupUniversitiesByCountry();
    buildNormalizedCountryStats();
    await prepareWorldGeometry();

        renderFilterTabs();
        renderCountryStats();
        renderUniversities('all');
    renderWorldMap();
        initEventListeners();
        initScrollAnimations();

        console.log('QS Top 100 数据加载完成，共', universities.length, '所高校');
    } catch (error) {
        console.error('加载院校数据失败:', error);
        showErrorState('数据加载失败，请刷新页面或稍后重试');
    } finally {
        setLoadingState(false);
    }
}

async function loadUniversityData() {
    try {
        const response = await fetch(DATA_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`网络错误：${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('数据格式不正确，应为数组');
        }
        universities = normalizeDataset(data);
    } catch (error) {
        if (FALLBACK_DATASET.length) {
            console.warn('实时数据加载失败，使用内置数据作为兜底。', error);
            universities = normalizeDataset(FALLBACK_DATASET);
            return;
        }
        throw error;
    }
}

function normalizeDataset(data) {
    return data
        .map((item, index) => {
            const highlight = item.highlight || item.highlights || item.strengths || '综合实力卓越';
            return {
                ...item,
                rank: Number(item.rank) || index + 1,
                name: item.name?.trim() || `未命名院校 #${index + 1}`,
                nameEn: item.nameEn || '',
                region: item.region || '其他',
                country: item.country || '其他地区',
                flag: item.flag || '🎓',
                highlight,
                strengths: item.strengths || highlight,
                history: item.history || '暂无历史介绍',
                visit: item.visit || '暂无参观攻略'
            };
        })
        .sort((a, b) => a.rank - b.rank);
}

function calculateRegionStats() {
    return universities.reduce((acc, uni) => {
        const region = uni.region || '其他';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
    }, {});
}

function groupUniversitiesByCountry() {
    return universities.reduce((acc, uni) => {
        const country = uni.country || '其他';
        if (!acc[country]) {
            acc[country] = [];
        }
        acc[country].push(uni);
        return acc;
    }, {});
}

function buildNormalizedCountryStats() {
    normalizedCountryStats = Object.entries(countryToUniversities || {}).reduce((acc, [countryName, list]) => {
        const topoName = COUNTRY_NAME_TOPO_MAP[countryName] || countryName;
        if (!acc[topoName]) {
            acc[topoName] = {
                englishName: topoName,
                displayName: countryName,
                universities: [],
                total: 0
            };
        }

        acc[topoName].universities.push(...list);
        acc[topoName].total += list.length;
        if (!acc[topoName].displayName || acc[topoName].displayName === topoName) {
            acc[topoName].displayName = countryName;
        }

        return acc;
    }, {});
}

function renderFilterTabs() {
    if (!filterTabsContainer) return;

    const tabs = [
        `<button class='filter-tab active' data-region='all'>全部 (${universities.length})</button>`
    ];

    Object.entries(regionStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([region, count]) => {
            tabs.push(`<button class='filter-tab' data-region='${region}'>${region} (${count})</button>`);
        });

    filterTabsContainer.innerHTML = tabs.join('');

    filterTabsContainer.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabsContainer.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentRegion = tab.dataset.region;
            isExpanded = false;
            renderUniversities();
        });
    });
}

function renderCountryStats() {
    if (!countryStatsContainer) return;

    const statsHTML = Object.entries(countryToUniversities)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([country, list]) => {
            const flag = list[0]?.flag || '🎓';
            return `
                <div class='country-item'>
                    <span class='country-flag'>${flag}</span>
                    <span class='country-name'>${country}</span>
                    <span class='country-count'>${list.length}所</span>
                </div>
            `;
        })
        .join('');

    countryStatsContainer.innerHTML = statsHTML;
}

function renderUniversities(filterRegion) {
    if (!universitiesGrid) return;

    if (typeof filterRegion !== 'undefined') {
        currentRegion = filterRegion;
    }

    const filtered = universities.filter(uni => {
        const regionMatch = currentRegion === 'all' || uni.region === currentRegion;
        const searchTerm = currentSearchTerm.trim().toLowerCase();
        const searchMatch = !searchTerm ||
            uni.name.toLowerCase().includes(searchTerm) ||
            (uni.nameEn && uni.nameEn.toLowerCase().includes(searchTerm)) ||
            (uni.country && uni.country.toLowerCase().includes(searchTerm)) ||
            (uni.region && uni.region.toLowerCase().includes(searchTerm));
        return regionMatch && searchMatch;
    });

    if (!filtered.length) {
        universitiesGrid.innerHTML = '<p class=\'loading\'>未找到匹配的高校，请更换筛选条件。</p>';
        toggleExpandButton(false);
        return;
    }

    universitiesGrid.innerHTML = filtered
        .map(uni => {
            const countryName = uni.country || '其他地区';
            const strengths = uni.strengths || uni.highlight || '综合实力卓越';
            const highlight = uni.highlight || strengths;
            return `
                <div class='university-card' data-rank='${uni.rank}'>
                    <div class='card-header'>
                        <div class='rank-badge'>${uni.rank}</div>
                        <div class='country-flag'>${uni.flag || '🎓'}</div>
                    </div>
                    <div class='card-body'>
                        <h3>${uni.name}</h3>
                        <p class='university-name-en'>${uni.nameEn}</p>
                        <div class='card-info'>
                            <div class='info-item'>
                                <span class='info-icon'>📍</span>
                                <span class='info-text'>${countryName}</span>
                            </div>
                            <div class='info-item'>
                                <span class='info-icon'>⭐</span>
                                <span class='info-text'>${strengths}</span>
                            </div>
                        </div>
                        <div class='highlights'>
                            <h4>关键亮点</h4>
                            <p>${highlight}</p>
                        </div>
                        <a href='#' class='view-details'>查看详情 →</a>
                    </div>
                </div>
            `;
        })
        .join('');

    bindCardEvents();
    animateCards();
    toggleExpandButton(filtered.length > 6, filtered.length);
}

function bindCardEvents() {
    document.querySelectorAll('.university-card').forEach(card => {
        card.addEventListener('click', event => {
            event.preventDefault();
            const rank = Number(card.dataset.rank);
            showUniversityDetail(rank);
        });
    });
}

function toggleExpandButton(shouldShow, count = 0) {
    if (!expandButton) return;

    if (!shouldShow) {
        isExpanded = false;
        expandButton.classList.add('hidden');
        universitiesGrid.classList.remove('collapsed');
        expandButton.innerHTML = '展开查看更多 <span class=\'arrow\'>↓</span>';
        return;
    }

    expandButton.classList.remove('hidden');
    if (isExpanded) {
        universitiesGrid.classList.remove('collapsed');
        expandButton.innerHTML = '收起 <span class=\'arrow\'>↑</span>';
    } else {
        universitiesGrid.classList.add('collapsed');
        const remaining = Math.max(count - 6, 0);
        expandButton.innerHTML = `展开剩余 ${remaining} 所 <span class='arrow'>↓</span>`;
    }
}

function showUniversityDetail(rank) {
    if (!modal || !modalBody) return;

    const uni = universities.find(u => u.rank === rank);
    if (!uni) return;

    modalBody.innerHTML = `
        <div class='modal-header'>
            <div class='modal-rank'>${uni.rank}</div>
            <h2 class='modal-title'>${uni.name}</h2>
            <p class='modal-subtitle'>${uni.nameEn}</p>
            <p class='modal-location'>
                <span>${uni.flag || '🎓'}</span>
                <span>${uni.country || '其他地区'}</span>
            </p>
        </div>
        <div class='modal-section'>
            <h3>关键亮点</h3>
            <p>${uni.highlight || uni.strengths || '这所高校在多项指标上表现突出。'}</p>
        </div>
        <div class='modal-section'>
            <h3>历史背景</h3>
            <p>${uni.history}</p>
        </div>
        <div class='modal-section'>
            <h3>学科优势</h3>
            <p>${uni.strengths || uni.highlight || '官方尚未提供更详细的学科信息。'}</p>
        </div>
        <div class='modal-section'>
            <h3>参观攻略</h3>
            <p>${uni.visit}</p>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal?.classList.remove('active');
    document.body.style.overflow = '';
}

async function prepareWorldGeometry() {
    if (worldGeoJson || !window.topojson) {
        return;
    }

    if (WORLD_TOPOLOGY) {
        try {
            worldGeoJson = window.topojson.feature(WORLD_TOPOLOGY, WORLD_TOPOLOGY.objects.countries);
            return;
        } catch (error) {
            console.error('解析内置世界地图数据失败:', error);
        }
    }

    if (!window.fetch) return;

    try {
        const response = await fetch(WORLD_TOPO_URL, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`地图数据加载失败：${response.status}`);
        }
        const topo = await response.json();
        worldGeoJson = window.topojson.feature(topo, topo.objects.countries);
    } catch (error) {
        console.error('获取世界地图数据失败:', error);
    }
}

function renderWorldMap() {
    if (!worldMap) return;

    if (!window.d3 || !window.topojson || !worldGeoJson) {
        worldMap.innerHTML = '';
        const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        placeholder.setAttribute('x', '50%');
        placeholder.setAttribute('y', '50%');
        placeholder.setAttribute('text-anchor', 'middle');
        placeholder.setAttribute('fill', 'rgba(255,255,255,0.7)');
        placeholder.setAttribute('font-size', '18');
        placeholder.textContent = '世界地图加载中…';
        worldMap.appendChild(placeholder);
        return;
    }

    const svg = window.d3.select(worldMap);
    svg.selectAll('*').remove();

    const containerWidth = worldMap.clientWidth || 960;
    const mapWidth = containerWidth;
    const mapHeight = Math.max(520, Math.round(containerWidth * 0.5));
    svg.attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`);

    const projection = window.d3.geoNaturalEarth1().fitSize([mapWidth, mapHeight], worldGeoJson);
    const geoPath = window.d3.geoPath(projection);

    svg.append('path')
        .datum({ type: 'Sphere' })
        .attr('class', 'map-ocean')
        .attr('d', geoPath);

    svg.append('g')
        .attr('class', 'map-countries')
        .selectAll('path')
        .data(worldGeoJson.features)
        .join('path')
        .attr('class', d => `map-country ${normalizedCountryStats[d.properties.name] ? 'has-data' : 'no-data'}`)
        .attr('data-country', d => d.properties.name)
        .attr('d', geoPath)
        .attr('fill', d => getCountryColor(normalizedCountryStats[d.properties.name]?.total || 0))
        .on('mouseenter', (event, d) => handleCountryHover(event, d.properties.name))
        .on('mousemove', positionMapTooltip)
        .on('mouseleave', hideMapTooltip)
        .on('click', (_, d) => handleCountryClick(d.properties.name))
        .on('touchstart', (event, d) => {
            event.preventDefault();
            handleCountryHover(event, d.properties.name);
        })
        .on('touchmove', event => {
            event.preventDefault();
            positionMapTooltip(event);
        })
        .on('touchend', event => {
            event.preventDefault();
            hideMapTooltip();
        });
}

function getCountryClass(count) {
    if (count === 0) return '0';
    if (count === 1) return '1';
    if (count <= 3) return '2-3';
    if (count <= 5) return '4-5';
    return '6plus';
}

function getCountryColor(count) {
    const bucket = getCountryClass(count);
    return COLOR_BY_CLASS[bucket] || COLOR_BY_CLASS['0'];
}

function handleCountryHover(event, englishName) {
    if (!mapTooltip) return;
    const stats = normalizedCountryStats[englishName];
    if (!stats) {
        hideMapTooltip();
        return;
    }
    const list = stats.universities;
    const displayName = stats.displayName || englishName;
    showMapTooltip(displayName, list);
    positionMapTooltip(event);
}

function handleCountryClick(englishName) {
    const stats = normalizedCountryStats[englishName];
    const target = stats?.universities?.[0];
    if (target) {
        showUniversityDetail(target.rank);
    }
}

function showMapTooltip(countryName, list = []) {
    if (!mapTooltip || !tooltipCountry || !tooltipUniversities) return;

    tooltipCountry.textContent = `${countryName} (${list.length}所)`;

    tooltipUniversities.innerHTML = list.length
        ? list
            .slice(0, 6)
            .map(uni => `
                <div class='tooltip-university'>
                    <span class='tooltip-rank'>${uni.rank}</span>
                    <span class='tooltip-name'>${uni.name}</span>
                </div>
            `)
            .join('') + (list.length > 6 ? '<p class=\'tooltip-more\'>…还有更多</p>' : '')
        : '<p class=\'tooltip-empty\'>暂无该国家数据</p>';

    mapTooltip.classList.add('active');
}

function positionMapTooltip(event) {
    if (!mapTooltip || !worldMapContainer || !mapTooltip.classList.contains('active')) return;
    const containerRect = worldMapContainer.getBoundingClientRect();
    const point = event.touches?.[0] || event;
    const x = point.clientX - containerRect.left;
    const y = point.clientY - containerRect.top;
    const tooltipWidth = mapTooltip.offsetWidth || 260;
    const tooltipHeight = mapTooltip.offsetHeight || 160;
    const clampedX = Math.min(Math.max(tooltipWidth / 2, x), containerRect.width - tooltipWidth / 2);
    const clampedY = Math.min(Math.max(tooltipHeight, y), containerRect.height - 20);
    mapTooltip.style.left = `${clampedX}px`;
    mapTooltip.style.top = `${clampedY}px`;
}

function hideMapTooltip() {
    if (!mapTooltip) return;
    mapTooltip.classList.remove('active');
    mapTooltip.style.left = '-9999px';
    mapTooltip.style.top = '-9999px';
}

function initEventListeners() {
    if (searchInput) {
        searchInput.addEventListener('input', event => {
            currentSearchTerm = event.target.value;
            renderUniversities();
        });
    }

    if (expandButton) {
        expandButton.addEventListener('click', () => {
            isExpanded = !isExpanded;
            const cardCount = document.querySelectorAll('.university-card').length;
            toggleExpandButton(true, cardCount);
            if (!isExpanded) {
                document.getElementById('universities')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    modal?.addEventListener('click', event => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal?.classList.contains('active')) {
            closeModal();
        }
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', event => {
            event.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    window.addEventListener('resize', () => {
        clearTimeout(mapResizeTimer);
        mapResizeTimer = setTimeout(() => renderWorldMap(), 200);
    });
}

function initScrollAnimations() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    });

    document.querySelectorAll('.university-card, .about-card, .country-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s, transform 0.6s';
        observer.observe(el);
    });
}

function animateCards() {
    document.querySelectorAll('.university-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.6s, transform 0.6s';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 40);
    });
}

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const currentScroll = window.pageYOffset;
    navbar.style.boxShadow = currentScroll > 100 ? '0 2px 20px rgba(0, 0, 0, 0.1)' : 'none';
});

function setLoadingState(isLoading, message = '加载中…') {
    if (!universitiesGrid || !isLoading) return;
    universitiesGrid.innerHTML = `<p class='loading'>${message}</p>`;
}

function showErrorState(message) {
    if (!universitiesGrid) return;
    universitiesGrid.innerHTML = `<p class='loading'>${message}</p>`;
}
