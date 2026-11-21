// ==UserScript Module==
// @name         [ManyVids] Store Viewer — popup
// Version       1.0
// Part of manyvids_store_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Full-screen viewer (header, filters, status, body), open / close, per-video details popup. */

/* ---------- UI ---------- */
const els = {};

function msvBuild() {
  if (els.root) return;
  els.root = el('div', { id: 'msv-root', class: 'msv-hidden' });
  els.root.innerHTML = `
    <div class="msv-head">
      <div class="msv-title"><b id="msv-name"></b> <span id="msv-count"></span></div>
      <div class="msv-head-btns">
        <div class="msv-seg" id="msv-view">
          <button data-v="grid">Grid</button><button data-v="table">Table</button>
        </div>
        <label class="msv-small" title="Items per row (grid)">Per row <select id="msv-cols">${[3, 4, 5, 6, 7, 8].map(n => `<option>${n}</option>`).join('')}</select></label>
        <label class="msv-small" title="Play the preview clip when hovering a grid card"><input type="checkbox" id="msv-prev"> Hover preview</label>
        <button id="msv-reload" title="Reload from the site">⟳</button>
        <button id="msv-close" title="Close (Esc)">✕</button>
      </div>
    </div>
    <div class="msv-filters">
      <input type="search" id="f-q" placeholder="Search titles (use -word to exclude)">
      <select id="f-kind"><option value="all">All videos</option><option value="regular">Regular only</option><option value="mobile">Mobile only</option></select>
      <select id="f-bundle"><option value="all">Bundle: any</option><option value="yes">In bundle</option><option value="no">Not in bundle</option></select>
      <select id="f-price"><option value="all">Price: any</option><option value="free">Free</option><option value="paid">Paid</option><option value="sale">On sale</option></select>
      <span class="msv-range">$ <input type="number" id="f-minPrice" min="0" step="1" placeholder="min"> – <input type="number" id="f-maxPrice" min="0" step="1" placeholder="max"></span>
      <span class="msv-range">Min <input type="number" id="f-minDur" min="0" placeholder="from"> – <input type="number" id="f-maxDur" min="0" placeholder="to"></span>
      <span class="msv-range">Date <input type="date" id="f-from"> – <input type="date" id="f-to"></span>
      <label class="msv-small"><input type="checkbox" id="f-hideAi"> Hide AI</label>
      <select id="msv-sort">
        <option value="date_desc">Newest</option><option value="date_asc">Oldest</option>
        <option value="price_asc">Price ↑</option><option value="price_desc">Price ↓</option>
        <option value="dur_desc">Longest</option><option value="dur_asc">Shortest</option>
        <option value="views_desc">Most viewed</option><option value="likes_desc">Most liked</option>
        <option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
      </select>
      <button id="f-reset">Reset filters</button>
    </div>
    <div id="msv-status"></div>
    <div id="msv-body"></div>
    <div id="msv-dlg" class="msv-hidden"><div class="msv-dlg-box"><button class="msv-dlg-x" title="Close (Esc)">✕</button><div class="msv-dlg-c"></div></div></div>`;
  document.body.appendChild(els.root);
  els.body = els.root.querySelector('#msv-body');
  els.status = els.root.querySelector('#msv-status');
  els.dlg = els.root.querySelector('#msv-dlg');
  els.dlgC = els.root.querySelector('.msv-dlg-c');
  els.root.querySelector('.msv-dlg-x').addEventListener('click', msvDetailsClose);
  els.dlg.addEventListener('click', e => { if (e.target === els.dlg) msvDetailsClose(); });
  els.dlgC.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const pre = els.dlgC.querySelector('.msv-raw pre');
    navigator.clipboard.writeText(b.dataset.copy === 'url' ? b.dataset.url : (pre ? pre.textContent : '')).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = b.dataset.label; }, 1200); });
  });

  const $ = s => els.root.querySelector(s);
  els.root.querySelectorAll('#msv-view button').forEach(b => b.addEventListener('click', () => { msvSet('view', b.dataset.v); msvRender(); }));
  $('#msv-cols').value = String(S.cols);
  $('#msv-cols').addEventListener('change', e => { msvSet('cols', +e.target.value); msvRender(); });
  $('#msv-prev').checked = !!S.preview;
  $('#msv-prev').addEventListener('change', e => msvSet('preview', e.target.checked));
  $('#msv-reload').addEventListener('click', () => msvLoad());
  $('#msv-close').addEventListener('click', () => msvClose());
  $('#msv-sort').addEventListener('change', e => { msvSet('sort', e.target.value); msvRender(); });
  let t = null;
  Object.keys(F).forEach(k => {
    const inp = $('#f-' + k);
    if (!inp) return;
    const read = () => { F[k] = inp.type === 'checkbox' ? inp.checked : inp.value; };
    inp.addEventListener(inp.type === 'search' || inp.type === 'number' ? 'input' : 'change', () => { read(); clearTimeout(t); t = setTimeout(msvRender, 150); });
  });
  $('#f-reset').addEventListener('click', () => {
    Object.assign(F, { q: '', kind: 'all', bundle: 'all', price: 'all', minPrice: '', maxPrice: '', minDur: '', maxDur: '', from: '', to: '', hideAi: false });
    msvSyncInputs(); msvRender();
  });
  els.body.addEventListener('click', e => {
    const det = e.target.closest('.msv-det');
    if (det) { e.preventDefault(); e.stopPropagation(); msvDetails(det.dataset.id); return; }
    const th = e.target.closest('th[data-k]');
    if (!th) return;
    const k = th.dataset.k, [ck, cd] = S.sort.split('_');
    msvSet('sort', k + '_' + (ck === k ? (cd === 'asc' ? 'desc' : 'asc') : (k === 'title' ? 'asc' : 'desc')));
    msvRender();
  });
  msvBindPreview();
}

