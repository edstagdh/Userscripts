// ==UserScript==
// @name         [HF][EMP] Advanced Better filelist
// @version      1.4
// @description  inspired by original script by ephraim
// @author       edstagdh
// @namespace    https://github.com/edstagdh/Userscripts
// @match        https://www.empornium.sx/torrents.php?id=*
// @match        https://emparadise.rs/torrents.php?id=*
// @match        https://www.happyfappy.net/torrents.php?id=*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// ==/UserScript==

var urlMap = {};
var multiKeywordMode = false;
var caseSensitive = false;
var clickSearchMode = false;
var hiddenFileTypes = new Set();

// ── Settings ─────────────────────────────────────────────────────────────────
// Simple on/off flags for optional features. Defaults live here; if GM_getValue
// / GM_setValue are available (they are, per the @grant lines above) the actual
// value is persisted and can be flipped live via the Tampermonkey menu (the
// little script-manager icon in the browser toolbar → script commands), no
// code editing required. Toggling reloads the page so the change takes effect.

var DEFAULT_SETTINGS = {
    tagColumnsEnabled: false, // off by default — moves the tag list into the middle column and lays it out in columns
};
var SETTINGS_KEY_PREFIX = 'abf_setting_';

function getSetting(name) {
    if (typeof GM_getValue === 'undefined') return DEFAULT_SETTINGS[name];
    return GM_getValue(SETTINGS_KEY_PREFIX + name, DEFAULT_SETTINGS[name]);
}

function setSetting(name, value) {
    if (typeof GM_setValue === 'undefined') return;
    GM_setValue(SETTINGS_KEY_PREFIX + name, value);
}

// ── Changelog / "What's New" ────────────────────────────────────────────────

const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '1.4';

const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/EMP_HF/ABF_Changelog.md';
var changelogCache = null; // parsed [{version, date, changes:[...]}] once fetched this session
var changelogModalEl = null;

function parseChangelogMarkdown(md) {
    var lines = md.split(/\r?\n/);
    var entries = [];
    var current = null;
    lines.forEach(line => {
        var headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], date: (headerMatch[2] || '').trim(), changes: [] };
            entries.push(current);
            return;
        }
        var itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) {
            current.changes.push(itemMatch[1]);
        }
    });
    return entries.filter(e => e.changes.length);
}

function findChangelogIndexForVersion(entries, version) {
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].version === version) return i;
    }
    return -1;
}

function fetchChangelog(callback) {
    if (changelogCache) { callback(changelogCache, null); return; }
    if (typeof GM_xmlhttpRequest !== 'function') { callback(null, 'GM_xmlhttpRequest not available'); return; }
    GM_xmlhttpRequest({
        method: 'GET',
        url: CHANGELOG_URL,
        onload: function (res) {
            if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
            try {
                var parsed = parseChangelogMarkdown(res.responseText);
                changelogCache = parsed;
                callback(parsed, null);
            } catch (e) {
                callback(null, 'Parse error: ' + e.message);
            }
        },
        onerror: function () { callback(null, 'Network error fetching changelog'); },
        ontimeout: function () { callback(null, 'Timed out fetching changelog'); },
        timeout: 10000,
    });
}

