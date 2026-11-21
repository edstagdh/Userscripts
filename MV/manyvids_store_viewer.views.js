// ==UserScript Module==
// @name         [ManyVids] Store Viewer — views
// Version       1.1
// Part of manyvids_store_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Filtering / sorting, grid cards, table, hover preview. */

/* ---------- filtering / sorting ---------- */
function msvFiltered() {
  const words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
  const inc = words.filter(w => !w.startsWith('-')), exc = words.filter(w => w.startsWith('-') && w.length > 1).map(w => w.slice(1));
  const num = v => (v === '' || v == null || isNaN(parseFloat(v))) ? null : parseFloat(v);
  const minP = num(F.minPrice), maxP = num(F.maxPrice), minD = num(F.minDur), maxD = num(F.maxDur);
  const from = F.from ? Date.parse(F.from) : null, to = F.to ? Date.parse(F.to) + 86400000 : null;
  const list = MSV.items.filter(it => {
    const t = it.title.toLowerCase();
    if (inc.some(w => !t.includes(w)) || exc.some(w => t.includes(w))) return false;
    if (F.kind === 'regular' && it.mobile) return false;
    if (F.kind === 'mobile' && !it.mobile) return false;
    if (F.bundle === 'yes' && !it.inBundle) return false;
    if (F.bundle === 'no' && it.inBundle) return false;
    if (F.price === 'free' && !it.free) return false;
    if (F.price === 'paid' && it.free) return false;
    if (F.price === 'sale' && !it.onSale) return false;
    if (minP != null && it.price < minP) return false;
    if (maxP != null && it.price > maxP) return false;
    if (minD != null && it.secs < minD * 60) return false;
    if (maxD != null && it.secs > maxD * 60) return false;
    if (from != null && it.time < from) return false;
    if (to != null && it.time >= to) return false;
    if (F.hideAi && it.isAi) return false;
    return true;
  });
  const [key, dir] = S.sort.split('_');
  const get = { id: i => +i.id, date: i => i.time, price: i => i.price, dur: i => i.secs, views: i => i.views, likes: i => i.likes, title: i => i.title.toLowerCase(), kind: i => (i.mobile ? 1 : 0), bundle: i => (i.inBundle ? 1 : 0) }[key] || (i => i.time);
  const m = dir === 'asc' ? 1 : -1;
  list.sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * m || (b.time - a.time); });
  return list;
}

function msvBadges(it) {
  return (it.mobile ? '<span class="msv-b msv-b-m">Mobile</span>' : '') +
    (it.inBundle ? '<span class="msv-b msv-b-bd">Bundle</span>' : '') +
    (it.onSale ? `<span class="msv-b msv-b-s">Sale${it.promoRate ? ' -' + esc(it.promoRate) + '%' : ''}</span>` : '') +
    (it.isAi ? '<span class="msv-b">AI</span>' : '') + (it.is3D ? '<span class="msv-b">3D</span>' : '');
}

function msvGrid(list) {
  return `<div class="msv-grid" style="--msv-cols:${S.cols}">` + list.map(it => `
    <div class="msv-card" data-prev="${esc(it.preview)}">
      <a class="msv-media" href="${esc(it.url)}" target="_blank" rel="noopener">
        <img src="${esc(it.thumb)}" loading="lazy" alt="">
        ${it.duration ? `<span class="msv-dur">${esc(it.duration)}</span>` : ''}
        <span class="msv-badges">${msvBadges(it)}</span>
      </a>
      <div class="msv-info">
        <a class="msv-t" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
        <div class="msv-meta"><span>${fmtPrice(it)}</span><span>👁 ${fmtNum(it.views)} · ♥ ${fmtNum(it.likes)}</span><span>${fmtDate(it.date)}</span></div>
        <div class="msv-meta"><span class="msv-id">ID ${esc(it.id)}</span><button class="msv-det" data-id="${esc(it.id)}" title="Video details">ⓘ Details</button></div>
      </div>
    </div>`).join('') + '</div>';
}

function msvTable(list) {
  const [sk, sd] = S.sort.split('_');
  const th = (k, label, cls) => `<th data-k="${k}" class="${cls || ''}${sk === k ? ' sorted' : ''}">${label}${sk === k ? (sd === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  return `<table class="msv-table"><thead><tr><th>#</th><th>Thumb</th>${th('id', 'ID', 'r')}${th('title', 'Title')}${th('kind', 'Kind')}${th('bundle', 'Bundle')}${th('price', 'Price', 'r')}${th('dur', 'Duration', 'r')}${th('views', 'Views', 'r')}${th('likes', 'Likes', 'r')}${th('date', 'Released')}</tr></thead><tbody>` +
    list.map((it, i) => `<tr>
      <td class="r">${i + 1}</td>
      <td><a href="${esc(it.url)}" target="_blank" rel="noopener" class="msv-tthumb"><img src="${esc(it.thumb)}" loading="lazy" alt=""></a></td>
      <td class="r">${esc(it.id)}</td>
      <td class="msv-ttitle"><button class="msv-det" data-id="${esc(it.id)}" title="Video details">ⓘ</button> <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a> ${it.isAi ? '<span class="msv-b">AI</span>' : ''}${it.is3D ? '<span class="msv-b">3D</span>' : ''}</td>
      <td>${it.mobile ? '<span class="msv-b msv-b-m">Mobile</span>' : 'Regular'}</td>
      <td>${it.inBundle ? '<span class="msv-b msv-b-bd">Yes</span>' : ''}</td>
      <td class="r nw">${fmtPrice(it)}</td>
      <td class="r">${esc(it.duration)}</td>
      <td class="r">${fmtNum(it.views)}</td>
      <td class="r">${fmtNum(it.likes)}</td>
      <td class="nw">${fmtDate(it.date)}</td>
    </tr>`).join('') + '</tbody></table>';
}

function msvBindPreview() {
  let timer = null, cur = null;
  const stop = () => { clearTimeout(timer); if (cur) { const v = cur.querySelector('video'); if (v) v.remove(); cur = null; } };
  els.body.addEventListener('mouseover', e => {
    const card = e.target.closest('.msv-card');
    if (card === cur) return;
    stop();
    if (!card || !S.preview || !card.dataset.prev) return;
    cur = card;
    timer = setTimeout(() => {
      const v = el('video', { muted: '', loop: '', autoplay: '', playsinline: '', src: card.dataset.prev });
      v.muted = true;
      card.querySelector('.msv-media').appendChild(v);
      v.play().catch(() => {});
    }, 350);
  });
  els.body.addEventListener('mouseleave', stop);
  els.body.addEventListener('scroll', stop, { passive: true });
}
