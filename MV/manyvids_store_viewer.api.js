// ==UserScript Module==
// @name         [ManyVids] Store Viewer — API & loader
// Version       1.2
// Part of manyvids_store_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Store lists from api.manyvids.com:
     GET /store/videos/<id>?…&limit=70&page=N  → {statusCode, statusMessage, data:[…], pagination:{total, currentPage, totalPages, nextPage?}}
       main list: sort=newest · mobile/vertical: &vertical=1 (not in the main list) · bundle members: bundle=true (subset of main)
     GET /store/video/<id> → full record (details popup)
   Requests go through the page's fetch with credentials (the API allows www.manyvids.com via CORS),
   GM_xmlhttpRequest as fallback. If the API can't be reached, the first page of each list embedded
   in the page (Next.js flight data, SWR fallback — its cache keys read /profile/<id>/store/videos, which is NOT the API path) is used instead. */

function msvParseUrl() {
  const m = location.pathname.match(/^\/Profile\/(\d+)\/([^/]+)\/Store\/Videos/i);
  return m ? { id: m[1], slug: m[2] } : null;
}

function msvNormalize(raw, src) {
  const p = raw.price || {};
  const regular = p.regular != null ? parseFloat(p.regular) : null;
  const sale = p.discountedPrice != null ? parseFloat(p.discountedPrice) : null;
  const free = !!p.free;
  return {
    id: String(raw.id),
    title: raw.title || '',
    slug: raw.slug || '',
    thumb: (raw.thumbnail && raw.thumbnail.url) || '',
    preview: (raw.preview && raw.preview.url) || '',
    free, onSale: !!p.onSale, regular, salePrice: sale, promoRate: p.promoRate || null,
    price: free ? 0 : (p.onSale && sale != null ? sale : (regular || 0)),
    duration: raw.duration || '', secs: durSecs(raw.duration),
    views: raw.views || 0, likes: raw.likes || 0,
    date: raw.launchDate || '', time: raw.launchDate ? Date.parse(raw.launchDate) || 0 : 0,
    type: raw.type || '', is3D: !!raw.is3D, isAi: !!raw.isAiGenerated,
    mobile: src === 'vertical', inBundle: false,
    url: `https://www.manyvids.com/Video/${raw.id}/${raw.slug || ''}`,
    _creator: (raw.creator && raw.creator.stageName) || '',
  };
}

/* ---------- data: embedded first pages (fallback) ---------- */
function msvExtractJson(text, start) {
  // returns the balanced JSON array/object starting at text[start]
  let depth = 0, inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function msvSeed(profileId) {
  const out = { main: [], vertical: [], bundle: [] };
  try {
    const nf = unsafeWindow.__next_f;
    if (!Array.isArray(nf)) return out;
    const text = nf.filter(x => x && x[0] === 1 && typeof x[1] === 'string').map(x => x[1]).join('');
    const marker = `"$inf$@\\"/profile/${profileId}/store/videos?`;
    let pos = 0;
    while ((pos = text.indexOf(marker, pos)) !== -1) {
      const keyEnd = text.indexOf('",":', pos);
      if (keyEnd === -1) break;
      const key = text.slice(pos, keyEnd);
      const json = msvExtractJson(text, keyEnd + 4);
      pos = keyEnd + 4;
      if (!json) continue;
      try {
        const pages = JSON.parse(json);
        const items = (pages[0] && pages[0][0]) || [];
        const src = key.includes('vertical=1') ? 'vertical' : key.includes('bundle=true') ? 'bundle' : 'main';
        if (!out[src].length) out[src] = items;
      } catch (e) { /* ignore */ }
    }
  } catch (e) { console.warn('[MSV] seed parse failed', e); }
  return out;
}

/* ---------- data: API ---------- */
function msvApiBase() {
  try {
    const u = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/store\/videos\/\d+\?/.test(n));
    if (u) return u.slice(0, u.indexOf('/store/videos/'));
  } catch (e) { /* ignore */ }
  return MSV_DEFAULT_API;
}

