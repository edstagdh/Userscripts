// ThePornDB - Enhanced Search Results — toolbar (Hide Images / Table View) + our table view,
// and our action buttons in the site's own Table mode (Card/Table switch)
// Part of tpdb_enhanced_search_results.user.js, loaded via @require (runs before the main
// script, in the same scope). Not a standalone userscript — install the .user.js.
// Version 3.2

// ====================
// SITE TABLE MODE — kebab (⋮) menu in the Actions column, Performers button in the Performers column
// ====================
let kebabMenuEl = null;
let kebabMenuOwner = null; // the ⋮ button the open menu belongs to

// Scene URL of a site-table row, read at click time (Vue may reuse <tr> elements across pages).
function siteTableRowHref(el) {
    return el.closest('tr')?.querySelector('td[data-col-key="title"] a')?.href || '';
}

function closeKebabMenu() {
    if (!kebabMenuEl) return;
    kebabMenuEl.style.display = 'none';
    kebabMenuOwner = null;
}

function buildKebabMenu() {
    const menu = ce('div');
    menu.id = 'tpdb-kebab-menu';
    ACTIONS.filter((a) => a.id !== 'performers').forEach((action) => {
        const item = ce('button');
        item.type = 'button';
        item.innerHTML = `<span class="tpdb-kebab-icon">${esc(action.icon)}</span><span>${esc(action.title)}</span>`;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const owner = kebabMenuOwner;
            closeKebabMenu();
            const href = owner && siteTableRowHref(owner);
            if (href) runAction(action, owner, href);
        });
        menu.appendChild(item);
    });
    document.body.appendChild(menu);

    // Close on outside click, Escape, scroll (page or the table's own scroller) and resize.
    document.addEventListener('mousedown', (e) => {
        if (kebabMenuOwner && !menu.contains(e.target) && e.target !== kebabMenuOwner) closeKebabMenu();
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeKebabMenu(); });
    window.addEventListener('scroll', closeKebabMenu, true);
    window.addEventListener('resize', closeKebabMenu);
    return menu;
}

function toggleKebabMenu(btn) {
    if (!kebabMenuEl) kebabMenuEl = buildKebabMenu();
    if (kebabMenuOwner === btn) return closeKebabMenu();

    kebabMenuOwner = btn;
    const menu = kebabMenuEl;
    menu.style.display = 'block';
    // Right-align under the button; flip above / clamp when it would leave the viewport.
    const r = btn.getBoundingClientRect();
    const pad = 8;
    let left = r.right - menu.offsetWidth;
    let top = r.bottom + 4;
    if (top + menu.offsetHeight > window.innerHeight - pad) top = r.top - menu.offsetHeight - 4;
    left = Math.min(Math.max(pad, left), window.innerWidth - menu.offsetWidth - pad);
    menu.style.left = left + 'px';
    menu.style.top = Math.max(pad, top) + 'px';
}

// Idempotent: checks each cell, so cells Vue re-renders get their buttons back.
function enhanceSiteTable() {
    const table = document.querySelector(SITE_TABLE_SEL);
    if (!table) return;
    const performersAction = ACTIONS.find((a) => a.id === 'performers');

    table.querySelectorAll('td[data-col-key="actions"]').forEach((td) => {
        if (td.querySelector('.tpdb-kebab')) return;
        const btn = ce('button', 'tpdb-kebab');
        btn.type = 'button';
        btn.title = 'More actions';
        btn.textContent = '⋮';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleKebabMenu(btn);
        });
        (td.querySelector('div.flex.flex-col') || td).appendChild(btn);
    });

    table.querySelectorAll('td[data-col-key="performers"]').forEach((td) => {
        if (!performersAction || td.querySelector('.tpdb-perf-btn')) return;
        const btn = ce('div', 'tpdb-copy-btn tpdb-perf-btn');
        btn.title = performersAction.title;
        btn.textContent = performersAction.icon;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const href = siteTableRowHref(btn);
            if (href) runAction(performersAction, btn, href);
        });
        td.appendChild(btn);
    });
}

const TABLE_COLUMNS = [
    ['Thumbnail', 100], ['Title', 260], ['Date (YYYY.MM.DD)', 80],
    ['Duration', 50], ['Site', 70], ['Performers', 150],
];

// Scrolls to the bottom until the number of cards stops growing (triggers lazy loading).
function waitForAllScenes(grid, maxTicks = 200) {
    return new Promise((resolve) => {
        let lastCount = 0, stable = 0, ticks = 0;
        const timer = setInterval(() => {
            const count = grid.querySelectorAll(CARD_SEL).length;
            window.scrollTo(0, document.body.scrollHeight);
            stable = count === lastCount ? stable + 1 : 0;
            lastCount = count;
            if (stable >= 3 || ++ticks >= maxTicks) {
                clearInterval(timer);
                window.scrollTo(0, 0);
                resolve();
            }
        }, 300);
    });
}

