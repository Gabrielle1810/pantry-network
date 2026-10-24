// Pantry Network demo: a single-page app with hash routes and mocked data kept in localStorage.
(() => {
  const TODAY = new Date(2026, 9, 24);
  const TODAY_ISO = '2026-10-24';
  const KEY = 'pantry-network-demo-v1';
  const CATS = window.CATEGORIES;
  const CAMPUSES = window.CAMPUSES;
  const $app = document.getElementById('app');

  // ---------- helpers
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<i data-lucide="${name}" class="ic ${cls}"></i>`;
  const parse = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = iso => { if (!iso) return ''; const d = parse(iso); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; };
  const daysUntil = iso => Math.round((parse(iso) - TODAY) / 864e5);
  const inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`;
  const plural = (n, unit) => n === 1 ? unit : /(s|x|ch|sh)$/.test(unit) ? unit + 'es' : unit + 's';
  const count = (n, unit) => `${n} ${plural(n, unit)}`;
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const ago = ms => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
    const d = Math.round(h / 24);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  };
  const isToday = ms => Date.now() - ms < 24 * 3600 * 1000;
  const cat = c => CATS[c] || { group: 'Other Pantry Staples', icon: 'package', bg: '#f1f3f0', fg: '#4a5650' };
  const thumb = (category, size = '') => { const c = cat(category); return `<span class="thumb ${size}" style="background:${c.bg};color:${c.fg}">${ic(c.icon)}</span>`; };
  const sum = arr => arr.reduce((a, b) => a + b, 0);

  // ---------- state
  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* demo still works without storage */ }
  }
  let state = load() || window.SEED();

  const ui = {
    tab: 'all', view: 'simple', search: '', selected: new Set(),
    modal: null, drawer: null, toast: null,
    feedFilter: 'all', feedAll: false,
    shareTab: 'available', shareRegion: 'all', shareCat: 'all',
    add: { step: 'camera', readIdx: 0, draft: null, qty: 4, sheet: false, delivery: [], last: null },
    student: { cart: {}, group: 'All', q: '', done: null },
  };

  const item = id => state.items.find(i => i.id === id);

  // Status rules: expired, out, expiring within 14 days, under a quarter of the last restock, no date, good
  function statusOf(it) {
    if (it.expires && daysUntil(it.expires) < 0) return 'expired';
    if (it.qty === 0) return 'out';
    if (it.expires && daysUntil(it.expires) <= 14) return 'soon';
    if (it.qty < it.of / 4) return 'low';
    if (!it.expires && !it.noExpire) return 'nodate';
    return 'good';
  }
  const STATUS = { good: 'Good', low: 'Running low', out: 'Out of stock', soon: 'Expiring soon', expired: 'Expired', nodate: 'No date' };
  const pill = st => `<span class="pill pill-${st}"><span class="dot"></span>${STATUS[st]}</span>`;

  function stockBar(it) {
    const ratio = it.of ? it.qty / it.of : 0;
    const tone = ratio >= 0.5 ? 'g' : ratio >= 0.25 ? 'a' : 'r';
    return `<div class="stock"><div class="amount"><b class="${it.qty === 0 ? 'neg' : ''}">${it.qty}</b> of ${it.of}${it.qty === 0 ? ' <span class="neg">· out</span>' : ''}</div>
      <div class="bar"><span class="bar-${tone}" style="width:${Math.max(ratio * 100, it.qty ? 4 : 0)}%"></span></div></div>`;
  }

  const TABS = [
    ['all', 'All', () => true],
    ['donated', 'Donated', i => i.source === 'donated'],
    ['purchased', 'Purchased', i => i.source === 'purchased'],
    ['low', 'Running low', i => ['low', 'out'].includes(statusOf(i))],
    ['soon', 'Expiring soon', i => statusOf(i) === 'soon'],
    ['expired', 'Expired', i => statusOf(i) === 'expired'],
    ['nodate', 'No date', i => !i.expires && !i.noExpire],
  ];

  // ---------- toast
  let toastTimer;
  function toast(msg, undo) {
    clearTimeout(toastTimer);
    ui.toast = { msg, undo };
    toastTimer = setTimeout(() => { ui.toast = null; render(); }, undo ? 10000 : 3500);
    render();
  }

  // ---------- layout pieces
  function shell(active, main) {
    const nav = [['inventory', 'Inventory', 'layout-list'], ['add', 'Add stock', 'camera'], ['takeout', 'Take-out', 'qr-code'], ['share', 'Share', 'share-2']];
    const link = ([r, label, icon]) => `<a class="nav-item ${active === r ? 'on' : ''}" href="#/${r}">${ic(icon)}<span>${label}</span></a>`;
    return `<div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="logo">${ic('package')}</span>Pantry Network</div>
        <button class="campus" data-action="campus"><span><b>Harbor University</b><small>Pantry manager</small></span>${ic('chevrons-up-down')}</button>
        <nav class="nav">${nav.map(link).join('')}</nav>
        <div class="grow"></div>
        <nav class="nav nav-foot">
          <a class="nav-item" href="#/student">${ic('smartphone')}<span>Student page</span></a>
          ${link(['help', 'Help', 'circle-help'])}${link(['settings', 'Settings', 'settings'])}
        </nav>
      </aside>
      <main class="main">${main}</main>
    </div>`;
  }

  function pageHead(title, sub, right = '') {
    return `<header class="page-head"><div class="left"><h1>${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="right">${right}</div></header>`;
  }

  function smartCard({ tone, icon, label, num, title, sub, actions, highlight }) {
    return `<div class="card smart ${highlight ? 'smart-hi' : ''}">
      <div class="smart-top"><span class="smart-label tone-${tone}"><span class="smart-ic">${ic(icon)}</span>${label}</span>${num !== undefined ? `<span class="smart-num">${num}</span>` : ''}</div>
      <div class="smart-text"><b>${title}</b><span>${sub}</span></div>
      <div class="grow"></div>
      <div class="actions">${actions}</div>
    </div>`;
  }
  const btn = (label, action, attrs = '', kind = '') => `<button class="btn ${kind}" data-action="${action}" ${attrs}>${label}</button>`;

  function phone(content, cls = '') {
    return `<div class="phone-stage"><div class="phone ${cls}">
      <div class="statusbar"><span>9:41</span><span class="batt"></span></div>
      ${content}
      <div class="homebar"></div>
    </div></div>`;
  }

  // ---------- Inventory
  function inventoryPage() {
    const items = state.items;
    const st = items.map(i => [i, statusOf(i)]);
    const lowItems = st.filter(([, s]) => s === 'out' || s === 'low').map(([i]) => i).sort((a, b) => a.qty / a.of - b.qty / b.of);
    const soonItems = st.filter(([, s]) => s === 'soon').map(([i]) => i).sort((a, b) => a.expires.localeCompare(b.expires));
    const expired = st.filter(([, s]) => s === 'expired').map(([i]) => i);
    const lastRestock = items.map(i => i.restock).sort().pop();
    const donated = items.filter(i => i.source === 'donated').length;

    const lowFirst = lowItems[0];
    const cards = [
      smartCard({
        tone: 'red', icon: 'trending-down', label: 'Running low', num: lowItems.length,
        title: lowFirst ? (lowFirst.qty === 0 ? `${lowFirst.name} is out of stock` : `${lowFirst.name} is running low`) : 'Nothing is running low',
        sub: lowFirst ? `${lowFirst.qty} of ${lowFirst.of} on the shelf${lowItems.length > 1 ? ` · ${lowItems.slice(1, 3).map(i => i.name).join(' and ')} ${lowItems.length > 2 ? 'are' : 'is'} next` : ''}` : 'Every item has at least a quarter of its last restock',
        actions: lowFirst ? btn('Request items', 'openRequest', `data-name="${esc(lowFirst.name)}" data-cat="${esc(lowFirst.category)}"`, 'dark') + btn('Add items', 'go', 'data-to="add"') : btn('Add stock', 'go', 'data-to="add"'),
      }),
      smartCard({
        tone: 'blue', icon: 'clock', label: 'Expiring soon', num: soonItems.length,
        title: soonItems[0] ? `${soonItems[0].name} expires ${inDays(daysUntil(soonItems[0].expires))}` : 'Nothing expires in the next 2 weeks',
        sub: soonItems[0] ? `${count(soonItems[0].qty, soonItems[0].unit)} left · put them at the front so they go first` : 'Dated items are all good for now',
        actions: soonItems[0] ? btn('Offer on Share', 'openOffer', `data-id="${soonItems[0].id}"`, 'dark') + btn(`See all ${soonItems.length}`, 'setTab', 'data-tab="soon"') : '',
      }),
      smartCard({
        tone: 'red', icon: 'triangle-alert', label: 'Expired', num: expired.length,
        title: expired.length ? `Take ${expired.length} item${expired.length === 1 ? '' : 's'} off the shelves` : 'Nothing is past its date',
        sub: expired.length ? `${expired.slice(0, 2).map(i => i.name).join(', ')}${expired.length > 2 ? ` and ${expired.length - 2} more` : ''} ${expired.length === 1 ? 'is' : 'are'} past the date` : 'Students only ever see food that is still good',
        actions: expired.length ? btn('Mark as removed', 'removeExpired', '', 'dark') + btn('See list', 'setTab', 'data-tab="expired"') : '',
      }),
      smartCard({
        tone: 'gray', icon: 'package', label: 'Items this period', num: items.length,
        title: `Last delivery logged ${fmt(lastRestock)}`,
        sub: `${donated} donated · ${items.length - donated} purchased this period`,
        actions: btn('Add stock', 'go', 'data-to="add"', 'dark') + btn('Import Excel', 'importExcel'),
      }),
    ].join('');

    const tabFn = TABS.find(t => t[0] === ui.tab)[2];
    const q = ui.search.trim().toLowerCase();
    const rows = items.filter(tabFn).filter(i => !q || `${i.name} ${i.brand} ${i.category}`.toLowerCase().includes(q));

    const tabs = TABS.map(([k, label, fn]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-action="setTab" data-tab="${k}">${label}<span class="n">${items.filter(fn).length}</span></button>`).join('');

    const table = ui.view === 'simple' ? simpleTable(rows) : fullSheet(rows);
    const head = pageHead('Inventory', `<span class="period">${ic('calendar')}Summer 2026 · 6/1 to 7/30</span>`,
      `<span class="saved">${ic('check')}All changes saved</span><button class="btn dark" data-action="newItem">${ic('plus')}Add row</button>`);

    return shell('inventory', `${head}
      <section class="cards cards-4">${cards}</section>
      <div class="toolbar">
        <div class="tabs pills">${tabs}</div>
        <div class="tools">
          <div class="seg"><button class="${ui.view === 'simple' ? 'on' : ''}" data-action="setView" data-view="simple">${ic('rows-3')}Simple</button><button class="${ui.view === 'full' ? 'on' : ''}" data-action="setView" data-view="full">${ic('sheet')}Full sheet</button></div>
          <label class="search">${ic('search')}<input id="inv-search" data-bind="search" value="${esc(ui.search)}" placeholder="Search items or brands"></label>
        </div>
      </div>
      ${table}
      <p class="foot-note">${ui.view === 'simple' ? 'Switch to Full sheet to see and edit every column from your spreadsheet. Click a row to edit it.' : 'Click any cell to edit it. Changes save on their own.'}</p>
      <div class="foot-row"><span>Showing ${rows.length} of ${items.length} items · Summer 2026 · sample data</span></div>
      ${selectionBar()}`);
  }

  function simpleTable(rows) {
    if (!rows.length) return `<div class="card empty">${ic('search-x')}<b>No items match</b><span>Try another tab or search.</span></div>`;
    const allOn = rows.every(r => ui.selected.has(r.id));
    return `<div class="card table-wrap"><table class="table">
      <thead><tr><th class="cb"><button class="check ${allOn ? 'on' : ''}" data-action="toggleAll" aria-label="Select all">${ic('check')}</button></th>
        <th>Product</th><th>Category</th><th>In stock</th><th>Expires</th><th>Status</th><th>Last restock</th><th></th></tr></thead>
      <tbody>${rows.map(i => {
        const s = statusOf(i);
        const exp = i.expires
          ? `<span class="${s === 'expired' ? 'neg' : s === 'soon' ? 'soon-t' : ''}">${fmt(i.expires)}</span>${s === 'soon' ? `<small>${inDays(daysUntil(i.expires))}</small>` : ''}`
          : `<span class="muted">${i.noExpire ? "Doesn't expire" : 'No date'}</span>`;
        return `<tr class="${ui.selected.has(i.id) ? 'sel' : ''} ${s === 'soon' ? 'hl' : ''}" data-action="openItem" data-id="${i.id}">
          <td class="cb"><button class="check ${ui.selected.has(i.id) ? 'on' : ''}" data-action="toggleRow" data-id="${i.id}" aria-label="Select ${esc(i.name)}">${ic('check')}</button></td>
          <td><div class="prod">${thumb(i.category, 'sm')}<span><b>${esc(i.name)}</b><small>${esc(i.brand)} · ${esc(i.unit)}</small></span></div></td>
          <td class="muted-d">${esc(i.category)}</td>
          <td>${stockBar(i)}</td>
          <td class="exp">${exp}</td>
          <td>${pill(s)}</td>
          <td class="muted-d">${fmt(i.restock)}</td>
          <td class="more">${ic('ellipsis')}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  const SHEET_COLS = [
    ['name', 'Item Name', 'text'], ['category', 'Category', 'cat'], ['group', 'Composition', 'ro'], ['brand', 'Brand', 'text'],
    ['expires', 'Expiration Date', 'date'], ['restock', 'Date of Last Restock', 'date'], ['qty', 'Quantity', 'num'],
    ['unit', 'Unit of Measure', 'text'], ['source', 'Purchased/Donated', 'src'],
  ];
  function fullSheet(rows) {
    const letters = 'ABCDEFGHI';
    const cell = (i, [f, , kind]) => {
      const attrs = `data-sheet="${f}" data-id="${i.id}"`;
      if (kind === 'ro') return `<td class="ro">${esc(cat(i.category).group)}</td>`;
      if (kind === 'cat') return `<td><select ${attrs}>${Object.keys(CATS).map(c => `<option ${c === i.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>`;
      if (kind === 'src') return `<td><select ${attrs}><option value="donated" ${i.source === 'donated' ? 'selected' : ''}>Donated</option><option value="purchased" ${i.source === 'purchased' ? 'selected' : ''}>Purchased</option></select></td>`;
      if (kind === 'date') return `<td><input type="date" ${attrs} value="${i[f] || ''}"></td>`;
      if (kind === 'num') return `<td><input type="number" min="0" ${attrs} value="${i[f]}"></td>`;
      return `<td><input ${attrs} value="${esc(i[f])}"></td>`;
    };
    return `<div class="card table-wrap"><table class="sheet">
      <thead><tr class="letters"><th></th>${SHEET_COLS.map((_, k) => `<th>${letters[k]}</th>`).join('')}</tr>
      <tr><th>#</th>${SHEET_COLS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((i, k) => `<tr><td class="rn">${k + 2}</td>${SHEET_COLS.map(c => cell(i, c)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function selectionBar() {
    if (!ui.selected.size || ui.modal) return '';
    return `<div class="selbar"><b>${ui.selected.size} selected</b>
      <button data-action="removeSelected">${ic('trash-2')}Remove</button>
      <button data-action="offerSelected">${ic('share-2')}Offer on Share</button>
      <button class="x" data-action="clearSel" aria-label="Clear selection">${ic('x')}</button></div>`;
  }

  function drawer() {
    const d = ui.drawer;
    if (!d) return '';
    const v = d.draft;
    const it = d.id ? item(d.id) : null;
    const history = it ? [...it.history, ...state.feed.flatMap(e => e.items.filter(x => x.id === it.id).map(x => ({
      at: e.at, text: e.source === 'student' ? `${x.qty} taken via QR` : `${x.qty} removed by staff · ${e.reason}`,
    })))].sort((a, b) => b.at - a.at).slice(0, 8) : [];
    const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;
    return `<div class="overlay" data-action="closeDrawer"></div>
    <aside class="drawer" role="dialog" aria-label="Edit item">
      <div class="drawer-head">${thumb(v.category)}<div><h2>${it ? esc(it.name) : 'New item'}</h2><small>${it ? `${esc(it.brand)} · ${pill(statusOf(it))}` : 'Add a row to your inventory'}</small></div>
        <button class="icon-btn" data-action="closeDrawer" aria-label="Close">${ic('x')}</button></div>
      <div class="drawer-body">
        ${it ? `<div class="card inset">${stockBar(it)}<small class="muted">In stock = what is left of the last restock</small></div>` : ''}
        ${field('Item name', `<input data-draft="name" value="${esc(v.name)}">`)}
        <div class="two">${field('Brand', `<input data-draft="brand" value="${esc(v.brand)}">`)}${field('Unit', `<input data-draft="unit" value="${esc(v.unit)}">`)}</div>
        ${field('Category', `<select data-draft="category">${Object.keys(CATS).map(c => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
        <div class="two">${field('On the shelf', `<input type="number" min="0" data-draft="qty" value="${v.qty}">`)}${field('Last restock amount', `<input type="number" min="0" data-draft="of" value="${v.of}">`)}</div>
        <div class="two">${field('Best by', `<input type="date" data-draft="expires" value="${v.expires || ''}" ${v.noExpire ? 'disabled' : ''}>`)}${field('Last restock', `<input type="date" data-draft="restock" value="${v.restock || ''}">`)}</div>
        <label class="checkline"><input type="checkbox" data-draft="noExpire" ${v.noExpire ? 'checked' : ''}> Doesn't expire (hygiene, foil, etc.)</label>
        ${field('Source', `<div class="seg wide"><button class="${v.source === 'donated' ? 'on' : ''}" data-action="draftSource" data-v="donated">Donated</button><button class="${v.source === 'purchased' ? 'on' : ''}" data-action="draftSource" data-v="purchased">Purchased</button></div>`)}
        ${history.length ? `<div class="history"><h3>History</h3>${history.map(h => `<div class="h-row"><span class="h-dot"></span><span>${esc(h.text)}</span><small>${ago(h.at)}</small></div>`).join('')}</div>` : ''}
      </div>
      <div class="drawer-foot">${it ? btn(`${ic('trash-2')}Remove…`, 'removeOne', `data-id="${it.id}"`, 'ghost-red') : ''}<div class="grow"></div>${btn('Cancel', 'closeDrawer')}${btn('Save', 'saveDrawer', '', 'dark')}</div>
    </aside>`;
  }

  // ---------- Take-out
  function takeoutPage() {
    const today = state.feed.filter(e => isToday(e.at));
    const qtyOf = e => sum(e.items.map(x => x.qty));
    const students = today.filter(e => e.source === 'student');
    const staff = today.filter(e => e.source === 'staff');
    const reasons = {};
    staff.forEach(e => { reasons[e.reason] = (reasons[e.reason] || 0) + qtyOf(e); });
    const taken = {};
    students.forEach(e => e.items.forEach(x => { taken[x.id] = (taken[x.id] || 0) + x.qty; }));
    const topId = Object.keys(taken).sort((a, b) => taken[b] - taken[a])[0];
    const top = topId && item(topId);
    const daysLeft = top ? Math.max(1, Math.ceil(top.qty / taken[topId])) : 0;

    const cards = [
      smartCard({
        tone: 'green', icon: 'arrow-up-right', label: 'Out today', title: `${sum(today.map(qtyOf))} items left the shelf`,
        sub: `${sum(students.map(qtyOf))} taken by students · ${sum(staff.map(qtyOf))} removed by staff${Object.keys(reasons).length ? ` (${Object.entries(reasons).map(([r, n]) => `${n} ${r.toLowerCase()}`).join(', ')})` : ''}`,
        actions: btn('See Inventory', 'go', 'data-to="inventory"'),
      }),
      top ? smartCard({
        tone: 'blue', icon: 'flame', label: 'Most taken', title: `${top.name} · ${taken[topId]} today`,
        sub: top.qty ? `At this pace they run out in about ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Already out of stock',
        actions: btn('Request more', 'openRequest', `data-name="${esc(top.name)}" data-cat="${esc(top.category)}"`, 'dark'),
      }) : '',
      state.dismissed.count ? '' : smartCard({
        tone: 'amber', icon: 'scale', label: 'Count looks off', title: 'Canned Goods: you counted 40, the system says 48',
        sub: 'Some take-outs were probably not scanned',
        actions: btn('Use 40', 'countFix', 'data-v="40"', 'dark') + btn('Keep 48', 'countFix', 'data-v="48"'),
      }),
    ].join('');

    const filtered = state.feed.filter(e => ui.feedFilter === 'all' || (ui.feedFilter === 'students' ? e.source === 'student' : e.source === 'staff'));
    const shown = ui.feedAll ? filtered : filtered.slice(0, 7);
    const chip = x => { const it = item(x.id); if (!it) return ''; const c = cat(it.category); return `<span class="ichip" style="background:${c.bg}">${esc(it.name)} <b style="color:${c.fg}">×${x.qty}</b></span>`; };
    const reasonCls = r => r === 'Expired' || r === 'Damaged' ? 'reason-red' : '';
    const rows = shown.map(e => `<div class="feed-row">
        <span class="when">${ic('clock')}${ago(e.at)}</span>
        <div class="feed-items">${e.source === 'student' ? `<span class="src">${ic('qr-code')}Student scan</span>` : `<span class="src staff">${e.by ? esc(e.by) : 'Staff'}</span>`}
          ${e.items.map(chip).join('')}${e.reason ? `<span class="reason ${reasonCls(e.reason)}">${esc(e.reason)}</span>` : ''}</div>
        <button class="link" data-action="fixEntry" data-id="${e.id}">Fix</button>
      </div>`).join('');

    const filters = [['all', 'All'], ['students', 'Students'], ['staff', 'Staff']]
      .map(([k, l]) => `<button class="tab ${ui.feedFilter === k ? 'on' : ''}" data-action="feedFilter" data-v="${k}">${l}</button>`).join('');

    return shell('takeout', `${pageHead('Take-out', 'Everything that left the shelf: student scans and staff removals', btn(`${ic('minus')}Record items out`, 'recordOut', '', 'dark'))}
      <section class="cards cards-3">${cards}</section>
      <div class="card feed">
        <div class="feed-head"><div class="left"><h2>Out today</h2><div class="tabs pills sm">${filters}</div></div><span class="anon">${ic('eye-off')}No names are ever recorded for students</span></div>
        ${rows || `<div class="empty">${ic('inbox')}<b>Nothing here yet</b></div>`}
        ${filtered.length > 7 ? `<button class="link more-link" data-action="feedAll">${ui.feedAll ? 'Show less' : `Show all ${filtered.length} entries`}</button>` : ''}
        <a class="reprint" href="#/poster">${ic('printer')}Poster lost or damaged? Reprint the QR poster</a>
      </div>`);
  }

  // ---------- Share
  function matchChip(o) {
    const mine = state.items.filter(i => i.category === o.category);
    if (mine.some(i => statusOf(i) === 'out')) return { text: "You're out of this", kind: 'match', icon: 'sparkles', rank: 0 };
    if (mine.some(i => statusOf(i) === 'low')) return { text: "You're running low", kind: 'match', icon: 'sparkles', rank: 1 };
    if (o.noExpire) return { text: "Doesn't expire", kind: 'fact', icon: 'infinity', rank: 3 };
    if (CAMPUSES[o.campus].mi <= 10) return { text: 'Closest to you', kind: 'fact', icon: 'map-pin', rank: 2 };
    const same = state.offers.find(x => x !== o && x.campus === o.campus);
    if (same && o.qty < 100) return { text: `Same pickup as the ${same.name.toLowerCase()}`, kind: 'fact', icon: 'route', rank: 4 };
    if (o.qty >= 60) return { text: `Big batch · ${count(o.qty, o.unit)}`, kind: 'fact', icon: 'layers', rank: 4 };
    if (o.expires) return { text: `Lasts until ${parse(o.expires).toLocaleString('en-US', { month: 'long' })}`, kind: 'fact', icon: 'clock', rank: 4 };
    return { text: 'Shelf stable', kind: 'fact', icon: 'package', rank: 5 };
  }

  function sharePage() {
    const offers = state.offers.map(o => ({ o, chip: matchChip(o), c: CAMPUSES[o.campus] }))
      .sort((a, b) => a.chip.rank - b.chip.rank || a.c.mi - b.c.mi);
    const best = offers.find(x => x.chip.kind === 'match');
    const soon = state.items.filter(i => statusOf(i) === 'soon' && !state.myOffers.some(m => m.itemId === i.id && m.status === 'open')).sort((a, b) => a.expires.localeCompare(b.expires))[0];
    const need = state.requests.find(r => !r.offered && r.matchId && item(r.matchId) && item(r.matchId).qty > 0);

    const recs = [
      best ? smartCard({
        tone: 'green', icon: 'hand-heart', label: 'You could claim', highlight: true,
        title: `${best.c.name} is offering ${best.o.qty} ${best.o.name.toLowerCase()}`,
        sub: `${best.chip.text} · ${best.c.mi} mi away`,
        actions: btn('Claim', 'claim', `data-id="${best.o.id}"`, 'dark'),
      }) : '',
      soon && !state.dismissed.offer ? smartCard({
        tone: 'blue', icon: 'send', label: 'You could offer', title: `Your ${soon.name.toLowerCase()} expires ${inDays(daysUntil(soon.expires))}`,
        sub: `${count(soon.qty, soon.unit)} · offer them before they go to waste`,
        actions: btn('Offer', 'openOffer', `data-id="${soon.id}"`, 'dark') + btn('Not now', 'dismissRec', 'data-k="offer"'),
      }) : '',
      need ? smartCard({
        tone: 'amber', icon: 'megaphone', label: 'Someone needs', title: `${CAMPUSES[need.campus].name} needs ${need.qty} ${need.name.toLowerCase()}`,
        sub: `You have ${item(need.matchId).qty} · ${CAMPUSES[need.campus].region} · ${CAMPUSES[need.campus].mi} mi`,
        actions: btn('Offer some', 'offerToRequest', `data-id="${need.id}"`, 'dark') + btn('View request', 'shareTab', 'data-v="requests"'),
      }) : '',
    ].filter(Boolean);

    const regionOk = c => ui.shareRegion === 'all' || c.mi <= Number(ui.shareRegion);
    const catOk = o => ui.shareCat === 'all' || cat(o.category).group === ui.shareCat;
    const visible = offers.filter(x => regionOk(x.c) && catOk(x.o));
    const openMine = state.myOffers.filter(m => m.status === 'open');
    const reqs = [...state.myRequests, ...state.requests];

    const tabs = [['available', 'Available to claim', visible.length], ['mine', 'Your offers', state.myOffers.length], ['requests', 'Requests', reqs.length]]
      .map(([k, l, n]) => `<button class="tab line ${ui.shareTab === k ? 'on' : ''}" data-action="shareTab" data-v="${k}">${l}<span class="n">${n}</span></button>`).join('');

    let body = '';
    if (ui.shareTab === 'available') {
      body = visible.length ? `<div class="offer-grid">${visible.map(({ o, chip, c }) => `<div class="card offer">
          <div class="offer-top">${thumb(o.category)}<div><b>${esc(o.name)}</b><small>${count(o.qty, o.unit)} · ${o.noExpire ? "Doesn't expire" : o.expires ? `Best by ${fmt(o.expires)}` : 'No date'}</small></div></div>
          <span class="schip ${chip.kind}">${ic(chip.icon)}${chip.text}</span>
          <div class="offer-bottom"><div><b>${esc(c.name)}</b><small>${c.mi} mi · ${c.region}</small></div>${btn('Claim', 'claim', `data-id="${o.id}"`, chip.kind === 'match' ? 'dark' : '')}</div>
        </div>`).join('')}</div>` : `<div class="card empty">${ic('search-x')}<b>No offers match these filters</b></div>`;
    } else if (ui.shareTab === 'mine') {
      body = `<div class="offer-grid">${state.myOffers.map(m => { const it = item(m.itemId); if (!it) return ''; return `<div class="card offer">
          <div class="offer-top">${thumb(it.category)}<div><b>${esc(it.name)}</b><small>${count(m.qty, it.unit)} · ${it.expires ? `Best by ${fmt(it.expires)}` : 'No date'}</small></div></div>
          <span class="schip ${m.status === 'open' ? 'fact' : 'match'}">${ic(m.status === 'open' ? 'radio' : 'check')}${m.status === 'open' ? `Visible to ${Object.keys(CAMPUSES).length - 1} campuses` : `Claimed by ${CAMPUSES[m.claimedBy].name}`}</span>
          <div class="offer-bottom"><div><small>Posted ${ago(m.at)}</small></div>${m.status === 'open' ? btn('Withdraw', 'withdraw', `data-id="${m.id}"`) : ''}</div>
        </div>`; }).join('')}
        <button class="card offer add-card" data-action="openOffer">${ic('plus')}<b>Post an offer</b><small>Extra food? Nearby campuses will see it.</small></button></div>`;
    } else {
      body = `<div class="card list">${reqs.map(r => { const c = CAMPUSES[r.campus]; const mine = r.campus === 'harbor'; return `<div class="list-row">
          ${thumb(r.category)}<div class="grow"><b>${esc(c.name)} needs ${r.qty} ${esc(r.name.toLowerCase())}</b><small>${mine ? 'Your request · nearby campuses can offer' : `${c.region} · ${c.mi} mi`}</small></div>
          ${mine ? '<span class="pill pill-soon"><span class="dot"></span>Open</span>' : r.offered ? `<span class="pill pill-good"><span class="dot"></span>You offered ${r.offered}</span>` : btn('Offer some', 'offerToRequest', `data-id="${r.id}"`, 'dark')}
        </div>`; }).join('')}</div>`;
    }

    const groups = [...new Set(Object.values(CATS).map(c => c.group))];
    const pickups = state.pickups.map(p => `<div class="pickup">${ic('truck')}<span><b>Pickup pending:</b> ${p.qty} ${esc(p.name.toLowerCase())} from ${esc(CAMPUSES[p.campus].name)} · ${esc(CAMPUSES[p.campus].hours)}</span>${btn('Mark picked up', 'pickedUp', `data-id="${p.id}"`, 'dark')}</div>`).join('');

    return shell('share', `${pageHead('Share', 'Claim food nearby, offer what you can spare', btn(`${ic('megaphone')}Open a request`, 'openRequest') + btn(`${ic('plus')}Post an offer`, 'openOffer', '', 'dark'))}
      ${pickups}
      ${recs.length ? `<section class="cards cards-${recs.length}">${recs.join('')}</section>` : ''}
      <div class="toolbar"><div class="tabs">${tabs}</div>
        ${ui.shareTab === 'available' ? `<div class="tools">
          <label class="select">${ic('map-pin')}<select data-bind="shareRegion"><option value="all">All of Massachusetts</option>${[10, 25, 60].map(m => `<option value="${m}" ${ui.shareRegion == m ? 'selected' : ''}>Within ${m} mi</option>`).join('')}</select></label>
          <label class="select"><select data-bind="shareCat"><option value="all">All categories</option>${groups.map(g => `<option ${ui.shareCat === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        </div>` : ''}</div>
      ${body}`);
  }

  // ---------- Add stock (phone)
  function addPage() {
    const a = ui.add;
    let screen = '';
    if (a.step === 'camera' || a.step === 'reading') {
      screen = `<div class="ph-top"><a class="ph-link" href="#/inventory">Cancel</a><b>Add stock</b><span></span></div>
        <div class="viewfinder ${a.step === 'reading' ? 'reading' : ''}">
          <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
          ${can(window.MOCK_READS[a.readIdx % window.MOCK_READS.length], true)}
          ${a.step === 'reading' ? `<div class="scanline"></div><div class="vf-hint">Reading the label…</div>` : `<div class="vf-hint">Show the item's name and the date on its label</div>`}
        </div>
        <div class="ph-bottom center">
          <button class="shutter" data-action="shoot" aria-label="Take photo" ${a.step === 'reading' ? 'disabled' : ''}><span></span></button>
          <button class="link-muted" data-action="typeIt">Type it instead</button>
          ${a.delivery.length ? `<small class="muted">This delivery: ${a.delivery.length} item${a.delivery.length === 1 ? '' : 's'} saved</small>` : ''}
        </div>`;
    } else if (a.step === 'read') {
      const d = a.draft;
      const noDate = !d.expires && !d.noExpire;
      const days = d.expires ? daysUntil(d.expires) : null;
      const verb = noDate ? 'Save without a date' : `Save ${count(a.qty, d.unit)}`;
      screen = `<div class="ph-top"><button class="ph-link" data-action="retake">Retake</button><b>Add stock</b><span></span></div>
        <div class="photo">${can(d, false)}<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span></div>
        <div class="badge ${noDate ? 'warn' : ''}">${ic(noDate ? 'calendar-x' : 'check')}</div>
        <button class="read-name" data-action="editRead">${esc(d.name || 'Name the item')}${d.brand ? ` · ${esc(d.brand)}` : ''} ${ic('pencil')}</button>
        <div class="card ph-card">
          <div class="chips">
            ${noDate ? `<span class="schip warn">${ic('calendar-x')}No date found</span>` : d.noExpire ? `<span class="schip fact">${ic('infinity')}Doesn't expire</span>` : `<span class="schip ${days <= 14 ? 'warn' : 'fact'}">${ic('clock')}Expires ${inDays(days)}</span>`}
            <span class="schip fact">${ic('tag')}${esc(d.category)}</span>
          </div>
          <div class="ph-row"><span>Best by</span>${noDate ? `<button class="link" data-action="editRead">Unknown · add it</button>` : `<span><b>${d.noExpire ? '—' : fmt(d.expires)}</b> <button class="link" data-action="editRead">Edit</button></span>`}</div>
          <div class="ph-row"><span>How many?</span><div class="stepper"><button data-action="addQty" data-d="-1" aria-label="Fewer">−</button><b>${a.qty}</b><button data-action="addQty" data-d="1" aria-label="More">+</button></div></div>
          ${noDate ? `<p class="hint">${ic('info')}Dates are optional. Add one later from Inventory if you find it.</p>` : ''}
        </div>
        <div class="grow"></div>
        <div class="ph-bottom">
          <button class="btn dark block" data-action="saveRead">${verb}</button>
          <button class="link-muted" data-action="editRead">Edit all details</button>
        </div>
        ${a.sheet ? editSheet(d) : ''}`;
    } else {
      const l = a.last;
      screen = `<div class="ph-top"><a class="ph-link" href="#/inventory">Done</a><b>Add stock</b><span></span></div>
        <div class="saved-hero"><div class="saved-thumb">${thumb(l.category, 'lg')}<span class="plus">+${count(l.added, l.unit)}</span></div></div>
        <div class="badge">${ic('check')}</div>
        <h2 class="ph-title">Saved to Inventory</h2>
        <p class="ph-sub">${esc(l.name)}: ${l.before} on the shelf + ${l.added} added = ${l.after}</p>
        <button class="card next-step" data-action="nextItem"><span class="ns-ic">${ic('camera')}</span><span><small>Next step</small><b>Add another item</b></span>${ic('chevron-right')}</button>
        <div class="card delivery"><small>This delivery</small>${a.delivery.map(x => `<div class="ph-row"><span>${esc(x.name)}</span><b>+${x.added}</b></div>`).join('')}</div>
        <div class="grow"></div>
        <div class="ph-bottom center"><button class="link-muted" data-action="finishAdd">Finish</button></div>`;
    }
    return shell('add', `${pageHead('Add stock', 'Built for a phone at the pantry door: photo first, typing only when needed')}${phone(`<div class="ph-screen">${screen}</div>`)}`);
  }

  function can(d, faint) {
    return `<div class="can-wrap ${faint ? 'faint' : ''}"><div class="can" style="background:${d.color || '#7a8a80'}">
      <div class="can-label"><b style="color:${d.color || '#5e6a63'}">${esc(d.label || (d.brand || '').toUpperCase())}</b><span>${esc(d.name)}</span></div>
      ${d.expires ? `<span class="stamp">BEST BY ${fmt(d.expires).replace(/\/(\d{2})(\d{2})$/, '/$2')}</span>` : ''}
    </div><div class="shelf"></div></div>`;
  }

  function editSheet(d) {
    return `<div class="sheet-overlay" data-action="closeSheet"></div><div class="bottom-sheet">
      <div class="grabber"></div><h3>Edit details</h3>
      <label class="field"><span>Name</span><input data-read="name" value="${esc(d.name)}" placeholder="Like black beans"></label>
      <label class="field"><span>Brand</span><input data-read="brand" value="${esc(d.brand)}" placeholder="Optional"></label>
      <div class="two"><label class="field"><span>Best by</span><input type="date" data-read="expires" value="${d.expires || ''}" ${d.noExpire ? 'disabled' : ''}></label>
      <label class="field"><span>Unit</span><input data-read="unit" value="${esc(d.unit)}"></label></div>
      <label class="checkline"><input type="checkbox" data-read="noExpire" ${d.noExpire ? 'checked' : ''}> Doesn't expire</label>
      <label class="field"><span>Category</span><select data-read="category">${Object.keys(CATS).map(c => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <p class="hint">${ic('sparkles')}Fixes are remembered for the next time this label is read.</p>
      <button class="btn dark block" data-action="closeSheet">Done</button>
    </div>`;
  }

  // ---------- Student (phone, no login)
  function studentPage() {
    const s = ui.student;
    let screen;
    if (s.done) {
      screen = `<div class="ph-top"><span></span><b>Harbor University Food Pantry</b><span></span></div>
        <div class="thanks">
          <div class="badge big">${ic('heart')}</div>
          <h2 class="ph-title">Thank you!</h2>
          <p class="ph-sub">You took ${s.done.map(x => `${esc(item(x.id).name.toLowerCase())} ×${x.qty}`).join(', ')}. Enjoy.</p>
          <div class="card ph-card">${s.done.map(x => { const it = item(x.id); return `<div class="ph-row">${thumb(it.category, 'sm')}<span class="grow">${esc(it.name)}</span><b>×${x.qty}</b></div>`; }).join('')}</div>
          <button class="card next-step" data-action="studentAgain"><span class="ns-ic">${ic('plus')}</span><span><small>Forgot something?</small><b>Add another item</b></span>${ic('chevron-right')}</button>
          <p class="hint center">${ic('eye-off')}No names saved. This only helps the pantry restock.</p>
        </div>`;
    } else {
      const groupKey = window.STUDENT_GROUPS.find(g => g[0] === s.group)[1];
      const q = s.q.trim().toLowerCase();
      const list = state.items
        .filter(i => i.qty > 0 && statusOf(i) !== 'expired')
        .filter(i => !groupKey || cat(i.category).group === groupKey)
        .filter(i => !q || `${i.name} ${i.category}`.toLowerCase().includes(q))
        .sort((a, b) => (statusOf(b) === 'soon') - (statusOf(a) === 'soon') || a.name.localeCompare(b.name));
      const picked = Object.entries(s.cart).filter(([, n]) => n > 0);
      const total = sum(picked.map(([, n]) => n));
      screen = `<div class="ph-pantry"><span class="logo sm">${ic('package')}</span>Harbor University Food Pantry</div>
        <h2 class="ph-h">What did you take?</h2>
        <p class="ph-sub left">Tap + for each item. No login, no names.</p>
        <label class="search ph-search">${ic('search')}<input id="stu-search" data-bind="studentQ" value="${esc(s.q)}" placeholder="Search, like ramen or milk"></label>
        <div class="chip-row">${window.STUDENT_GROUPS.map(([l]) => `<button class="cchip ${s.group === l ? 'on' : ''}" data-action="studentGroup" data-v="${esc(l)}">${esc(l)}</button>`).join('')}</div>
        <div class="stu-list">${list.map(i => { const n = s.cart[i.id] || 0; return `<div class="card stu-item ${n ? 'on' : ''}">
            ${thumb(i.category)}<div class="grow"><b>${esc(i.name)}</b><small>${count(i.qty, i.unit)} on the shelf ${statusOf(i) === 'soon' ? `<span class="schip blue">${ic('clock')}Use soon</span>` : ''}</small></div>
            <div class="stepper sm">${n ? `<button data-action="cart" data-id="${i.id}" data-d="-1" aria-label="One fewer">−</button><b>${n}</b>` : ''}<button class="${n ? 'dark' : ''}" data-action="cart" data-id="${i.id}" data-d="1" aria-label="Add one" ${n >= i.qty ? 'disabled' : ''}>${ic('plus')}</button></div>
          </div>`; }).join('') || `<div class="empty">${ic('search-x')}<b>Nothing matches</b></div>`}</div>
        <div class="done-bar">
          ${picked.length ? `<div class="picked"><span>You took</span>${picked.map(([id, n]) => `<span class="pchip">${esc(item(id).name)} ×${n}</span>`).join('')}</div>` : ''}
          <button class="btn dark block" data-action="studentDone" ${total ? '' : 'disabled'}>${total ? `Done · ${total} item${total === 1 ? '' : 's'}` : 'Tap + on what you took'}</button>
        </div>`;
    }
    return `<div class="student-page">
      <div class="stage-note">${ic('qr-code')}Student view · opened by scanning the QR poster · <a href="#/takeout">Back to manager view</a></div>
      ${phone(`<div class="ph-screen student">${screen}</div>`)}
    </div>`;
  }

  // ---------- Poster, Settings, Help
  function posterPage() {
    return `<div class="poster-page">
      <div class="poster-tools no-print"><a class="btn" href="#/takeout">${ic('arrow-left')}Back</a><button class="btn dark" data-action="print">${ic('printer')}Print poster</button></div>
      <div class="poster">
        <div class="ph-pantry">${'<span class="logo">' + ic('package') + '</span>'}Harbor University Food Pantry</div>
        <h1>Took something?</h1>
        <p class="lead">Scan this code and tap what you took. It helps us restock.</p>
        <div id="qr" class="qr"></div>
        <ol class="steps"><li><b>1</b>Scan with your phone camera</li><li><b>2</b>Tap + on what you took</li><li><b>3</b>Press Done</li></ol>
        <p class="tag">No app. No login. No names.</p>
      </div>
    </div>`;
  }

  function settingsPage() {
    const urgent = state.items.filter(i => ['soon', 'out'].includes(statusOf(i)));
    return shell('settings', `${pageHead('Settings', 'Harbor University · Pantry manager')}
      <div class="settings-grid">
        <div class="card pad"><h2>Morning email preview</h2><p class="muted">Sent at 7 am when something needs attention. Built from the same rules as the smart cards.</p>
          <div class="email">
            <div class="email-head"><b>Pantry Network</b><small>7:00 AM · to maya@harbor.example</small></div>
            <h3>Good morning, Maya. ${urgent.length} thing${urgent.length === 1 ? '' : 's'} need${urgent.length === 1 ? 's' : ''} attention</h3>
            ${urgent.map(i => `<div class="email-row">${thumb(i.category, 'sm')}<span class="grow"><b>${esc(i.name)}</b><small>${statusOf(i) === 'out' ? 'Out of stock' : `${count(i.qty, i.unit)} · expires ${inDays(daysUntil(i.expires))}`}</small></span>
              ${statusOf(i) === 'out' ? btn('Request items', 'openRequest', `data-name="${esc(i.name)}" data-cat="${esc(i.category)}"`, 'dark') : btn('Offer on Share', 'openOffer', `data-id="${i.id}"`, 'dark')}</div>`).join('')}
          </div>
        </div>
        <div class="card pad"><h2>Demo data</h2><p class="muted">Everything in this demo is sample data saved in this browser. Reset to start the walkthrough again.</p>
          ${btn(`${ic('rotate-ccw')}Reset demo data`, 'reset', '', 'dark')}
          <h2 class="mt">Status rules</h2>
          <ul class="rules"><li>${pill('low')} under a quarter of the last restock</li><li>${pill('soon')} best by within 14 days</li><li>${pill('expired')} hidden from students, listed for removal</li><li>${pill('out')} nothing on the shelf</li></ul>
        </div>
      </div>`);
  }

  function helpPage() {
    const step = (n, t, d, to) => `<a class="card help-step" href="#/${to}"><span class="n">${n}</span><span><b>${t}</b><small>${d}</small></span>${ic('chevron-right')}</a>`;
    return shell('help', `${pageHead('Help', 'How food moves through Pantry Network')}
      <div class="help-list">
        ${step(0, 'Print the QR poster', 'Tape it by the shelves. Students scan it to log what they take.', 'poster')}
        ${step(1, 'Add stock with a photo', 'Point the camera at the label. We read the name and date. Dates are optional.', 'add')}
        ${step(2, 'Students tap what they took', 'Honor system: no login, no names. Expired and empty items are hidden.', 'student')}
        ${step(3, 'Check Inventory', 'Smart cards on top, one product list below. Select rows to remove expired food.', 'inventory')}
        ${step(4, 'Review Take-out', 'Student scans and staff removals in one feed. Record anything that left without a scan.', 'takeout')}
        ${step(5, 'Share across Massachusetts', 'Claim what you need from nearby campuses. Offer what you can spare.', 'share')}
      </div>`);
  }

  // ---------- modals
  function modal() {
    const m = ui.modal;
    if (!m) return '';
    let inner = '';
    if (m.type === 'remove') {
      const reasons = ['Expired', 'Damaged', 'Given out by hand', 'Moved to Share', 'Other'];
      const avail = state.items.filter(i => i.qty > 0 && !m.rows.some(r => r.id === i.id));
      const total = sum(m.rows.map(r => r.qty));
      inner = `<div class="m-head"><div><h2>${m.title}</h2><small>Stock goes down right away. You can undo for 10 seconds.</small></div><button class="icon-btn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>
        <div class="m-body">
          <div class="rm-list">${m.rows.map((r, k) => { const it = item(r.id); return `<div class="rm-row">${thumb(it.category, 'sm')}
            <span class="grow"><b>${esc(it.name)}</b><small>${esc(it.brand)}${it.expires ? ` · ${statusOf(it) === 'expired' ? 'expired' : 'best by'} ${fmt(it.expires)}` : ''}</small></span>
            <div class="stepper sm"><button data-action="rmQty" data-k="${k}" data-d="-1">−</button><b>${r.qty}</b><button data-action="rmQty" data-k="${k}" data-d="1">+</button></div><small class="of">of ${it.qty}</small>
            ${m.allowAdd ? `<button class="icon-btn sm" data-action="rmDrop" data-k="${k}" aria-label="Remove line">${ic('x')}</button>` : ''}</div>`; }).join('')}
            ${m.allowAdd ? `<label class="select block">${ic('plus')}<select data-bind="rmAdd"><option value="">Add an item…</option>${avail.map(i => `<option value="${i.id}">${esc(i.name)} (${i.qty} on the shelf)</option>`).join('')}</select></label>` : ''}
          </div>
          <h3>Why are they leaving the shelf?</h3>
          <div class="chip-row wrap">${reasons.map(r => `<button class="cchip ${m.reason === r ? 'on' : ''}" data-action="rmReason" data-v="${r}">${m.reason === r ? ic('check') : ''}${r}</button>`).join('')}</div>
          <label class="field"><span>Your name (optional)</span><input data-modal="by" value="${esc(m.by || '')}" placeholder="Staff"></label>
          <p class="hint box">${ic('info')}Expired and damaged items count as food wasted in your report. Given out and moved to Share count as food used.</p>
        </div>
        <div class="m-foot">${btn('Cancel', 'closeModal')}${btn(`${ic('trash-2')}${m.allowAdd ? 'Record' : 'Remove'} ${total} item${total === 1 ? '' : 's'}`, 'confirmRemove', total ? '' : 'disabled', 'red')}</div>`;
    } else if (m.type === 'claim') {
      const o = state.offers.find(x => x.id === m.id);
      const c = CAMPUSES[o.campus];
      const chip = matchChip(o);
      const mine = state.items.filter(i => i.category === o.category).sort((a, b) => a.qty / a.of - b.qty / b.of)[0];
      inner = `<div class="m-head">${thumb(o.category)}<div><h2>Claim ${esc(o.name.toLowerCase())}</h2><small>from ${esc(c.name)} · ${esc(c.region)} · ${c.mi} mi</small></div><button class="icon-btn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>
        <div class="m-body">
          ${chip.kind === 'match' && mine ? `<p class="hint box green">${ic('sparkles')}${chip.text.replace('this', esc(mine.category))} (${mine.qty} of ${mine.of} ${esc(mine.name)} left). ${count(m.qty, o.unit)} would refill your shelf${m.qty >= mine.of * 2 ? ' twice over' : ''}.</p>` : ''}
          <div class="ph-row"><span><b>How many do you need?</b><small class="muted block">Up to ${o.qty} available${o.expires ? ` · Best by ${fmt(o.expires)}` : ''}</small></span>
            <div class="stepper"><button data-action="claimQty" data-d="-1">−</button><b>${m.qty}</b><button data-action="claimQty" data-d="1">+</button></div></div>
          <div class="card inset"><b>Pickup at ${esc(c.name)}</b>
            <div class="info-line">${ic('map-pin')}${esc(c.place)}</div><div class="info-line">${ic('clock')}${esc(c.hours)}</div><div class="info-line">${ic('user')}${esc(c.contact)}</div></div>
          <h3>What happens next</h3>
          <ol class="next"><li><b>1</b>${esc(c.name)} is told right away.</li><li><b>2</b>You agree on a pickup time.</li><li><b>3</b>Mark it picked up and both inventories update.</li></ol>
        </div>
        <div class="m-foot">${btn('Cancel', 'closeModal')}${btn(`Claim ${count(m.qty, o.unit)}`, 'confirmClaim', '', 'dark')}</div>`;
    } else if (m.type === 'offer') {
      const avail = state.items.filter(i => i.qty > 0);
      const it = item(m.itemId) || avail[0];
      inner = `<div class="m-head"><div><h2>Post an offer</h2><small>Nearby campuses see it on Share, closest first.</small></div><button class="icon-btn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>
        <div class="m-body">
          <label class="field"><span>Item</span><select data-bind="offerItem">${avail.map(i => `<option value="${i.id}" ${i.id === it.id ? 'selected' : ''}>${esc(i.name)} · ${i.qty} on the shelf</option>`).join('')}</select></label>
          <div class="ph-row"><span><b>How many can you spare?</b><small class="muted block">${it.expires ? `Best by ${fmt(it.expires)}` : 'No date'}</small></span>
            <div class="stepper"><button data-action="offerQty" data-d="-1">−</button><b>${m.qty}</b><button data-action="offerQty" data-d="1">+</button></div></div>
          <label class="field"><span>Note for pickup (optional)</span><input data-modal="note" value="${esc(m.note || '')}" placeholder="Like: ask at the front desk"></label>
          ${m.requestId ? `<p class="hint box green">${ic('megaphone')}This answers ${esc(CAMPUSES[state.requests.find(r => r.id === m.requestId).campus].name)}'s request.</p>` : ''}
        </div>
        <div class="m-foot">${btn('Cancel', 'closeModal')}${btn(`Offer ${count(m.qty, it.unit)}`, 'confirmOffer', '', 'dark')}</div>`;
    } else if (m.type === 'request') {
      inner = `<div class="m-head"><div><h2>Open a request</h2><small>Campuses with extra will see it and can offer some.</small></div><button class="icon-btn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>
        <div class="m-body">
          <label class="field"><span>What do you need?</span><input data-modal="name" value="${esc(m.name || '')}" placeholder="Like cereal cups"></label>
          <label class="field"><span>Category</span><select data-modal="category">${Object.keys(CATS).map(c => `<option ${c === m.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <div class="ph-row"><span><b>How many?</b></span><div class="stepper"><button data-action="reqQty" data-d="-1">−</button><b>${m.qty}</b><button data-action="reqQty" data-d="1">+</button></div></div>
        </div>
        <div class="m-foot">${btn('Cancel', 'closeModal')}${btn('Post request', 'confirmRequest', '', 'dark')}</div>`;
    } else if (m.type === 'fix') {
      const e = state.feed.find(x => x.id === m.id);
      inner = `<div class="m-head"><div><h2>Fix this entry</h2><small>${e.source === 'student' ? 'Student scan' : `Staff · ${esc(e.reason)}`} · ${ago(e.at)}</small></div><button class="icon-btn" data-action="closeModal" aria-label="Close">${ic('x')}</button></div>
        <div class="m-body"><div class="rm-list">${m.rows.map((r, k) => { const it = item(r.id); return `<div class="rm-row">${thumb(it.category, 'sm')}<span class="grow"><b>${esc(it.name)}</b></span>
          <div class="stepper sm"><button data-action="fixQty" data-k="${k}" data-d="-1">−</button><b>${r.qty}</b><button data-action="fixQty" data-k="${k}" data-d="1">+</button></div></div>`; }).join('')}</div>
          <p class="hint box">${ic('info')}Stock is adjusted by the difference.</p></div>
        <div class="m-foot">${btn(`${ic('trash-2')}Delete entry`, 'deleteEntry', '', 'ghost-red')}<div class="grow"></div>${btn('Cancel', 'closeModal')}${btn('Save', 'saveFix', '', 'dark')}</div>`;
    }
    return `<div class="overlay modal-wrap" data-action="closeModal"><div class="modal" data-action="noop" role="dialog">${inner}</div></div>`;
  }

  function toastEl() {
    if (!ui.toast) return '';
    return `<div class="toast">${ic('check-circle-2')}<span>${esc(ui.toast.msg)}</span>${ui.toast.undo ? '<button data-action="undo">Undo</button>' : ''}</div>`;
  }

  // ---------- actions
  const route = () => (location.hash.replace(/^#\/?/, '') || 'inventory').split('?')[0];
  const stepper = (v, d, min, max) => Math.min(max, Math.max(min, v + d));

  function openRemove(ids, opts = {}) {
    const rows = ids.map(id => { const it = item(id); return { id, qty: statusOf(it) === 'expired' || opts.all ? it.qty : Math.min(1, it.qty) }; }).filter(r => item(r.id).qty > 0);
    const allExpired = rows.length && rows.every(r => statusOf(item(r.id)) === 'expired');
    ui.modal = { type: 'remove', title: opts.title || `Remove ${rows.length} item${rows.length === 1 ? '' : 's'}`, rows, reason: opts.reason || (allExpired ? 'Expired' : 'Given out by hand'), allowAdd: !!opts.allowAdd };
    render();
  }
  function openOffer(itemId, qty, requestId) {
    const it = item(itemId) || state.items.find(i => i.qty > 0);
    ui.modal = { type: 'offer', itemId: it.id, qty: Math.min(qty || it.qty, it.qty), requestId };
    render();
  }

  const A = {
    noop() {},
    go: el => { location.hash = '#/' + el.dataset.to; },
    campus: () => toast('This demo is set up for Harbor University only'),
    setTab: el => { ui.tab = el.dataset.tab; render(); document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    setView: el => { ui.view = el.dataset.view; render(); },
    importExcel: () => toast('Excel import is mocked in this demo'),
    toggleRow: el => { const id = el.dataset.id; ui.selected.has(id) ? ui.selected.delete(id) : ui.selected.add(id); render(); },
    toggleAll: () => {
      const tabFn = TABS.find(t => t[0] === ui.tab)[2];
      const ids = state.items.filter(tabFn).map(i => i.id);
      const allOn = ids.every(id => ui.selected.has(id));
      ids.forEach(id => allOn ? ui.selected.delete(id) : ui.selected.add(id));
      render();
    },
    clearSel: () => { ui.selected.clear(); render(); },
    removeSelected: () => openRemove([...ui.selected]),
    removeExpired: () => openRemove(state.items.filter(i => statusOf(i) === 'expired').map(i => i.id), { reason: 'Expired' }),
    removeOne: el => { ui.drawer = null; openRemove([el.dataset.id]); },
    offerSelected: () => { const id = [...ui.selected][0]; ui.selected.clear(); openOffer(id); },
    recordOut: () => openRemove([], { title: 'Record items out', reason: 'Given out by hand', allowAdd: true }),
    rmQty: el => { const r = ui.modal.rows[el.dataset.k]; r.qty = stepper(r.qty, +el.dataset.d, 0, item(r.id).qty); render(); },
    rmDrop: el => { ui.modal.rows.splice(+el.dataset.k, 1); render(); },
    rmReason: el => { ui.modal.reason = el.dataset.v; render(); },
    confirmRemove: () => {
      const m = ui.modal;
      const rows = m.rows.filter(r => r.qty > 0);
      if (!rows.length) return;
      const before = rows.map(r => ({ id: r.id, qty: item(r.id).qty }));
      rows.forEach(r => { const it = item(r.id); it.qty = Math.max(0, it.qty - r.qty); });
      const entry = { id: uid('f'), at: Date.now(), source: 'staff', reason: m.reason, by: m.by || '', items: rows.map(r => ({ id: r.id, qty: r.qty })) };
      state.feed.unshift(entry);
      const offers = m.reason === 'Moved to Share' ? rows.map(r => ({ id: uid('m'), itemId: r.id, qty: r.qty, at: Date.now(), status: 'open' })) : [];
      state.myOffers.unshift(...offers);
      ui.selected.clear(); ui.modal = null; save();
      const n = sum(rows.map(r => r.qty));
      toast(`${m.allowAdd ? 'Recorded' : 'Removed'} ${n} item${n === 1 ? '' : 's'} · ${m.reason.toLowerCase()}`, () => {
        before.forEach(b => { item(b.id).qty = b.qty; });
        state.feed = state.feed.filter(e => e.id !== entry.id);
        state.myOffers = state.myOffers.filter(o => !offers.includes(o));
        save(); toast('Undone');
      });
    },
    undo: () => { const u = ui.toast && ui.toast.undo; ui.toast = null; if (u) u(); else render(); },
    closeModal: () => { ui.modal = null; render(); },

    openItem: el => {
      const it = item(el.dataset.id);
      ui.drawer = { id: it.id, draft: { ...it } };
      render();
    },
    newItem: () => { ui.drawer = { id: null, draft: { name: '', brand: '', unit: 'can', category: 'Canned Goods', qty: 1, of: 1, expires: '', restock: TODAY_ISO, noExpire: false, source: 'donated' } }; render(); },
    closeDrawer: () => { ui.drawer = null; render(); },
    draftSource: el => { ui.drawer.draft.source = el.dataset.v; render(); },
    saveDrawer: () => {
      const d = ui.drawer.draft;
      if (!d.name.trim()) return toast('Give the item a name');
      const clean = { ...d, name: d.name.trim(), qty: Math.max(0, +d.qty || 0), of: Math.max(1, +d.of || 1), expires: d.noExpire ? null : (d.expires || null) };
      if (ui.drawer.id) {
        const it = item(ui.drawer.id);
        const changed = ['name', 'brand', 'qty', 'expires', 'category'].filter(k => String(it[k] ?? '') !== String(clean[k] ?? ''));
        Object.assign(it, clean);
        if (changed.length) it.history.push({ at: Date.now(), text: `Edited ${changed.join(', ').replace('qty', 'amount').replace('expires', 'best by')}` });
      } else {
        state.items.unshift({ ...clean, id: uid('i'), history: [{ at: Date.now(), text: `Added ${count(clean.qty, clean.unit)} (typed)` }] });
      }
      ui.drawer = null; save(); toast('Saved');
    },

    feedFilter: el => { ui.feedFilter = el.dataset.v; render(); },
    feedAll: () => { ui.feedAll = !ui.feedAll; render(); },
    countFix: el => { state.dismissed.count = true; save(); toast(el.dataset.v === '40' ? 'Canned Goods count set to 40' : 'Kept 48. We will ask again after the next count'); },
    fixEntry: el => { const e = state.feed.find(x => x.id === el.dataset.id); ui.modal = { type: 'fix', id: e.id, rows: e.items.map(x => ({ ...x })) }; render(); },
    fixQty: el => { const r = ui.modal.rows[el.dataset.k]; r.qty = stepper(r.qty, +el.dataset.d, 0, 999); render(); },
    saveFix: () => {
      const e = state.feed.find(x => x.id === ui.modal.id);
      ui.modal.rows.forEach((r, k) => { const it = item(r.id); it.qty = Math.max(0, it.qty + (e.items[k].qty - r.qty)); });
      e.items = ui.modal.rows.filter(r => r.qty > 0);
      if (!e.items.length) state.feed = state.feed.filter(x => x !== e);
      ui.modal = null; save(); toast('Entry fixed and stock adjusted');
    },
    deleteEntry: () => {
      const e = state.feed.find(x => x.id === ui.modal.id);
      e.items.forEach(x => { const it = item(x.id); if (it) it.qty += x.qty; });
      state.feed = state.feed.filter(x => x !== e);
      ui.modal = null; save(); toast('Entry deleted and stock put back');
    },

    shareTab: el => { ui.shareTab = el.dataset.v; render(); },
    dismissRec: el => { state.dismissed[el.dataset.k] = true; save(); render(); },
    claim: el => { const o = state.offers.find(x => x.id === el.dataset.id); ui.modal = { type: 'claim', id: o.id, qty: Math.min(o.qty, 24) }; render(); },
    claimQty: el => { const o = state.offers.find(x => x.id === ui.modal.id); ui.modal.qty = stepper(ui.modal.qty, +el.dataset.d, 1, o.qty); render(); },
    confirmClaim: () => {
      const o = state.offers.find(x => x.id === ui.modal.id);
      const n = ui.modal.qty;
      o.qty -= n;
      if (o.qty <= 0) state.offers = state.offers.filter(x => x !== o);
      state.pickups.unshift({ id: uid('p'), campus: o.campus, name: o.name, unit: o.unit, qty: n, category: o.category, expires: o.expires, noExpire: !!o.noExpire });
      ui.modal = null; save();
      toast(`Claimed ${count(n, o.unit)}. ${CAMPUSES[o.campus].name} has been told`);
    },
    pickedUp: el => {
      const p = state.pickups.find(x => x.id === el.dataset.id);
      const existing = state.items.find(i => i.name.toLowerCase() === p.name.toLowerCase())
        || state.items.find(i => i.category === p.category && i.qty === 0);
      if (existing) {
        existing.qty += p.qty; existing.of = existing.qty; existing.restock = TODAY_ISO;
        if (p.expires) existing.expires = p.expires;
        existing.history.push({ at: Date.now(), text: `Added ${count(p.qty, p.unit)} from ${CAMPUSES[p.campus].name} (Share)` });
      } else {
        state.items.unshift({ id: uid('i'), name: p.name, brand: CAMPUSES[p.campus].name, unit: p.unit, category: p.category, qty: p.qty, of: p.qty, expires: p.expires, noExpire: p.noExpire, restock: TODAY_ISO, source: 'donated', history: [{ at: Date.now(), text: `Added ${count(p.qty, p.unit)} from ${CAMPUSES[p.campus].name} (Share)` }] });
      }
      state.pickups = state.pickups.filter(x => x !== p);
      save(); toast(`Inventory updated: +${count(p.qty, p.unit)}`);
    },
    openOffer: el => openOffer(el.dataset.id),
    offerQty: el => { const it = item(ui.modal.itemId); ui.modal.qty = stepper(ui.modal.qty, +el.dataset.d, 1, it.qty); render(); },
    offerToRequest: el => { const r = state.requests.find(x => x.id === el.dataset.id); openOffer(r.matchId, r.qty, r.id); },
    confirmOffer: () => {
      const m = ui.modal;
      state.myOffers.unshift({ id: uid('m'), itemId: m.itemId, qty: m.qty, note: m.note, at: Date.now(), status: 'open' });
      if (m.requestId) state.requests.find(r => r.id === m.requestId).offered = m.qty;
      ui.modal = null; ui.shareTab = 'mine'; save();
      toast(`Offer posted: ${count(m.qty, item(m.itemId).unit)} of ${item(m.itemId).name.toLowerCase()}`);
      if (route() !== 'share') location.hash = '#/share';
    },
    withdraw: el => { state.myOffers = state.myOffers.filter(m => m.id !== el.dataset.id); save(); toast('Offer withdrawn'); },
    openRequest: el => { ui.modal = { type: 'request', name: el.dataset.name || '', category: el.dataset.cat || 'Canned Goods', qty: 12 }; render(); },
    reqQty: el => { ui.modal.qty = stepper(ui.modal.qty, +el.dataset.d * (ui.modal.qty >= 10 ? 5 : 1), 1, 500); render(); },
    confirmRequest: () => {
      const m = ui.modal;
      if (!m.name.trim()) return toast('Say what you need');
      state.myRequests.unshift({ id: uid('r'), campus: 'harbor', name: m.name.trim(), category: m.category, qty: m.qty });
      ui.modal = null; ui.shareTab = 'requests'; save();
      toast('Request posted to nearby campuses');
      if (route() !== 'share') location.hash = '#/share';
    },

    shoot: () => {
      ui.add.step = 'reading'; render();
      setTimeout(() => {
        const read = window.MOCK_READS[ui.add.readIdx % window.MOCK_READS.length];
        ui.add.readIdx++;
        ui.add.draft = { ...read, noExpire: false };
        ui.add.qty = 4; ui.add.step = 'read'; render();
      }, 1100);
    },
    typeIt: () => { ui.add.draft = { name: '', brand: '', unit: 'can', category: 'Canned Goods', expires: null, noExpire: false }; ui.add.qty = 1; ui.add.step = 'read'; ui.add.sheet = true; render(); },
    retake: () => { ui.add.step = 'camera'; ui.add.readIdx = Math.max(0, ui.add.readIdx - 1); render(); },
    editRead: () => { ui.add.sheet = true; render(); },
    closeSheet: () => { ui.add.sheet = false; render(); },
    addQty: el => { ui.add.qty = stepper(ui.add.qty, +el.dataset.d, 1, 999); render(); },
    saveRead: () => {
      const d = ui.add.draft, n = ui.add.qty;
      if (!d.name.trim()) { ui.add.sheet = true; render(); return toast('Name the item first'); }
      const match = state.items.find(i => i.name.toLowerCase() === d.name.trim().toLowerCase());
      let before = 0, after, category = d.category;
      if (match) {
        before = match.qty; match.qty += n; match.of = match.qty; match.restock = TODAY_ISO; after = match.qty; category = match.category;
        if (d.expires && (!match.expires || daysUntil(match.expires) < 0 || d.expires < match.expires)) match.expires = d.expires;
        match.history.push({ at: Date.now(), text: `Added ${count(n, match.unit)} (photo)` });
      } else {
        after = n;
        state.items.unshift({ id: uid('i'), name: d.name.trim(), brand: d.brand, unit: d.unit || 'item', category: d.category, qty: n, of: n, expires: d.noExpire ? null : d.expires, noExpire: d.noExpire, restock: TODAY_ISO, source: 'donated', history: [{ at: Date.now(), text: `Added ${count(n, d.unit || 'item')} (photo)` }] });
      }
      ui.add.last = { name: d.name.trim(), before, added: n, after, unit: d.unit || 'item', category };
      ui.add.delivery.push({ name: d.name.trim(), added: n });
      ui.add.step = 'saved'; ui.add.sheet = false; save(); render();
    },
    nextItem: () => { ui.add.step = 'camera'; render(); },
    finishAdd: () => { ui.add = { ...ui.add, step: 'camera', delivery: [], last: null }; location.hash = '#/inventory'; },

    studentGroup: el => { ui.student.group = el.dataset.v; render(); },
    cart: el => { const c = ui.student.cart; const it = item(el.dataset.id); c[it.id] = stepper(c[it.id] || 0, +el.dataset.d, 0, it.qty); render(); },
    studentDone: () => {
      const picked = Object.entries(ui.student.cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ id, qty }));
      if (!picked.length) return;
      picked.forEach(x => { const it = item(x.id); it.qty = Math.max(0, it.qty - x.qty); });
      state.feed.unshift({ id: uid('f'), at: Date.now(), source: 'student', items: picked });
      ui.student = { cart: {}, group: 'All', q: '', done: picked };
      save(); render();
    },
    studentAgain: () => { ui.student.done = null; render(); },

    print: () => window.print(),
    reset: () => { state = window.SEED(); ui.selected.clear(); save(); toast('Demo data reset'); },
  };

  const BIND = {
    search: v => { ui.search = v; },
    studentQ: v => { ui.student.q = v; },
    shareRegion: v => { ui.shareRegion = v; },
    shareCat: v => { ui.shareCat = v; },
    offerItem: v => { const it = item(v); ui.modal.itemId = v; ui.modal.qty = Math.min(ui.modal.qty, it.qty); },
    rmAdd: v => { if (v) ui.modal.rows.push({ id: v, qty: 1 }); },
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.action];
    if (!fn) return;
    if (el.dataset.action !== 'noop') e.preventDefault();
    if (el.dataset.action === 'noop') return;
    fn(el, e);
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.bind && t.tagName === 'INPUT') { BIND[t.dataset.bind](t.value); render(); }
    else if (t.dataset.draft && t.type !== 'checkbox') ui.drawer.draft[t.dataset.draft] = t.value;
    else if (t.dataset.read && t.type !== 'checkbox') ui.add.draft[t.dataset.read] = t.value || (t.type === 'date' ? null : '');
    else if (t.dataset.modal) ui.modal[t.dataset.modal] = t.value;
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.bind && t.tagName === 'SELECT') { BIND[t.dataset.bind](t.value); render(); }
    else if (t.dataset.draft && t.type === 'checkbox') { ui.drawer.draft.noExpire = t.checked; render(); }
    else if (t.dataset.read && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date')) {
      if (t.type === 'checkbox') ui.add.draft.noExpire = t.checked; else ui.add.draft[t.dataset.read] = t.value || null;
      render();
    } else if (t.dataset.sheet) {
      const it = item(t.dataset.id), f = t.dataset.sheet;
      it[f] = f === 'qty' ? Math.max(0, +t.value || 0) : (t.type === 'date' ? (t.value || null) : t.value);
      if (f === 'qty' && it.qty > it.of) it.of = it.qty;
      it.history.push({ at: Date.now(), text: `Edited ${f === 'qty' ? 'amount' : f} in Full sheet` });
      save(); render();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (ui.add.sheet) ui.add.sheet = false; else if (ui.modal) ui.modal = null; else if (ui.drawer) ui.drawer = null; else return; render(); }
  });

  // ---------- render
  function render() {
    const r = route();
    const pages = { inventory: inventoryPage, takeout: takeoutPage, share: sharePage, add: addPage, student: studentPage, poster: posterPage, settings: settingsPage, help: helpPage };
    const page = pages[r] || inventoryPage;
    const active = document.activeElement;
    const focusId = active && active.id;
    const caret = focusId && active.selectionStart;
    const scrollers = [...document.querySelectorAll('[data-keep-scroll], .ph-screen, .drawer-body, .m-body')].map(n => n.scrollTop);
    $app.innerHTML = page() + drawer() + modal() + toastEl();
    document.body.classList.toggle('locked', !!(ui.modal || ui.drawer));
    [...document.querySelectorAll('[data-keep-scroll], .ph-screen, .drawer-body, .m-body')].forEach((n, k) => { if (scrollers[k]) n.scrollTop = scrollers[k]; });
    if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus(); try { f.setSelectionRange(caret, caret); } catch { /* not a text input */ } } }
    if (window.lucide) window.lucide.createIcons();
    if (r === 'poster') {
      const q = document.getElementById('qr');
      const url = location.href.split('#')[0] + '#/student';
      if (q && window.QRCode) new window.QRCode(q, { text: url, width: 240, height: 240, colorDark: '#111714', colorLight: '#ffffff' });
    }
  }

  let lastRoute = route();
  window.addEventListener('hashchange', () => {
    const r = route();
    if (r !== lastRoute) { ui.modal = ui.modal && r === 'share' ? ui.modal : null; ui.drawer = null; window.scrollTo(0, 0); lastRoute = r; }
    render();
  });
  render();
})();
