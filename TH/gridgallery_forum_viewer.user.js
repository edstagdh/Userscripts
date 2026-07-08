// ==UserScript==
// @name         ThirstHub Gallery View Toggle
// @namespace    https://github.com/edstagdh/Userscripts
// @version      2.1
// @description  Adds a toggle button to switch thread listings between row view and image gallery/grid view, with an in-page settings editor
// @match        https://thirsthub.cc/*
// @exclude      https://thirsthub.cc/threads/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=thirsthub.cc
// @author       edstagdh
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/TH/gridgallery_forum_viewer.user.js
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/TH/gridgallery_forum_viewer.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==


(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // VERSION HISTORY (newest first — add an entry here with every release)
  // ---------------------------------------------------------------------
  const SCRIPT_VERSION = '2.1';
  const VERSION_HISTORY = [
    {
      version: '2.1',
      changes: [
        'Switched settings/mode persistence from localStorage to GM_getValue/GM_setValue, with a safe fallback to built-in defaults if GM storage is unavailable.',
        'Added a "Always link threads to /latest" toggle — thread links are rewritten to end in /latest instead of /unread (or no suffix) unless turned off.',
        'Added this changelog popup, shown once after each update.',
      ],
    },
    {
      version: '2.0',
      changes: [
        'Added an in-page ⚙ Settings modal for columns, container width, grid gap, thumbnail aspect ratio, and default view.',
        'Gallery/grid view toggle with persisted mode.',
      ],
    },
  ];

  const STORAGE_LAST_SEEN_VERSION_KEY = 'th-gallery-last-seen-version';

  // ---------------------------------------------------------------------
  // DEFAULTS — these are only used the very first time the script runs on
  // a given browser profile (or whenever GM storage is unavailable/fails).
  // After that, everything is editable from the in-page ⚙ Settings modal
  // and persisted via GM_setValue/GM_getValue.
  // ---------------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    // Roughly how many cards per row on a normal desktop-width window.
    GALLERY_COLUMNS: 4,

    // Assumed width (px) of the thread list container, used only to derive
    // a min card width from GALLERY_COLUMNS above.
    ASSUMED_CONTAINER_WIDTH: 1150,

    GRID_GAP_PX: 16,

    // Aspect ratio of the thumbnail image area (width / height), CSS syntax
    THUMB_ASPECT_RATIO: '4 / 3',

    // Default view on first-ever visit (before any toggle click): 'row' or 'gallery'
    DEFAULT_MODE: 'row',

    // When true, thread links are rewritten so they always point at
    // ".../latest" instead of ".../unread" (or no suffix at all).
    FORCE_LATEST_URL: true,
  };

  const STORAGE_MODE_KEY = 'th-gallery-mode';
  const STORAGE_SETTINGS_KEY = 'th-gallery-settings';

  const PLACEHOLDER_IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
        '<rect width="100%" height="100%" fill="#2a2a2e"/>' +
        '<text x="50%" y="50%" fill="#777" font-size="16" font-family="sans-serif" ' +
        'text-anchor="middle" dominant-baseline="middle">No image</text></svg>'
    );

  // ---------------------------------------------------------------------
  // GM storage helpers — wrap GM_getValue/GM_setValue so that if the
  // userscript manager doesn't expose them (or a call throws for any
  // reason) we quietly fall back to the built-in defaults instead of
  // blowing up.
  // ---------------------------------------------------------------------
  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        const val = GM_getValue(key, fallback);
        return val === undefined ? fallback : val;
      }
    } catch (e) {
      /* fall through to fallback */
    }
    return fallback;
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
      }
    } catch (e) {
      /* swallow — persistence is best-effort */
    }
  }

  // ---------------------------------------------------------------------
  // settings persistence
  // ---------------------------------------------------------------------
  function loadSettings() {
    let stored = {};
    try {
      const raw = gmGet(STORAGE_SETTINGS_KEY, null);
      if (raw) stored = JSON.parse(raw);
    } catch (e) {
      stored = {};
    }
    return Object.assign({}, DEFAULT_SETTINGS, stored);
  }

  function saveSettings(settings) {
    gmSet(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  }

  let CONFIG = loadSettings();

  function computeCardMinWidth(cfg) {
    return Math.max(
      160,
      Math.floor(cfg.ASSUMED_CONTAINER_WIDTH / cfg.GALLERY_COLUMNS) -
        cfg.GRID_GAP_PX
    );
  }

  // Grid sizing lives on CSS custom properties so the settings modal can
  // update it live without rebuilding the whole stylesheet.
  function applyCssVars(cfg) {
    const root = document.documentElement.style;
    root.setProperty('--th-gallery-card-min-width', computeCardMinWidth(cfg) + 'px');
    root.setProperty('--th-gallery-gap', cfg.GRID_GAP_PX + 'px');
    root.setProperty('--th-gallery-thumb-ratio', cfg.THUMB_ASPECT_RATIO);
  }

  // ---------------------------------------------------------------------
  // styles
  // ---------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    .th-btn-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .th-gallery-toggle-btn,
    .th-gallery-settings-btn {
      background: #e8720c;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
      line-height: 1.4;
    }
    .th-gallery-toggle-btn:hover,
    .th-gallery-settings-btn:hover {
      background: #c25f09;
    }
    .th-gallery-settings-btn {
      padding: 6px 10px;
    }
    /* Floating fallback, only used if we can't find a nav anchor point */
    .th-btn-row--floating {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
    }
    .th-btn-row--floating .th-gallery-toggle-btn,
    .th-btn-row--floating .th-gallery-settings-btn {
      border-radius: 999px;
      padding: 12px 16px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    }

    .th-gallery-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(var(--th-gallery-card-min-width, 240px), 1fr));
      gap: var(--th-gallery-gap, 16px);
      padding: 12px 0;
    }
    .th-gallery-grid .structItem {
      display: block !important;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      overflow: hidden;
      background: rgba(255,255,255,0.03);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .th-gallery-grid .structItem:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    }
    .th-gallery-grid .structItem-cell--icon,
    .th-gallery-grid .structItem-cell--latest {
      display: none !important;
    }
    .th-gallery-grid .structItem-cell--main,
    .th-gallery-grid .structItem-cell--meta {
      display: block !important;
      width: 100% !important;
      padding: 0 !important;
    }

    .th-gallery-thumb-wrap {
      width: 100%;
      aspect-ratio: var(--th-gallery-thumb-ratio, 4 / 3);
      overflow: hidden;
      background: #1a1a1c;
    }
    .th-gallery-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .th-gallery-grid .structItem-title {
      padding: 10px 12px 4px;
      font-size: 12px;
      line-height: 1.3;
      display: block;
      overflow: visible;
    }
    .th-gallery-grid .structItem-minor {
      padding: 0 12px 10px;
      font-size: 12px;
      opacity: 0.75;
    }
    .th-gallery-grid .structItem-parts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }
    .th-gallery-grid .structItem-pageJump {
      display: none;
    }
    .th-gallery-grid .structItem-cell--meta {
      padding: 0 12px 10px !important;
      display: flex !important;
      gap: 14px;
      font-size: 12px;
      opacity: 0.75;
    }
    .th-gallery-grid .structItem-cell--meta dl {
      display: flex;
      gap: 4px;
      margin: 0;
    }

    /* ---------------- settings modal ---------------- */
    .th-settings-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .th-settings-modal {
      background: #1e1e21;
      color: #eee;
      width: 380px;
      max-width: 92vw;
      max-height: 88vh;
      overflow-y: auto;
      border-radius: 12px;
      padding: 20px 22px 18px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .th-settings-modal h2 {
      margin: 0 0 14px;
      font-size: 16px;
      color: #f2924a;
    }
    .th-settings-field {
      margin-bottom: 14px;
    }
    .th-settings-field label {
      display: block;
      font-size: 12px;
      opacity: 0.85;
      margin-bottom: 5px;
    }
    .th-settings-field input[type="number"],
    .th-settings-field input[type="text"],
    .th-settings-field select {
      width: 100%;
      box-sizing: border-box;
      background: #2a2a2e;
      border: 1px solid rgba(255,255,255,0.15);
      color: #eee;
      border-radius: 6px;
      padding: 7px 9px;
      font-size: 13px;
    }
    .th-settings-field input:focus,
    .th-settings-field select:focus {
      outline: none;
      border-color: #e8720c;
    }
    .th-settings-radio-row {
      display: flex;
      gap: 16px;
      font-size: 13px;
    }
    .th-settings-radio-row label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      opacity: 1;
      margin-bottom: 0;
      cursor: pointer;
    }
    .th-settings-checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
    }
    .th-settings-checkbox-row input {
      cursor: pointer;
    }
    .th-settings-hint {
      font-size: 11px;
      opacity: 0.55;
      margin-top: 4px;
    }
    .th-settings-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 18px;
      gap: 8px;
    }
    .th-settings-actions .th-spacer { flex: 1; }
    .th-settings-btn {
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .th-settings-btn--save {
      background: #e8720c;
      color: #fff;
    }
    .th-settings-btn--save:hover { background: #c25f09; }
    .th-settings-btn--cancel {
      background: transparent;
      color: #ccc;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .th-settings-btn--cancel:hover { background: rgba(255,255,255,0.06); }
    .th-settings-btn--reset {
      background: transparent;
      color: #f2924a;
      text-decoration: underline;
      padding: 7px 4px;
    }
    .th-settings-btn--reset:hover { color: #ff9a4d; }

    /* ---------------- changelog modal ---------------- */
    .th-changelog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .th-changelog-modal {
      background: #1e1e21;
      color: #eee;
      width: 420px;
      max-width: 92vw;
      max-height: 84vh;
      overflow-y: auto;
      border-radius: 12px;
      padding: 20px 22px 18px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .th-changelog-modal h2 {
      margin: 0 0 2px;
      font-size: 16px;
      color: #f2924a;
    }
    .th-changelog-subtitle {
      font-size: 11px;
      opacity: 0.55;
      margin: 0 0 16px;
    }
    .th-changelog-version-block {
      margin-bottom: 16px;
    }
    .th-changelog-version-block:last-child {
      margin-bottom: 0;
    }
    .th-changelog-version-label {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #f2924a;
      background: rgba(232,114,12,0.12);
      border: 1px solid rgba(232,114,12,0.35);
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .th-changelog-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .th-changelog-list li {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 12px;
      line-height: 1.45;
      color: #ddd;
    }
    .th-changelog-list li::before {
      content: '→';
      color: #e8720c;
      font-weight: 700;
      flex-shrink: 0;
    }
    .th-changelog-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 18px;
    }
    .th-changelog-btn--ok {
      background: #e8720c;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .th-changelog-btn--ok:hover { background: #c25f09; }
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------
  function getThreadItems() {
    return Array.from(document.querySelectorAll('.structItem')).filter((el) =>
      el.querySelector('.structItem-title a')
    );
  }

  function extractThumbnailUrl(item) {
    // The thread's own thumbnail lives in the leading icon cell (not the
    // trailing "last poster" icon cell, which shares the same base class).
    const iconCell = item.querySelector(
      '.structItem-cell--icon:not(.structItem-cell--iconEnd)'
    );
    if (!iconCell) return null;
    const img = iconCell.querySelector('img');
    if (!img) return null;

    // Prefer the inline style background-image (this is where the real
    // thumbnail lives; the img's src is just a tiny placeholder pixel).
    const bg = img.style.backgroundImage;
    if (bg) {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  function buildThumbWrap(item) {
    const url = extractThumbnailUrl(item);
    const wrap = document.createElement('div');
    wrap.className = 'th-gallery-thumb-wrap';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = url || PLACEHOLDER_IMG;
    img.alt = '';
    wrap.appendChild(img);

    const titleCell = item.querySelector('.structItem-cell--main');
    if (titleCell) {
      titleCell.insertAdjacentElement('afterbegin', wrap);
    }
  }

  function applyGalleryMode() {
    getThreadItems().forEach((item) => {
      const container = item.parentElement;
      if (container && !container.classList.contains('th-gallery-grid')) {
        container.classList.add('th-gallery-grid');
      }
      if (!item.querySelector('.th-gallery-thumb-wrap')) {
        buildThumbWrap(item);
      }
    });
  }

  function removeGalleryMode() {
    document.querySelectorAll('.th-gallery-grid').forEach((container) => {
      container.classList.remove('th-gallery-grid');
    });
    document.querySelectorAll('.th-gallery-thumb-wrap').forEach((el) => el.remove());
  }

  function getMode() {
    const stored = gmGet(STORAGE_MODE_KEY, null);
    if (stored === 'gallery' || stored === 'row') return stored;
    return CONFIG.DEFAULT_MODE;
  }

  function setMode(mode) {
    gmSet(STORAGE_MODE_KEY, mode);
    updateButtonLabel();
    if (mode === 'gallery') {
      applyGalleryMode();
    } else {
      removeGalleryMode();
    }
  }

  // ---------------------------------------------------------------------
  // thread URL rewriting — force ".../latest" instead of ".../unread"
  // (or no suffix at all), unless the setting is switched off.
  // ---------------------------------------------------------------------
  const THREAD_PATH_RE = /^(\/threads\/[^\/]+\.\d+\/)(unread\/?|latest\/?)?$/;

  function rewriteThreadUrl(href) {
    if (!CONFIG.FORCE_LATEST_URL) return null;
    let u;
    try {
      u = new URL(href, location.href);
    } catch (e) {
      return null;
    }
    if (u.origin !== location.origin) return null;

    const match = u.pathname.match(THREAD_PATH_RE);
    if (!match) return null;

    const newPath = match[1] + 'latest';
    if (newPath === u.pathname) return null;

    u.pathname = newPath;
    return u.toString();
  }

  function rewriteThreadLinks(root) {
    const scope = root || document;
    const links = scope.querySelectorAll('a[href*="/threads/"]:not([data-th-url-fixed])');
    links.forEach((a) => {
      const rewritten = rewriteThreadUrl(a.getAttribute('href'));
      if (rewritten) {
        a.href = rewritten;
      }
      a.dataset.thUrlFixed = '1';
    });
  }

  // ---------------------------------------------------------------------
  // toggle + settings buttons — placed next to the Telegram link if we
  // can find it
  // ---------------------------------------------------------------------
  const btnRow = document.createElement('span');
  btnRow.className = 'th-btn-row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'th-gallery-toggle-btn';

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'th-gallery-settings-btn';
  settingsBtn.textContent = '⚙';
  settingsBtn.title = 'Gallery view settings';

  btnRow.appendChild(btn);
  btnRow.appendChild(settingsBtn);

  function updateButtonLabel() {
    btn.textContent = getMode() === 'gallery' ? '☰ Row View' : '▦ Gallery View';
  }

  btn.addEventListener('click', () => {
    setMode(getMode() === 'gallery' ? 'row' : 'gallery');
  });

  settingsBtn.addEventListener('click', openSettingsModal);

  function insertToggleButton() {
    if (document.contains(btnRow)) return; // already inserted

    const telegramLink = document.querySelector(
      'a[href*="t.me" i], a[href*="telegram" i]'
    );

    if (telegramLink) {
      // Insert as a sibling right after the link (or after its parent <li>
      // if it's wrapped in a nav list item, so spacing/alignment matches).
      const li = telegramLink.closest('li');
      const anchorNode = li || telegramLink;
      anchorNode.insertAdjacentElement('afterend', btnRow);
    } else {
      btnRow.classList.add('th-btn-row--floating');
      document.body.appendChild(btnRow);
    }
  }

  // ---------------------------------------------------------------------
  // settings modal
  // ---------------------------------------------------------------------
  const ASPECT_PRESETS = [
    { label: '4:3 (default)', value: '4 / 3' },
    { label: '16:9 (widescreen)', value: '16 / 9' },
    { label: '1:1 (square)', value: '1 / 1' },
    { label: '3:4 (portrait)', value: '3 / 4' },
    { label: 'Custom…', value: 'custom' },
  ];

  function openSettingsModal() {
    if (document.querySelector('.th-settings-overlay')) return; // already open

    const cfg = loadSettings(); // pull fresh copy in case of external changes

    const overlay = document.createElement('div');
    overlay.className = 'th-settings-overlay';

    const isPreset = ASPECT_PRESETS.some((p) => p.value === cfg.THUMB_ASPECT_RATIO);

    overlay.innerHTML = `
      <div class="th-settings-modal" role="dialog" aria-modal="true" aria-label="Gallery view settings">
        <h2>▦ Gallery View Settings</h2>

        <div class="th-settings-field">
          <label for="th-set-columns">Columns (approx. per row)</label>
          <input type="number" id="th-set-columns" min="1" max="12" step="1" value="${cfg.GALLERY_COLUMNS}">
          <div class="th-settings-hint">How many cards to target per row on a normal desktop window.</div>
        </div>

        <div class="th-settings-field">
          <label for="th-set-width">Assumed container width (px)</label>
          <input type="number" id="th-set-width" min="400" max="4000" step="10" value="${cfg.ASSUMED_CONTAINER_WIDTH}">
          <div class="th-settings-hint">Used with Columns to work out a minimum card width.</div>
        </div>

        <div class="th-settings-field">
          <label for="th-set-gap">Grid gap (px)</label>
          <input type="number" id="th-set-gap" min="0" max="64" step="1" value="${cfg.GRID_GAP_PX}">
        </div>

        <div class="th-settings-field">
          <label for="th-set-aspect-preset">Thumbnail aspect ratio</label>
          <select id="th-set-aspect-preset">
            ${ASPECT_PRESETS.map(
              (p) =>
                `<option value="${p.value}" ${
                  (isPreset && p.value === cfg.THUMB_ASPECT_RATIO) || (!isPreset && p.value === 'custom')
                    ? 'selected'
                    : ''
                }>${p.label}</option>`
            ).join('')}
          </select>
          <input type="text" id="th-set-aspect-custom" placeholder="e.g. 21 / 9"
                 value="${cfg.THUMB_ASPECT_RATIO}"
                 style="margin-top:6px; display:${isPreset ? 'none' : 'block'};">
        </div>

        <div class="th-settings-field">
          <label>Default view on first visit</label>
          <div class="th-settings-radio-row">
            <label><input type="radio" name="th-set-mode" value="row" ${cfg.DEFAULT_MODE === 'row' ? 'checked' : ''}> Row</label>
            <label><input type="radio" name="th-set-mode" value="gallery" ${cfg.DEFAULT_MODE === 'gallery' ? 'checked' : ''}> Gallery</label>
          </div>
          <div class="th-settings-hint">Only applies before you've ever clicked the toggle button in this browser.</div>
        </div>

        <div class="th-settings-field">
          <label class="th-settings-checkbox-row">
            <input type="checkbox" id="th-set-force-latest" ${cfg.FORCE_LATEST_URL ? 'checked' : ''}>
            Always link threads to /latest
          </label>
          <div class="th-settings-hint">Rewrites thread links so they open the latest post instead of the first unread post (or thread start).</div>
        </div>

        <div class="th-settings-actions">
          <button type="button" class="th-settings-btn th-settings-btn--reset" id="th-set-reset">Reset to defaults</button>
          <span class="th-spacer"></span>
          <button type="button" class="th-settings-btn th-settings-btn--cancel" id="th-set-cancel">Cancel</button>
          <button type="button" class="th-settings-btn th-settings-btn--save" id="th-set-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const presetSelect = overlay.querySelector('#th-set-aspect-preset');
    const customInput = overlay.querySelector('#th-set-aspect-custom');

    presetSelect.addEventListener('change', () => {
      if (presetSelect.value === 'custom') {
        customInput.style.display = 'block';
      } else {
        customInput.style.display = 'none';
        customInput.value = presetSelect.value;
      }
    });

    function closeModal() {
      overlay.remove();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector('#th-set-cancel').addEventListener('click', closeModal);

    overlay.querySelector('#th-set-reset').addEventListener('click', () => {
      saveSettings(DEFAULT_SETTINGS);
      CONFIG = loadSettings();
      applyCssVars(CONFIG);
      if (getMode() === 'gallery') applyGalleryMode();
      resetLinkRewriteCache();
      rewriteThreadLinks();
      closeModal();
    });

    overlay.querySelector('#th-set-save').addEventListener('click', () => {
      const columns = Math.max(1, Math.min(12, parseInt(overlay.querySelector('#th-set-columns').value, 10) || DEFAULT_SETTINGS.GALLERY_COLUMNS));
      const width = Math.max(400, parseInt(overlay.querySelector('#th-set-width').value, 10) || DEFAULT_SETTINGS.ASSUMED_CONTAINER_WIDTH);
      const gap = Math.max(0, parseInt(overlay.querySelector('#th-set-gap').value, 10) || 0);
      const modeRadio = overlay.querySelector('input[name="th-set-mode"]:checked');
      const mode = modeRadio ? modeRadio.value : DEFAULT_SETTINGS.DEFAULT_MODE;
      const forceLatest = overlay.querySelector('#th-set-force-latest').checked;

      let aspect = presetSelect.value === 'custom' ? customInput.value.trim() : presetSelect.value;
      if (!aspect) aspect = DEFAULT_SETTINGS.THUMB_ASPECT_RATIO;

      const newSettings = {
        GALLERY_COLUMNS: columns,
        ASSUMED_CONTAINER_WIDTH: width,
        GRID_GAP_PX: gap,
        THUMB_ASPECT_RATIO: aspect,
        DEFAULT_MODE: mode,
        FORCE_LATEST_URL: forceLatest,
      };

      saveSettings(newSettings);
      CONFIG = newSettings;
      applyCssVars(CONFIG);
      if (getMode() === 'gallery') applyGalleryMode();
      resetLinkRewriteCache();
      rewriteThreadLinks();
      closeModal();
    });
  }

  // Clears the "already processed" marker on thread links so a settings
  // change (toggling FORCE_LATEST_URL on/off) is reflected immediately
  // instead of only affecting links discovered afterwards.
  function resetLinkRewriteCache() {
    document.querySelectorAll('a[data-th-url-fixed]').forEach((a) => {
      delete a.dataset.thUrlFixed;
    });
  }

  // ---------------------------------------------------------------------
  // changelog popup — shown once after each update
  // ---------------------------------------------------------------------
  function buildChangelogPopup(versionsToShow) {
    if (document.querySelector('.th-changelog-overlay')) return; // already open

    const overlay = document.createElement('div');
    overlay.className = 'th-changelog-overlay';

    const blocksHtml = versionsToShow
      .map((entry) => {
        const items = entry.changes.map((c) => `<li>${c}</li>`).join('');
        return `
          <div class="th-changelog-version-block">
            <span class="th-changelog-version-label">v${entry.version}</span>
            <ul class="th-changelog-list">${items}</ul>
          </div>`;
      })
      .join('');

    overlay.innerHTML = `
      <div class="th-changelog-modal" role="dialog" aria-modal="true" aria-label="What's new">
        <h2>🎉 What's New</h2>
        <p class="th-changelog-subtitle">ThirstHub Gallery View Toggle — updated to v${SCRIPT_VERSION}</p>
        ${blocksHtml}
        <div class="th-changelog-actions">
          <button type="button" class="th-changelog-btn--ok" id="th-changelog-ok">OK, got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function dismiss() {
      overlay.remove();
      gmSet(STORAGE_LAST_SEEN_VERSION_KEY, SCRIPT_VERSION);
      document.removeEventListener('keydown', onKeydown);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') dismiss();
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
    overlay.querySelector('#th-changelog-ok').addEventListener('click', dismiss);
    document.addEventListener('keydown', onKeydown);
  }

  function checkVersionAndShowChangelog() {
    const lastSeen = gmGet(STORAGE_LAST_SEEN_VERSION_KEY, '');
    if (lastSeen === SCRIPT_VERSION) return;

    const toShow = [];
    for (let i = 0; i < VERSION_HISTORY.length; i++) {
      if (VERSION_HISTORY[i].version === lastSeen) break;
      toShow.push(VERSION_HISTORY[i]);
    }

    // First-ever run on this profile (no lastSeen at all): just show the
    // current version's notes rather than the entire history.
    if (!lastSeen) {
      toShow.length = 0;
      toShow.push(VERSION_HISTORY[0]);
    }

    if (!toShow.length) {
      gmSet(STORAGE_LAST_SEEN_VERSION_KEY, SCRIPT_VERSION);
      return;
    }

    buildChangelogPopup(toShow);
  }

  // ---------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------
  applyCssVars(CONFIG);
  insertToggleButton();
  updateButtonLabel();
  if (getMode() === 'gallery') applyGalleryMode();
  rewriteThreadLinks();
  checkVersionAndShowChangelog();

  // ---------------------------------------------------------------------
  // keep working across XenForo's AJAX pagination / infinite scroll
  // ---------------------------------------------------------------------
  const mo = new MutationObserver(() => {
    insertToggleButton(); // in case header renders/re-renders late
    if (getMode() === 'gallery') {
      applyGalleryMode();
    }
    rewriteThreadLinks();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();