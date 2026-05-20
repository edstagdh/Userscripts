// ==UserScript==
// @name         [HF][EMP] Advanced Better filelist
// @version      1.0
// @description  inspired by original script by ephraim
// @author       edstagdh + others
// @namespace    https://github.com/edstagdh/Userscripts
// @match        https://www.empornium.sx/torrents.php?id=*
// @match        https://emparadise.rs/torrents.php?id=*
// @match        https://www.homeporntorrents.club/torrents.php?id=*
// @match        https://femdomcult.org/torrents.php?id=*
// @match        https://sextorrent.eu/torrents.php?id=*
// @match        https://kufirc.com/torrents.php?id=*
// @match        https://pornbay.org/torrents.php?id=*
// @match        https://www.happyfappy.net/torrents.php?id=*
// @grant        none
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx

// ==/UserScript==

// CHANGELOG
// v1.0:
// -added case-sensitive search button, toggle.
// -added multi keyword based search logic button, toggle.
// -added file size filter, text based.
// -added file types filter, toggle.
// -added filename search link to filename on site, toggle.

var urlMap = {};
var multiKeywordMode = false;
var caseSensitive = false;
var clickSearchMode = false;
var hiddenFileTypes = new Set();

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

    tools.append(expand, multiToggle, caseToggle, filterInput, sizeFilterInput, typesToggle, searchToggle);

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
fileListToggle.text = '(Show file tree)';
var root = {};
fileListToggle.onclick = function toggleTree() {
    findThumbnails();
    if (this.classList.contains('open_tree')) {
        this.text = '(Show file tree)';
    } else {
        this.text = '(Hide file tree)';
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
.header_search_toggle {
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
.header_search_toggle:hover {
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
`;