function getPerformersHTML(card) {
    return [...card.querySelectorAll('div.p-3.border-t a')].map((a) => {
        const cs = window.getComputedStyle(a);
        const svg = a.querySelector('svg')?.outerHTML || '';
        const name = a.querySelector('span:last-child')?.textContent.trim() || a.textContent.trim();
        return `<a href="${esc(a.href)}" target="_blank" class="tpdb-performer" style="background:${cs.backgroundColor};color:${cs.color};">${svg}<span>${esc(name)}</span></a>`;
    }).join('');
}

function buildTableRow(card) {
    const titleLink = card.querySelector('h2 a');
    const thumb = card.querySelector('img[style*="object-fit"]') || card.querySelector('img');
    const thumbSrc = fullImageSrc(thumb);

    const rawDate = card.querySelector('div.absolute div.flex:not(.place-items-center)')?.textContent?.trim() || '';
    const duration = card.querySelector('div.flex.place-items-center')?.childNodes[0]?.textContent?.trim() || '';

    let siteHTML = '';
    const siteAnchor = card.querySelector('div.grid.justify-end.items-center a');
    if (siteAnchor) {
        let href = siteAnchor.getAttribute('href') || '';
        if (href && !href.startsWith('http')) href = SITE_ORIGIN + href;
        siteHTML = `<a href="${esc(href)}" target="_blank" class="tpdb-site-link">${esc(siteAnchor.textContent.trim())}</a>`;
    }

    const row = ce('tr');
    row.innerHTML = `
        <td>${thumbSrc ? `<img src="${esc(thumbSrc)}" class="tpdb-thumb" loading="lazy" alt="">` : ''}</td>
        <td>${titleLink ? `<a href="${esc(titleLink.href)}" target="_blank">${esc(titleLink.textContent.trim())}</a>` : ''}</td>
        <td>${esc(formatDate(rawDate))}</td>
        <td>${esc(duration)}</td>
        <td>${siteHTML}</td>
        <td>${getPerformersHTML(card)}</td>`;
    return row;
}

function buildTable(grid) {
    const wrapper = ce('div');
    wrapper.id = 'tpdb-table-view';

    const table = ce('table');
    table.innerHTML = `
        <thead><tr>${TABLE_COLUMNS.map(([label, w]) => `<th style="width:${w}px;">${label}<div class="col-resizer"></div></th>`).join('')}</tr></thead>
        <tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    grid.querySelectorAll(CARD_SEL).forEach((card) => tbody.appendChild(buildTableRow(card)));

    wrapper.appendChild(table);
    makeColumnsResizable(table);
    return wrapper;
}

function makeColumnsResizable(table) {
    table.querySelectorAll('th').forEach((th) => {
        const resizer = th.querySelector('.col-resizer');
        if (!resizer) return;
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.pageX;
            const startWidth = th.offsetWidth;
            const onMove = (ev) => { th.style.width = startWidth + (ev.pageX - startX) + 'px'; };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// Toolbar above the scene grid. Idempotent: called on every DOM change.
function initToolbar() {
    if (document.getElementById('tpdb-toolbar')) return;
    const grid = document.querySelector(GRID_SEL);
    if (!grid || !grid.parentNode) return;

    const toolbar = ce('div', 'tpdb-toolbar');
    toolbar.id = 'tpdb-toolbar';

    // Hide images (panic) button
    const hideBtn = ce('button');
    hideBtn.type = 'button';
    hideBtn.textContent = 'Hide Images';
    hideBtn.addEventListener('click', () => {
        const hidden = document.body.classList.toggle('tpdb-hide-images');
        hideBtn.textContent = hidden ? 'Show Images' : 'Hide Images';
        hideBtn.classList.toggle('is-on', hidden);
    });

    // Table / grid toggle
    const tableBtn = ce('button', 'tpdb-table-btn');
    tableBtn.type = 'button';
    tableBtn.textContent = 'Table View';
    let tableActive = false, tableLoading = false, tableWrapper = null;

    tableBtn.addEventListener('click', async () => {
        if (tableLoading) return;
        const currentGrid = document.querySelector(GRID_SEL);
        if (!currentGrid) return;

        tableActive = !tableActive;
        tableBtn.textContent = tableActive ? 'Grid View' : 'Table View';
        tableBtn.classList.toggle('is-on', tableActive);

        if (tableActive) {
            currentGrid.style.display = 'none';
            tableLoading = true;
            try {
                await waitForAllScenes(currentGrid);
                tableWrapper?.remove();
                tableWrapper = buildTable(currentGrid); // rebuilt each time so it's never stale
                currentGrid.parentNode.insertBefore(tableWrapper, currentGrid);
            } finally {
                tableLoading = false;
            }
        } else {
            tableWrapper?.remove();
            tableWrapper = null;
            currentGrid.style.display = '';
        }
    });

    toolbar.append(hideBtn, tableBtn);
    grid.parentNode.insertBefore(toolbar, grid);
}