function msvSyncInputs() {
  Object.keys(F).forEach(k => {
    const inp = els.root.querySelector('#f-' + k);
    if (inp) { if (inp.type === 'checkbox') inp.checked = F[k]; else inp.value = F[k]; }
  });
}

function msvStatus(text) { if (els.status) els.status.innerHTML = text; }

function msvRender() {
  if (!els.root || !MSV.open) return;
  const $ = s => els.root.querySelector(s);
  els.root.querySelectorAll('#msv-view button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  $('#msv-sort').value = [...$('#msv-sort').options].some(o => o.value === S.sort) ? S.sort : '';
  $('#msv-name').textContent = (MSV.items[0] && MSV.items[0]._creator) || decodeURIComponent(MSV.slug || '');
  const list = msvFiltered();
  const mob = MSV.items.filter(i => i.mobile).length;
  $('#msv-count').textContent = MSV.items.length ? `${list.length} of ${MSV.items.length} videos (${MSV.items.length - mob} regular, ${mob} mobile)` : '';
  const errs = MSV.errors.map(e => `<div class="msv-err">⚠ ${esc(e)}</div>`).join('');
  if (MSV.loading) msvStatus(`Loading… ${errs}`);
  else msvStatus(errs);
  if (MSV.loading && !MSV.items.length) { els.body.innerHTML = ''; return; }
  if (!list.length) { els.body.innerHTML = `<div class="msv-empty">${MSV.items.length ? 'No videos match the filters.' : 'No videos found.'}</div>`; return; }
  els.body.innerHTML = S.view === 'table' ? msvTable(list) : msvGrid(list);
  els.body.scrollTop = 0;
}

function msvOpen() {
  msvBuild();
  MSV.open = true;
  els.root.classList.remove('msv-hidden');
  document.documentElement.classList.add('msv-noscroll');
  msvSyncInputs();
  const pr = msvParseUrl();
  if (pr && (pr.id !== MSV.profileId || (!MSV.items.length && !MSV.loading))) msvLoad(); else msvRender();
}

function msvClose() {
  MSV.open = false;
  msvDetailsClose();
  if (els.root) { els.root.classList.add('msv-hidden'); els.body.innerHTML = ''; }
  document.documentElement.classList.remove('msv-noscroll');
}

/* ---------- details popup ---------- */
async function msvDetails(id) {
  const it = MSV.items.find(x => x.id === id);
  const url = `${MSV.base || MSV_DEFAULT_API}/store/video/${id}`;
  els.dlg.classList.remove('msv-hidden');
  els.dlgC.innerHTML = `<div class="msv-dlg-load">Loading details for ${esc(it ? it.title : id)}…</div>`;
  let json = MSV.details.get(id);
  if (!json) {
    try { json = await msvGet(url); MSV.details.set(id, json); }
    catch (e) {
      els.dlgC.innerHTML = `<div class="msv-err">⚠ Could not load ${esc(url)}: ${esc(e.message)}</div>`;
      return;
    }
  }
  if (els.dlg.classList.contains('msv-hidden')) return;
  els.dlgC.innerHTML = msvDetailsHtml(json, url, it);
}

function msvDetailsHtml(json, url, it) {
  const d = (json && json.data) || {};
  const p = d.price || {};
  const yes = v => (v ? 'Yes' : 'No');
  const price = p.free ? 'Free' : (p.onSale && parseFloat(p.discountedPrice) ? `$${esc(p.discountedPrice)} (sale, was $${esc(p.regular)}${p.promoRate ? ', -' + esc(p.promoRate) + '%' : ''})` : (p.regular ? '$' + esc(p.regular) : ''));
  const link = d.url ? 'https://www.manyvids.com' + d.url : (it ? it.url : '');
  const model = d.model || {};
  const rows = [
    ['ID', d.id], ['Status', d.status], ['Released', d.launchDate ? new Date(d.launchDate).toLocaleString() : ''],
    ['Duration', d.videoDuration], ['Resolution', [d.resolution, d.width && d.height ? `${d.width}×${d.height}` : ''].filter(Boolean).join(' · ')],
    ['File', [d.extension, d.size].filter(Boolean).join(' · ')], ['Price', price],
    ['Views', d.viewsRaw != null ? fmtNum(d.viewsRaw) : d.views], ['Likes', d.likesRaw != null ? fmtNum(d.likesRaw) : d.likes], ['Comments', d.comments],
    ['Intensity', d.intensity], ['Kind', it ? (it.mobile ? 'Mobile (vertical)' : 'Regular') : ''],
    ['In bundle', yes(d.isInBundle)], ['Bundle exclusive', yes(d.isExclusiveForBundle)], ['Exclusive', yes(d.isExclusive)],
    ['Stream only', yes(d.isStreamOnly)], ['Premium', yes(d.isPremium)], ['Custom order', yes(d.isCustomOrder)],
    ['AI generated', yes(d.isAiGenerated)], ['3D', yes(d.is3D)],
  ].filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '');
  const tags = (d.tagList || []).map(t => `<span class="msv-tag">${esc(t.label)}</span>`).join('');
  const teaser = d.teaser && d.teaser.filepath;
  return `
    <h2><a href="${esc(link)}" target="_blank" rel="noopener">${esc(d.title || (it && it.title) || '')}</a></h2>
    <div class="msv-dlg-sub">${model.displayName ? `by <a href="https://www.manyvids.com${esc(model.profileUrl || '')}" target="_blank" rel="noopener">${esc(model.displayName)}</a>` : ''}</div>
    <div class="msv-dlg-grid">
      <div class="msv-dlg-media">
        ${teaser ? `<video src="${esc(teaser)}" poster="${esc(d.screenshot || '')}" controls muted loop playsinline preload="none"></video>` : (d.screenshot ? `<img src="${esc(d.screenshot)}" alt="">` : '')}
        ${d.screenshot ? `<a class="msv-small" href="${esc(d.screenshot)}" target="_blank" rel="noopener">Open full screenshot</a>` : ''}
      </div>
      <table class="msv-facts">${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>
    </div>
    ${tags ? `<div class="msv-tags">${tags}</div>` : ''}
    ${d.description ? `<div class="msv-desc">${esc(d.description)}</div>` : ''}
    <div class="msv-req"><b>Request</b> <code>GET ${esc(url)}</code>
      <button data-copy="url" data-url="${esc(url)}" data-label="Copy URL">Copy URL</button>
      <a href="${esc(url)}" target="_blank" rel="noopener"><button>Open</button></a></div>
    <details class="msv-raw"><summary>Raw JSON response <button data-copy="json" data-label="Copy JSON">Copy JSON</button></summary><pre>${esc(JSON.stringify(json, null, 2))}</pre></details>`;
}

function msvDetailsClose() {
  if (!els.dlg) return;
  els.dlg.classList.add('msv-hidden');
  els.dlgC.innerHTML = '';
}
function msvDetailsOpen() { return els.dlg && !els.dlg.classList.contains('msv-hidden'); }