function buildChangelogModal() {
    var modal = ce('div', 'abf_changelog_modal hidden');
    modal.innerHTML = `
        <div class="abf_changelog_box">
            <div class="abf_changelog_header">
                <div class="abf_changelog_header_left">
                    <h2>📜 What's New</h2>
                    <span class="abf_changelog_subtitle">Advanced Better filelist &mdash; currently v${SCRIPT_VERSION}</span>
                </div>
                <button type="button" class="abf_changelog_close" title="Close">✕</button>
            </div>
            <div class="abf_changelog_body" id="abf_changelog_body_content"></div>
            <div class="abf_changelog_footer">
                <a class="abf_changelog_github_link" href="https://github.com/edstagdh/Userscripts" target="_blank" rel="noopener noreferrer">🔗 View on GitHub</a>
                <button type="button" class="abf_changelog_btn">Got it!</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    var closeFn = () => modal.classList.add('hidden');
    modal.querySelector('.abf_changelog_close').addEventListener('click', closeFn);
    modal.querySelector('.abf_changelog_btn').addEventListener('click', closeFn);
    modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });

    return modal;
}

function renderChangelogBody(versionsToShow, errorMsg, updateAvailableVersion) {
    var body = changelogModalEl.querySelector('#abf_changelog_body_content');
    var html = '';
    if (updateAvailableVersion) {
        html += `<div class="abf_update_banner">🔔 A newer version (v${updateAvailableVersion}) is available on GitHub — you're currently on v${SCRIPT_VERSION}.</div>`;
    }
    if (errorMsg) {
        html += `<div class="abf_changelog_error">Couldn't load the changelog (${errorMsg}). Check the GitHub repo directly for the latest version history.</div>`;
    } else if (!versionsToShow || !versionsToShow.length) {
        html += `<div class="abf_changelog_error">No changelog entries found.</div>`;
    } else {
        html += versionsToShow.map(item => `
            <div class="abf_version_block">
                <div class="abf_version_title">
                    <span class="abf_version_badge">v${item.version}</span>
                    ${item.date ? `<span class="abf_version_date">${item.date}</span>` : ''}
                </div>
                <ul class="abf_version_changes">
                    ${item.changes.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    }
    body.innerHTML = html;
}

function showChangelogModal() {
    if (!changelogModalEl) {
        changelogModalEl = buildChangelogModal();
    }
    changelogModalEl.classList.remove('hidden');
    changelogModalEl.querySelector('#abf_changelog_body_content').innerHTML =
        '<div class="abf_changelog_loading">Loading changelog&hellip;</div>';

    fetchChangelog((entries, err) => {
        if (err) { renderChangelogBody(null, err, null); return; }
        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        if (currentIdx === -1) {
            // Installed version isn't in the fetched changelog — show the latest
            // entry as a best-effort fallback rather than nothing.
            renderChangelogBody(entries.length ? [entries[0]] : [], null, null);
            return;
        }
        var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
        renderChangelogBody([entries[currentIdx]], null, updateAvailableVersion);
    });
}

function checkVersionUpdate() {
    if (typeof GM_getValue === 'undefined' || typeof GM_setValue === 'undefined') return;

    var lastVersion = GM_getValue('abf_last_version', null);
    if (lastVersion === SCRIPT_VERSION) return;
    GM_setValue('abf_last_version', SCRIPT_VERSION);

    fetchChangelog((entries, err) => {
        if (err) return; // stay quiet on auto-check failures; the manual menu command still works
        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        // Only ever show changes up through the version actually running right now —
        // entries above currentIdx belong to a newer release we haven't been updated to yet.
        var availableEntries = currentIdx === -1 ? entries : entries.slice(currentIdx);
        var toShow;
        if (!lastVersion) {
            toShow = availableEntries.length ? [availableEntries[0]] : [];
        } else {
            toShow = [];
            for (var i = 0; i < availableEntries.length; i++) {
                if (availableEntries[i].version === lastVersion) break;
                toShow.push(availableEntries[i]);
            }
            if (!toShow.length && availableEntries.length) toShow = [availableEntries[0]];
        }
        if (!toShow.length) return;
        var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;

        if (!changelogModalEl) changelogModalEl = buildChangelogModal();
        changelogModalEl.classList.remove('hidden');
        renderChangelogBody(toShow, null, updateAvailableVersion);
    });
}

const combinedPattern = new RegExp(
    '(?:_?(?:thumb|screen|preview|s)s?)?\.(?:jpg|jpeg|webp|bmp|png|gif|mp4|avi|m4v|mpg|mpeg|mkv|mov|wmv|flv|vob)', 'ig');

function nameHash(name) {
    var hash = name.toLowerCase();
    hash = hash.replaceAll(combinedPattern, '');
    hash = hash.replaceAll(/[\W_\[\]]/g, '');
    return hash;
}


function tree(folder) {
    var folders = [];
    var files = [];
    folder.files.forEach(f => {
        if (/\//.test(f.name)) {
            var levels = f.name.split('/');
            var currentLevel = levels.shift();
            f.name = levels.join('/');
            var existing = folders.find(fold => fold.name == currentLevel);
            if (existing) {
                existing.files.push(f);
            } else {
                var newFolder = {};
                newFolder.name = currentLevel;
                newFolder.files = [f];
                folders.push(newFolder);
            }
        } else {
            f.url = urlMap[nameHash(f.name)];
            files.push(f);
        }
    });
    folder.folders = folders;
    folder.files = files;
    folders.forEach(tree);
    folder.byteSize = folderSize(folder);
    return folder;
}


function folderSize(folder) {
    var fileSize = folder.files.reduce((currentSize, file) => currentSize + file.byteSize, 0);
    if (folder.folders.length) {
        return fileSize + folder.folders.reduce((currentSize, folder) => currentSize + folderSize(folder), 0);
    } else {
        return fileSize;
    }
}


function sizeInBytes(ssize) {
    ssize = ssize.replace(',', '');
    var number, unit;
    [number, unit] = ssize.split(' ');
    number = +number;
    var suffixes = { KiB: 1024, MiB: 1024 * 1024, GiB: 1024 * 1024 * 1024, TiB: 1024 * 1024 * 1024 * 1024 };
    return number * suffixes[unit] || number;
}


function formatBytes(bytes) {
    if (bytes == 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


function ce(type, className) {
    var e = document.createElement(type);
    e.className = className || '';
    return e;
}


function getFileType(fileName) {
    var type;
    type = fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i);
    if (type) return `icon_files_image file_type_${type[1]}`;
    type = fileName.match(/\.(mp4|avi|m4v|mpg|mpeg|mkv|mov|wmv|flv)$/i);
    if (type) return `icon_files_video file_type_${type[1]}`;
    type = fileName.match(/\.(txt|srt)$/i);
    if (type) return `icon_files_text file_type_${type[1]}`;
    type = fileName.match(/\.(zip|rar|7z)$/i);
    if (type) return `icon_files_compressed file_type_${type[1]}`;
    type = fileName.match(/\.(iso|vob)$/i);
    if (type) return `icon_files_disc file_type_${type[1]}`;
    type = fileName.match(/\.(mp3|wav|flac|m4a|wma|aac)$/i);
    if (type) return `icon_files_audio file_type_${type[1]}`;
    type = fileName.match(/\.(exe|apk)$/i);
    if (type) return `icon_files_executable file_type_${type[1]}`;
    return 'icon_files_unknown';
}


function makeFolderDom(folder) {
    var folderElement = ce('div', 'folder');
    folderElement.dataset.name = folder.name;
    var folderDetails = ce('div', 'folder_details folder_closed tree_item');
    var contains = '';
    if (folder.files.length > 1) {
        contains = `${folder.files.length} files`;
    } else if (folder.files.length == 1) {
        contains = '1 file';
    } else if (!folder.files.length && !folder.folders.length) {
        contains = 'empty';
    }
    folderDetails.innerHTML = `<span class="folder_name">${folder.name}</span>
        <span class="folder_files">${contains}</span>
        <span class="folder_size">${formatBytes(folder.byteSize)}</span>`;
    folderElement.append(folderDetails);
    var container = ce('div', 'folder_container');
    folderDetails.addEventListener('click', toggleCollapsed);
    if (folder.folders.length) {
        var folderList = ce('ul', 'folder_list');
        for (var f of folder.folders) {
            var foldi = ce('li', 'folder_item');
            foldi.appendChild(makeFolderDom(f));
            folderList.append(foldi);
        }
        container.append(folderList);
    }
    if (folder.files.length) {
        var fileList = ce('ul', 'file_list');
        for (var file of folder.files) {
            var filei = ce('li', 'file_item tree_item');
            var istack = ce('div', 'icon_stack');
            var icon = ce('i', `font_icon file_icons ${getFileType(file.name)}`);
            istack.append(icon);
            filei.append(istack);
            var fname = ce('span', 'file_name');
            fname.innerText = file.name;
            if (file.url) {
                var preview = ce('a', 'file_preview');
                preview.href = file.url;
                preview.dataset.caption = folder.name == '/' ? `${file.name}` : `${folder.name} / ${file.name}`;
                preview.dataset.fancybox = `${folder.name}`;
                preview.append(fname);
                filei.append(preview);
            } else {
                filei.append(fname);
            }
            var fsize = ce('span', 'file_size');
            fsize.innerText = file.size;
            filei.append(fsize);
            fileList.append(filei);
        }
        container.append(fileList);
    }
    folderElement.append(container);
    return folderElement;
}


function toggleCollapsed(e) {
    this.classList.toggle('folder_open');
    this.classList.toggle('folder_closed');
}


function createTree() {
    var treeContainer = ce('div', 'tree_container');
    treeContainer.append(makeFolderDom(root));
    var firstFolder = treeContainer.querySelector('.folder_closed');
    firstFolder.classList.remove('folder_closed');
    firstFolder.classList.add('folder_open');

    // click-to-search delegation — lives on the container so it survives re-sorts
    treeContainer.addEventListener('click', function (e) {
        if (!clickSearchMode) return;
        var fileNameEl = e.target.closest('.file_name');
        if (!fileNameEl) return;
        e.preventDefault();
        e.stopPropagation();
        var rawName = fileNameEl.textContent.trim();
        var nameWithoutExt = rawName.replace(/\.[^.]+$/, '');
        var searchUrl = window.location.origin + '/torrents.php?searchtext=' + encodeURIComponent(nameWithoutExt);
        window.open(searchUrl, '_blank');
    });

    return treeContainer;
}


function clearFilter(e) {
    if (e.key != "Escape") return;
    e.target.value = '';
    applyFilters();
}


// ── Multi-keyword helpers ─────────────────────────────────────────────────────

function getSearchTerms(value) {
    if (multiKeywordMode) {
        return value.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
    }
    return [value];
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAllTerms(text, terms) {
    var flags = caseSensitive ? '' : 'i';
    return terms.every(term => new RegExp(term, flags).test(text));
}

function wrapAllMatches(text, terms) {
    var flags = caseSensitive ? 'g' : 'gi';
    var result = text;
    terms.forEach(term => {
        var re = new RegExp(term, flags);
        result = result.replace(re, match => {
            var span = ce('span', 'filter_match');
            span.textContent = match;
            return span.outerHTML;
        });
    });
    return result;
}


// ── File type panel ───────────────────────────────────────────────────────────

function collectFileTypes(folder, types) {
    folder.files.forEach(f => {
        var ext = f.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
        if (ext) types.add(ext);
    });
    folder.folders.forEach(sub => collectFileTypes(sub, types));
    return types;
}

function updateTypeButton() {
    var btn = document.querySelector('.header_types_toggle');
    if (!btn) return;
    var count = hiddenFileTypes.size;
    if (count > 0) {
        btn.classList.add('types_active');
        btn.dataset.hidden = count;
    } else {
        btn.classList.remove('types_active');
        delete btn.dataset.hidden;
    }
}

function buildTypePanel(types) {
    var panel = ce('div', 'types_panel hidden');
    var panelHeader = ce('div', 'types_panel_header');
    var panelTitle = ce('span', 'types_panel_title');
    panelTitle.innerText = 'Filter by file type:';
    var btnAll = ce('button', 'types_btn');
    btnAll.type = 'button';
    btnAll.innerText = '✔ All';
    var btnNone = ce('button', 'types_btn');
    btnNone.type = 'button';
    btnNone.innerText = '✖ None';
    panelHeader.append(panelTitle, btnAll, btnNone);
    panel.append(panelHeader);

    var grid = ce('div', 'types_grid');
    var sortedTypes = [...types].sort();

    sortedTypes.forEach(ext => {
        var label = ce('label', 'type_label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.value = ext;
        cb.addEventListener('change', function () {
            if (this.checked) hiddenFileTypes.delete(ext);
            else hiddenFileTypes.add(ext);
            updateTypeButton();
            applyFilters();
        });
        var icon = ce('i', 'font_icon file_icons ' + getFileType('file.' + ext));
        label.append(cb, icon, document.createTextNode('\u00a0' + ext));
        grid.append(label);
    });

    panel.append(grid);

    btnAll.addEventListener('click', () => {
        hiddenFileTypes.clear();
        grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
        updateTypeButton();
        applyFilters();
    });
    btnNone.addEventListener('click', () => {
        sortedTypes.forEach(ext => hiddenFileTypes.add(ext));
        grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
        updateTypeButton();
        applyFilters();
    });

    return panel;
}


// ── Unified filter ────────────────────────────────────────────────────────────

function applyFilters() {
    var container = document.querySelector('.tree_container');
    if (!container) return;

    var keywordInput = document.querySelector('.header_filter');
    var sizeInput = document.querySelector('.header_size_filter');
    var keywordValue = keywordInput ? keywordInput.value : '';
    var sizeValue = sizeInput ? sizeInput.value.trim().replace(/,/g, '') : '';

    var hasKeyword = keywordValue.length > 0;
    var hasSize = sizeValue.length > 0;
    var hasTypeFilter = hiddenFileTypes.size > 0;

    container.classList.add('hidden');
    container.querySelectorAll('.hidden, .folder_force_open, .file_found').forEach(f => {
        f.classList.remove('hidden', 'folder_force_open', 'file_found');
    });
    container.querySelectorAll('.filter_match').forEach(m => m.outerHTML = m.textContent);
    container.querySelectorAll('.size_match').forEach(el => el.classList.remove('size_match'));

    if (!hasKeyword && !hasSize && !hasTypeFilter) {
        container.classList.remove('hidden');
        return;
    }

    var terms = hasKeyword ? getSearchTerms(keywordValue) : [];

    container.querySelectorAll('.file_item').forEach(fileItem => {
        var fileNameEl = fileItem.querySelector('.file_name');
        var fileSizeEl = fileItem.querySelector('.file_size');
        var fileName = fileNameEl ? fileNameEl.textContent : '';
        var fileSize = fileSizeEl ? fileSizeEl.textContent.replace(/,/g, '') : '';

        // size comparison respects case sensitivity for unit strings (e.g. GiB vs gib)
        var sizeOk = !hasSize || (caseSensitive
            ? fileSize.includes(sizeValue)
            : fileSize.toLowerCase().includes(sizeValue.toLowerCase()));

        var ext = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || '';
        var typeOk = !hasTypeFilter || !hiddenFileTypes.has(ext);
        var keywordOk = !hasKeyword || matchesAllTerms(fileName, terms);

        if (typeOk && sizeOk && keywordOk) {
            fileItem.classList.remove('hidden');
            fileItem.classList.add('file_found');
            if (hasKeyword) {
                var el = fileNameEl.querySelector('a') || fileNameEl;
                el.innerHTML = wrapAllMatches(el.innerText, terms);
            }
            if (hasSize && fileSizeEl) {
                fileSizeEl.classList.add('size_match');
            }
        } else {
            fileItem.classList.add('hidden');
            fileItem.classList.remove('file_found');
        }
    });

    container.querySelectorAll('.folder').forEach(folder => {
        var found = folder.querySelector('.file_found');
        var folderNameEl = folder.querySelector('.folder_name');
        var folderNameHit = hasKeyword && folderNameEl && matchesAllTerms(folderNameEl.textContent, terms);

        if (found || folderNameHit) {
            folder.classList.remove('hidden');
            folder.classList.add('file_found');
            if (found) folder.querySelector('.folder_details').classList.add('folder_force_open');
            if (folderNameHit && folderNameEl) {
                var el = folderNameEl.querySelector('a') || folderNameEl;
                el.innerHTML = wrapAllMatches(el.innerText, terms);
            }
        } else {
            folder.classList.remove('file_found');
            folder.classList.add('hidden');
        }
    });

    container.querySelector('.folder')?.classList.remove('hidden');
    container.classList.remove('hidden');
}


function wrapMatch(text, match) {
    var matchElement = ce('span', 'filter_match');
    matchElement.textContent = match[0];
    return text.replaceAll(match, matchElement.outerHTML);
}


function expandAllFolders(e) {
    e.preventDefault();
    var closedFolders = document.querySelectorAll('.folder_closed');
    var openFolders = [...document.querySelectorAll('.folder_open')].slice(1);
    if (e.target.dataset.collapsed == 'collapsed') {
        closedFolders.forEach(f => { f.classList.add('folder_open'); f.classList.remove('folder_closed'); });
        e.target.dataset.collapsed = 'expanded';
        e.target.innerText = e.target.innerText.replace('📁Expand', '📂Collapse');
    } else if (e.target.dataset.collapsed == 'expanded') {
        openFolders.forEach(f => { f.classList.add('folder_closed'); f.classList.remove('folder_open'); });
        e.target.dataset.collapsed = 'collapsed';
        e.target.innerText = e.target.innerText.replace('📂Collapse', '📁Expand');
    }
}


function list2Tree() {
    var tabl = fileList.querySelector('table');
    var rows = [...tabl.rows];

    root.name = rows[0].innerText.trim();
    root.files = rows.slice(2).map(r => {
        var tdata = r.querySelectorAll('td');
        return {
            name: tdata[0].innerText.trim(),
            size: tdata[1].innerText.trim(),
            byteSize: sizeInBytes(tdata[1].innerText.trim())
        };
    });

    root = tree(root);
    tabl.style.display = 'none';

    var header = ce('div', 'tree_header colhead');
    var headerName = ce('span', 'header_name sort_ascending header_item');
    headerName.innerText = 'Name';
    headerName.addEventListener('click', sortTree);
    var headerFiles = ce('span', 'header_files header_item');
    headerFiles.innerText = 'Files';
    headerFiles.addEventListener('click', sortTree);
    var headerSize = ce('span', 'header_size header_item sort_ascending');
    headerSize.innerText = 'Size';
    headerSize.addEventListener('click', sortTree);
    headerName.dataset.type = 'header_name';
    headerFiles.dataset.type = 'header_files';
    headerSize.dataset.type = 'header_size';

    var tools = ce('span', 'header_tools');
    var expand = ce('a', 'header_expand');
    var multiToggle = ce('button', 'header_multi_toggle');
    var caseToggle = ce('button', 'header_case_toggle');
    var filterInput = ce('input', 'header_filter');
    var sizeFilterInput = ce('input', 'header_size_filter');
    var typesToggle = ce('button', 'header_types_toggle');
    var searchToggle = ce('button', 'header_search_toggle');
    var changelogToggle = ce('button', 'header_changelog_toggle');

    var allTypes = collectFileTypes(root, new Set());
    var typesPanel = buildTypePanel(allTypes);

    multiToggle.type = 'button';
    multiToggle.title = 'Toggle multi-keyword mode (space = AND)';
    multiToggle.innerText = '⊞ Multi';
    multiToggle.addEventListener('click', function () {
        multiKeywordMode = !multiKeywordMode;
        this.classList.toggle('multi_active', multiKeywordMode);
        if (filterInput.value.length > 0) applyFilters();
    });

    caseToggle.type = 'button';
    caseToggle.title = 'Toggle case-sensitive search';
    caseToggle.innerText = 'Aa';
    caseToggle.addEventListener('click', function () {
        caseSensitive = !caseSensitive;
        this.classList.toggle('case_active', caseSensitive);
        if (filterInput.value.length > 0 || sizeFilterInput.value.length > 0) applyFilters();
    });

    typesToggle.type = 'button';
    typesToggle.title = 'Filter by file type';
    typesToggle.innerText = '🗂 Types';
    typesToggle.addEventListener('click', () => typesPanel.classList.toggle('hidden'));

    searchToggle.type = 'button';
    searchToggle.title = 'Turn filenames in to "open a filename site search in a new tab"';
    searchToggle.innerText = '🔗 Search';
    searchToggle.addEventListener('click', function () {
        clickSearchMode = !clickSearchMode;
        this.classList.toggle('search_active', clickSearchMode);
        document.querySelector('.tree_container')?.classList.toggle('click_search_mode', clickSearchMode);
    });

    changelogToggle.type = 'button';
    changelogToggle.title = "Show changelog / what's new";
    changelogToggle.innerText = '📜';
    changelogToggle.addEventListener('click', () => showChangelogModal());

    expand.text = '(📁Expand all)';
    expand.href = '#';
    expand.title = 'Expand all folders';
    expand.dataset.collapsed = 'collapsed';
    expand.addEventListener('click', expandAllFolders);

    filterInput.placeholder = '🔍 Name';
    filterInput.type = 'search';
    filterInput.title = 'Enter File Name[freetext]';
    filterInput.addEventListener('input', applyFilters);
    filterInput.addEventListener('keyup', clearFilter);

    sizeFilterInput.placeholder = '📐 Size';
    sizeFilterInput.title = 'Enter File Size[freetext]';
    sizeFilterInput.type = 'search';
    sizeFilterInput.addEventListener('input', applyFilters);
    sizeFilterInput.addEventListener('keyup', clearFilter);

    tools.append(expand, multiToggle, caseToggle, filterInput, sizeFilterInput, typesToggle, searchToggle, changelogToggle);

    var headerLeft = ce('span', 'header_left');
    var headerRight = ce('span', 'header_right');
    headerLeft.append(headerName);
    headerRight.append(headerFiles, headerSize);
    header.append(headerLeft, tools, headerRight);

    fileList.append(header);
    fileList.append(typesPanel);

    var treeContainer = createTree();
    fileList.append(treeContainer);
    fileList.classList.remove('hidden');
}


function sortFolderSize(folder, ascending) {
    var direction = ascending ? 1 : -1;
    folder.files.sort((a, b) => direction * (b.byteSize - a.byteSize));
    folder.folders.sort((a, b) => direction * (b.byteSize - a.byteSize));
    folder.folders.forEach(f => sortFolderSize(f, ascending));
}

function sortFolderFiles(folder, ascending) {
    var direction = ascending ? 1 : -1;
    folder.folders.sort((a, b) => direction * (b.files.length - a.files.length));
    folder.folders.forEach(f => sortFolderFiles(f, ascending));
}

function sortFolderName(folder, ascending) {
    var direction = ascending ? -1 : 1;
    folder.files.sort((a, b) => direction * (a.name.localeCompare(b.name)));
    folder.folders.sort((a, b) => direction * (a.name.localeCompare(b.name)));
    folder.folders.forEach(f => sortFolderName(f, ascending));
}


function sortTree() {
    var isAscending = this.classList.contains('sort_ascending');
    if (isAscending) {
        this.classList.add('sort_descending');
        this.classList.remove('sort_ascending');
    } else {
        this.classList.add('sort_ascending');
        this.classList.remove('sort_descending');
    }
    var others = this.parentElement.querySelectorAll(`.header_item:not(.${this.dataset.type})`);
    for (var other of others) {
        other.classList.remove('sort_ascending', 'sort_descending');
    }
    document.querySelector('.tree_container').remove();
    if (this.classList.contains('header_name')) sortFolderName(root, isAscending);
    else if (this.classList.contains('header_files')) sortFolderFiles(root, isAscending);
    else if (this.classList.contains('header_size')) sortFolderSize(root, isAscending);
    var newTree = createTree();
    // re-apply click-search cursor class if mode is still on
    if (clickSearchMode) newTree.classList.add('click_search_mode');
    fileList.append(newTree);
}


function findThumbnails() {
    var images = document.querySelectorAll('a[data-fancybox]');
    images.forEach(i => {
        var url = i.href;
        var name = url.split('/').pop();
        urlMap[nameHash(name)] = url;
    });
}


function bindGallery() {
    if (!window.Fancybox) return;
    var fancyboxConfig = {
        wheel: "slide",
        animationDuration: 80,
        contentClick: "toggleCover",
        contentDblClick: "zoomToMax",
        Toolbar: {
            display: {
                left: ["infobar"],
                middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "thumbs"],
                right: ["close"],
            },
        },
        Thumbs: { type: "classic", autoStart: false, showOnStart: false },
        Images: {
            Panzoom: { maxScale: 2, panMode: "mousemove", mouseMoveFriction: 0.2, mouseMoveFactor: 1.2 }
        }
    };
    document.querySelectorAll('.folder:has(.file_preview)').forEach(folder => {
        Fancybox.bind(`[data-fancybox="${folder.dataset.name}"]`, fancyboxConfig);
    });
}


var fileList = document.querySelector('div[id^="files_"]');
var fileListToggle = document.querySelector('a[onclick^="show_files"]');

if (!document.getElementById('filetree-toggle-style')) {
    var ftStyle = document.createElement('style');
    ftStyle.id = 'filetree-toggle-style';
    ftStyle.textContent = `
        .filetree-toggle-btn {
            display: inline-block;
            margin-left: 4px;
            padding: 4px 12px;
            border-radius: 6px;
            background: linear-gradient(135deg, #ff9800, #ff5722);
            color: white !important;
            font-weight: bold;
            text-decoration: none !important;
            cursor: pointer;
            box-shadow: 0 0 8px rgba(255,87,34,0.7), 0 0 16px rgba(255,87,34,0.4);
            transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
            animation: ftPulse 1.8s infinite;
        }
        .filetree-toggle-btn:hover {
            transform: scale(1.08);
            filter: brightness(1.1);
            box-shadow: 0 0 12px rgba(255,87,34,0.9), 0 0 24px rgba(255,87,34,0.7);
        }
        @keyframes ftPulse {
            0%   { box-shadow: 0 0 6px rgba(255,87,34,0.5), 0 0 12px rgba(255,87,34,0.3); }
            50%  { box-shadow: 0 0 12px rgba(255,87,34,0.9), 0 0 24px rgba(255,87,34,0.7); }
            100% { box-shadow: 0 0 6px rgba(255,87,34,0.5), 0 0 12px rgba(255,87,34,0.3); }
        }
    `;
    document.head.appendChild(ftStyle);
}

var ftSpacer = document.createElement('br');
fileListToggle.parentNode.insertBefore(ftSpacer, fileListToggle);

fileListToggle.textContent = '📂 Show file tree';
fileListToggle.className = (fileListToggle.className + ' filetree-toggle-btn').trim();

var root = {};
fileListToggle.onclick = function toggleTree() {
    findThumbnails();
    if (this.classList.contains('open_tree')) {
        this.textContent = '📂 Show file tree';
    } else {
        this.textContent = '📂 Hide file tree';
    }
    this.classList.toggle('open_tree');
    fileList.classList.toggle('hidden');
    if (!document.querySelector('.tree_container')) {
        list2Tree();
        bindGallery();
    }
    return false;
};

var oldListItemOdd = fileList.querySelector('.rowa');
var oldStyleOdd = getComputedStyle(oldListItemOdd);
var treeStyle = ce('style');
document.head.append(treeStyle);
treeStyle.innerHTML = `
.tree_container * {
    margin: 0;
}
.tree_container {
    max-height: 600px;
    overflow-y: scroll;
    resize: vertical;
    contain: content;
}
.folder_container {
    margin-left: 1.5em;
    border-left: dashed thin #8FC5E0;
}
.tree_header {
    display: flex;
    padding: 0.5em 2em 0.3em 2em;
    justify-content: space-between;
    align-items: baseline;
}
.sort_ascending:after {
    content: '🡩';
    margin-left: 0.3em;
    font-size: 10pt;
}
.sort_descending:after {
    content: '🡫';
    margin-left: 0.3em;
    font-size: 10pt;
}
.header_item {
    cursor: pointer;
}
.header_left {
    display: flex;
    justify-content: start;
    flex: 1;
}
.header_right {
    display: flex;
    justify-content: end;
    gap: 2.5em;
    flex: 1;
}
.header_tools {
    display: flex;
    align-items: baseline;
    flex: 3;
    justify-content: center;
    gap: 0.4em;
}
.header_expand {
    font-weight: normal;
    font-size: 10pt;
    flex: 1;
    min-width: 8em;
    max-width: 9em;
}
.header_filter {
    border: none;
    border-radius: 5px;
    background: #29374F;
    color: #bcd;
    max-width: 20em;
    padding: 4px;
    flex: 3;
}
.header_size_filter {
    border: none;
    border-radius: 5px;
    background: #29374F;
    color: #bcd;
    width: 7em;
    padding: 4px;
    flex-shrink: 0;
}
.header_multi_toggle,
.header_case_toggle,
.header_types_toggle,
.header_search_toggle,
.header_changelog_toggle {
    border: 1px solid #4a6080;
    border-radius: 4px;
    background: #29374F;
    color: #89a0b8;
    font-size: 9pt;
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
}
.header_multi_toggle:hover,
.header_case_toggle:hover,
.header_types_toggle:hover,
.header_search_toggle:hover,
.header_changelog_toggle:hover {
    background: #354a68;
    color: #bcd;
}
.header_multi_toggle.multi_active,
.header_case_toggle.case_active,
.header_types_toggle.types_active,
.header_search_toggle.search_active {
    background: #1a4a7a;
    color: #7ecfff;
    border-color: #4a9fd4;
}
.header_types_toggle.types_active::after {
    content: ' (' attr(data-hidden) ' hidden)';
    font-size: 8pt;
}
.types_panel {
    background: #1e2b3e;
    border-bottom: 1px solid #3a5070;
    padding: 0.5em 2em;
}
.types_panel_header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.5em;
}
.types_panel_title {
    flex: 1;
    font-size: 9pt;
    color: #89a0b8;
}
.types_btn {
    border: 1px solid #4a6080;
    border-radius: 3px;
    background: #29374F;
    color: #bcd;
    font-size: 8pt;
    padding: 1px 7px;
    cursor: pointer;
}
.types_btn:hover {
    background: #354a68;
}
.types_grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em 1.4em;
}
.type_label {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-size: 8pt;
    color: #bcd;
    cursor: pointer;
    white-space: nowrap;
}
.type_label input {
    cursor: pointer;
}
.file_list {
    padding-left: 0.5em;
}
.folder_list {
    margin-bottom: 10px;
}
.folder li {
    list-style-type: none;
}
.file_item:nth-child(odd) {
    background-color: ${oldStyleOdd.backgroundColor};
}
.folder_details {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 2px 0 2px 5px;
    margin-left: 0.5em;
    cursor: pointer;
}
.folder_open:before {
    content: '◢​📂';
    font-size: 12pt;
}
.folder_closed:before {
    content: '▷​📁';
    font-size: 12pt;
}
.folder_closed + div {
    display: none;
}
.folder_force_open + div {
    display: block;
}
.folder_details:before {
    margin-right: 0.3em;
}
.folder_item:nth-child(odd) .folder_details {
    background-color: ${oldStyleOdd.backgroundColor};
}
.folder_name {
    flex: 1;
}
.folder_files {
    font-size: 9pt;
    min-width: 7em;
    text-align: end;
}
.folder_size {
    padding-right: 1em;
    font-size: 9pt;
    min-width: 7em;
    text-align: end;
}
.file_item {
    display: flex;
    align-items: center;
    font-size: 8pt;
    padding: 3px;
    cursor: default;
}
.file_name {
    flex: 1;
    margin-left: 0.5em;
}
/* pointer cursor on filenames when click-search is active */
.click_search_mode .file_name {
    cursor: pointer;
    text-decoration: underline dotted #6baad0;
}
.file_preview {
    color: inherit;
    flex: 1;
}
.file_preview::after {
    content: '👁';
    padding-left: 0.5em;
}
.file_size {
    padding-right: 1em;
}
.size_match {
    color: #7ecfff;
    font-weight: bold;
}
.filter_match {
    font-weight: bold;
    background-color: yellow;
}
.tree_item:hover {
    background-color: #6baad040;
}
.file_item .font_icon {
    font-size: 10pt;
}
.file_item .icon_files_compressed {
    color: #F5C438;
    -webkit-text-stroke: 0.5px black;
}
.file_item .icon_files_executable {
    color: #f318bc;
}
.file_type_jpg, .file_type_jpeg, .file_type_webp {
    color: #a88526;
}
.file_type_mp4, .file_type_m4v {
    color: #7406a1;
}
.file_type_avi, .file_type_gif {
    color: #026102;
}
.file_type_mpg, .file_type_mpeg, .file_type_png {
    color: #740000;
}
.file_type_mkv, .file_type_mov, .file_type_bmp {
    color: #003cac;
}
.file_type_wmv {
    color: #694d00;
}

/* changelog / "What's New" modal */
.abf_changelog_modal {
    position: fixed;
    inset: 0;
    z-index: 100055;
    background: rgba(8, 9, 13, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
.abf_changelog_modal.hidden {
    display: none;
}
.abf_changelog_box {
    background: #1e2b3e;
    border: 1px solid #3a5070;
    border-radius: 10px;
    width: 100%;
    max-width: 480px;
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0,0,0,0.55);
    overflow: hidden;
    color: #bcd;
    font-family: inherit;
}
.abf_changelog_header {
    padding: 14px 18px;
    background: #29374F;
    border-bottom: 1px solid #3a5070;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.abf_changelog_header_left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.abf_changelog_subtitle {
    font-size: 9pt;
    color: #89a0b8;
}
.abf_changelog_header h2 {
    margin: 0;
    font-size: 13pt;
    color: #dce6f2;
}
.abf_changelog_close {
    background: transparent;
    border: none;
    color: #89a0b8;
    font-size: 14pt;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}
.abf_changelog_close:hover {
    color: #fff;
}
.abf_changelog_body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.abf_version_block {
    border-bottom: 1px solid #29374F;
    padding-bottom: 10px;
}
.abf_version_block:last-child {
    border-bottom: none;
    padding-bottom: 0;
}
.abf_version_title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.abf_version_badge {
    background: #1a4a7a;
    color: #7ecfff;
    border: 1px solid #4a9fd4;
    font-size: 8pt;
    padding: 1px 7px;
    border-radius: 8px;
    font-weight: bold;
}
.abf_version_date {
    font-size: 8pt;
    color: #89a0b8;
}
.abf_version_changes {
    margin: 0;
    padding-left: 16px;
    font-size: 9pt;
    color: #bcd;
    line-height: 1.5;
}
.abf_changelog_footer {
    padding: 10px 18px;
    background: #182335;
    border-top: 1px solid #3a5070;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}
.abf_changelog_github_link {
    font-size: 8pt;
    color: #7ecfff;
    text-decoration: none;
    font-weight: bold;
}
.abf_changelog_github_link:hover {
    text-decoration: underline;
}
.abf_changelog_btn {
    background: #1a4a7a;
    color: #7ecfff;
    border: 1px solid #4a9fd4;
    padding: 5px 14px;
    border-radius: 5px;
    font-weight: bold;
    cursor: pointer;
    font-size: 8pt;
}
.abf_changelog_btn:hover {
    background: #234f83;
}
.abf_changelog_loading,
.abf_changelog_error {
    font-size: 9pt;
    color: #89a0b8;
    padding: 4px 0;
}
.abf_changelog_error {
    color: #e0a0a0;
}
.abf_update_banner {
    font-size: 8.5pt;
    color: #f0d080;
    background: #2e2810;
    border: 1px solid #6a5a1a;
    border-radius: 6px;
    padding: 8px 10px;
}
`;


// ── Tag list columns ────────────────────────────────────────────────────────
// Moves the tag list into the middle column and lays it out in columns
// instead of a single vertical list. Re-applies itself whenever the tag
// list is replaced (e.g. after voting on or adding a tag).

var tagMinRowsPerColumn = 5;
var tagColumns = 5;

function makeTagColumns() {
    var tagListEl = document.getElementById('torrent_tags_list');
    if (!tagListEl) return;
    tagListEl.classList.add('tag_list');
    for (var tagLi of tagListEl.children) {
        tagLi.classList.add('tag_item');
    }
    var cols = Math.min(Math.round(tagListEl.children.length / tagMinRowsPerColumn), tagColumns);
    tagListEl.style.columnCount = cols;
}

function initTagColumns() {
    var tagContainer = document.getElementById('tag_container');
    if (!tagContainer) return; // torrent has no tags / no tag panel on this page

    var middleColumn = document.getElementsByClassName('middle_column')[0];
    var sidebar = document.querySelector('.sidebar');
    if (!middleColumn || !sidebar) return;

    var coverImage = document.getElementById('coverimage');
    var sidebarHeads = sidebar.querySelectorAll('.head');
    if (!sidebarHeads.length) return;
    var tagHeader = coverImage === null ? sidebarHeads[0] : sidebarHeads[1];
    if (!tagHeader) return;

    var tagStyle = ce('style');
    document.head.append(tagStyle);
    tagStyle.innerHTML = `
ul.tag_list {
    margin: 15px;
}

li.tag_item {
    margin: 1px 0px 3px 0px;
    overflow: hidden;
    max-width: 420px;
}

li.tag_item > a {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 410px;
}

a[title^="Vote up tag"] + span {
    display: none;
}

#torrent_tags_list {
    column-width: 180px;
    column-count: 5;
    display: inline-block;
}
`;

    middleColumn.appendChild(tagContainer);
    middleColumn.insertBefore(tagHeader, tagContainer);

    makeTagColumns();

    // After adding/voting on a tag the whole list is re-rendered by the site,
    // so the column classes need to be re-applied.
    var torrentTags = document.getElementById('torrent_tags');
    if (torrentTags) {
        var tagsObserver = new MutationObserver(() => makeTagColumns());
        tagsObserver.observe(torrentTags, { childList: true, subtree: true });
    }
}

if (getSetting('tagColumnsEnabled')) {
    initTagColumns();
}


// ── Changelog: menu command + auto "what's new" check ─────────────────────────

if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('📜 Show Changelog', () => showChangelogModal());

    var tagColumnsCurrentlyEnabled = getSetting('tagColumnsEnabled');
    GM_registerMenuCommand(
        (tagColumnsCurrentlyEnabled ? '✅' : '⬜') + ' Tag List Columns (click to ' +
        (tagColumnsCurrentlyEnabled ? 'disable' : 'enable') + ', reloads page)',
        () => {
            setSetting('tagColumnsEnabled', !tagColumnsCurrentlyEnabled);
            location.reload();
        }
    );
}

checkVersionUpdate();