async function msvGet(url) {
  let res = null;
  try {
    const opts = { credentials: 'include', headers: { Accept: 'application/json' } };
    res = await unsafeWindow.fetch(url, typeof cloneInto === 'function' ? cloneInto(opts, unsafeWindow, { cloneFunctions: false }) : opts);
  } catch (e) { res = null; /* CORS / blocked → GM fallback */ }
  if (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('Bad JSON'); }
  }
  return msvGmGet(url);
}

function msvGmGet(url) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET', url, headers: { Accept: 'application/json' }, timeout: 30000,
      onload: r => {
        if (r.status < 200 || r.status >= 300) return reject(new Error('HTTP ' + r.status));
        try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('Bad JSON')); }
      },
      onerror: () => reject(new Error('Network error')),
      ontimeout: () => reject(new Error('Timeout')),
    });
  });
}

function msvPageOf(json) {
  // API answers {statusCode, data:[…], pagination:{…}}; SWR cache shape is [items, pagination]
  if (Array.isArray(json)) return Array.isArray(json[0]) ? { items: json[0], pag: json[1] || null } : { items: json, pag: null };
  const d = json && json.data;
  const items = Array.isArray(d) ? d : (d && (d.items || d.videos || d.content)) || [];
  const pag = json.pagination || (json.meta && (json.meta.pagination || json.meta)) || (d && !Array.isArray(d) && d.pagination) || null;
  return { items, pag };
}

async function msvFetchList(base, profileId, query, token) {
  const all = [];
  for (let page = 1; page <= MSV_MAX_PAGES; page++) {
    if (token !== MSV.loadToken) throw new Error('cancelled');
    const json = await msvGet(`${base}/store/videos/${profileId}?${query}&limit=${MSV_LIMIT}&page=${page}`);
    const { items, pag } = msvPageOf(json);
    all.push(...items);
    msvStatus(`Loading… ${MSV.items.length + all.length} videos`);
    let more;
    if (pag && pag.totalPages) more = page < pag.totalPages;
    else if (pag && 'nextPage' in pag) more = !!pag.nextPage;
    else more = items.length >= MSV_LIMIT;
    if (!more || !items.length) break;
  }
  return all;
}

async function msvLoad() {
  const pr = msvParseUrl();
  if (!pr) return;
  const token = ++MSV.loadToken;
  MSV.profileId = pr.id; MSV.slug = pr.slug;
  MSV.items = []; MSV.errors = []; MSV.loading = true;
  msvRender();
  const base = MSV.base = msvApiBase();
  const seed = msvSeed(pr.id);
  const lists = [['main', 'sort=newest'], ['vertical', 'sort=newest&vertical=1'], ['bundle', 'bundle=true&sort=newest']];
  const got = {};
  for (const [src, q] of lists) {
    try { got[src] = await msvFetchList(base, pr.id, q, token); }
    catch (e) {
      if (token !== MSV.loadToken) return;
      got[src] = seed[src];
      MSV.errors.push(`${src === 'main' ? 'Videos' : src === 'vertical' ? 'Mobile videos' : 'Bundle'}: ${e.message}` + (seed[src].length ? ` — showing the ${seed[src].length} from the page only` : ''));
    }
    if (token !== MSV.loadToken) return;
  }
  const map = new Map();
  for (const raw of got.main || []) map.set(String(raw.id), msvNormalize(raw, 'main'));
  for (const raw of got.vertical || []) {
    const id = String(raw.id);
    if (map.has(id)) map.get(id).mobile = true; else map.set(id, msvNormalize(raw, 'vertical'));
  }
  for (const raw of got.bundle || []) {
    const id = String(raw.id);
    if (!map.has(id)) map.set(id, msvNormalize(raw, 'main'));
    map.get(id).inBundle = true;
  }
  MSV.items = [...map.values()];
  MSV.loading = false;
  msvUpdateFab();
  msvRender();
}
