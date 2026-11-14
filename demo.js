/* Bespoke Underwriting — single-page modular demo (Nov 11 2026).
   Layout + estimate wiring only. Model math lives in core-model.js; outputs render via the existing outputs code.
   Providers are pluggable (window.BU_DEMO_CONFIG) so Google Maps / Distance Matrix can replace Leaflet/OSM/OSRM later. */
(function () {
  'use strict';
  var B = window.BespokeCore;
  if (!B) return;
  var CFG = window.BU_DEMO_CONFIG = Object.assign({
    mapProvider: 'leaflet',      /* 'leaflet' | 'google' */
    routeProvider: 'osrm',       /* 'osrm' | 'google' (Distance Matrix / Directions) */
    geocoder: 'census',          /* 'census' (US Census exact address, Photon fallback) | 'photon' | 'google' */
    googleMapsKey: '',
    parcelEndpoint: 'https://bespokeunderwriting.com/.netlify/functions/parcel-land',
    roadFactor: 1.25             /* straight-line fallback only, labeled approximate */
  }, window.BU_DEMO_CONFIG || {});
  var STORE = 'bespoke.demo.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
  function loadState() {
    try {
      var x = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
      return x;
    } catch (e) { return {}; }
  }
  var S = loadState();
  S.touched = S.touched || {}; S.done = S.done || {}; S.auto = S.auto || {}; S.logi = S.logi || {};
  /* owner Nov 11 14:05 schema 13 (one-time): stale overrides from earlier sessions (kept transport/crane values, touched flags, cached land) are dropped so the new default case shows; later edits are kept. */
  if ((S.schema || 0) < 13) { S.touched = {}; S.userTransport = null; S.userCrane = null; S.land = null; S.auto = {}; S.schema = 13; save(); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { } }
  var money0 = function (v) {
    if (v == null || !isFinite(v)) return '—';
    var neg = v < 0, a = Math.abs(v);
    if (a >= 1e12) return (neg ? '-' : '') + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (neg ? '-' : '') + '$' + (a / 1e9).toFixed(2) + 'B';
    return (neg ? '-$' : '$') + Math.round(a).toLocaleString('en-US');
  };
  var pct = function (x, d) {
    if (x == null || !isFinite(x)) return '—';
    var p = x * 100;
    if (Math.abs(p) > 999) return (p < 0 ? '<−' : '>') + '999%';
    return p.toFixed(d == null ? 2 : d) + '%';
  };
  function fmtDscr(x) {
    if (x == null || !isFinite(x)) return '—';
    if (Math.abs(x) > 999) return (x > 0 ? '>' : '<−') + '999x';
    return x.toFixed(2) + 'x';
  }

  /* ---------------- $ formatting for every cost field (display only; parsing strips $ and commas) ---------------- */
  var MONEY_IDS = ['cLand', 'cPermit', 'cClear', 'cWater', 'cPower', 'cLandscape', 'cFoundation', 'cDrive', 'inpRent', 'inpOpexTaxes', 'inpOpexInsurance', 'inpOpexUtilities', 'inpFactoryRate'];
  var NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function clean(v) { return String(v == null ? '' : v).replace(/[$,\s]/g, ''); }
  function fmtMoney(raw, live) {
    var c = clean(raw); if (c === '') return '';
    if (!/^-?\d*\.?\d*$/.test(c)) return String(raw);
    var neg = c.charAt(0) === '-'; if (neg) c = c.slice(1);
    var parts = c.split('.'), ip = parts[0] || '0', dp = parts.length > 1 ? parts[1] : null;
    ip = String(+ip || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (dp != null) { dp = dp.slice(0, 2); if (!live && dp.length === 1) dp += '0'; if (!live && /^0*$/.test(dp) && dp.length) dp = dp; }
    return (neg ? '-$' : '$') + ip + (dp != null ? '.' + dp : '');
  }
  function moneyize(inp) {
    if (!inp || inp.dataset.money === '1') return;
    var cur = NATIVE.get.call(inp);
    inp.setAttribute('data-money', '1'); inp.type = 'text'; inp.setAttribute('inputmode', 'decimal');
    inp.removeAttribute('step'); inp.removeAttribute('min');
    var ph = inp.getAttribute('placeholder'); if (ph && /^[\d.]+$/.test(ph)) inp.setAttribute('placeholder', fmtMoney(ph));
    Object.defineProperty(inp, 'value', {
      configurable: true,
      get: function () { return clean(NATIVE.get.call(this)); },
      set: function (v) { NATIVE.set.call(this, fmtMoney(v)); }
    });
    inp.value = cur;
    inp.addEventListener('input', function () {
      var raw = NATIVE.get.call(inp), pos = inp.selectionStart == null ? raw.length : inp.selectionStart;
      var keep = raw.slice(0, pos).replace(/[^0-9.]/g, '').length;
      var f = fmtMoney(raw, true); if (f === raw) return;
      NATIVE.set.call(inp, f);
      var i = 0, k = 0; while (i < f.length && k < keep) { if (/[0-9.]/.test(f.charAt(i))) k++; i++; }
      try { inp.setSelectionRange(i, i); } catch (e) { }
    }, true);
    inp.addEventListener('blur', function () { NATIVE.set.call(inp, fmtMoney(NATIVE.get.call(inp))); });
  }
  MONEY_IDS.forEach(function (id) { moneyize(document.getElementById(id)); });
  window.BU_moneyize = moneyize;

  /* ---------------- site header (same menu as the homepage) ---------------- */
  var top = document.getElementById('v-est');
  var header = el('header', { class: 'bu-sitebar', id: 'buSitebar' },
    '<div class="bu-w bu-sitebar-inner">' +
    '<a class="bu-sb-brand" href="https://bespokeunderwriting.com/"><img src="icons/bu-mark.png?v=20261111-logoback" width="44" height="44" alt=""><span>Bespoke Underwriting</span></a>' +
    '<button class="bu-sb-menu" type="button" aria-controls="buSiteNav" aria-expanded="false" aria-label="Open menu"><span></span><span></span><span></span></button>' +
    '<nav class="bu-sb-nav" id="buSiteNav" aria-label="Primary"><a href="https://bespokeunderwriting.com/">Home</a><a href="./" aria-current="page">Development Model</a><a href="https://bespokeunderwriting.com/whitepaper/">White Paper</a><a href="https://bespokeunderwriting.com/#pricing">Pricing</a><a href="https://bespokeunderwriting.com/#faq">FAQ</a><a href="https://bespokeunderwriting.com/#contact">Contact</a></nav>' +
    '<div class="bu-sb-actions"><a class="bu-sb-cta" href="https://bespokeunderwriting.com/#contact">Get started</a></div></div>');
  document.body.insertBefore(header, document.body.firstChild);
  var oldTop = $('#buDemoTop'); if (oldTop) oldTop.remove();
  $('.bu-sb-menu', header).addEventListener('click', function () { var o = header.classList.toggle('open'); this.setAttribute('aria-expanded', String(o)); });
  $$('.bu-sb-nav a', header).forEach(function (a) { a.addEventListener('click', function () { header.classList.remove('open'); }); });

  /* ---------------- hero ---------------- */
  var vest = top;
  var addrStep = $('#addrStep');
  var ICON = {
    units: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    area: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 4v16"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
  };
  var hero = el('section', { class: 'bu-hero bu-w', id: 'buHero' },
    '<div class="bu-hero-copy"><h1>Bespoke Underwriting <span class="accent">Development Model</span></h1>' +
    '<div class="bu-hero-lede">Modular doesn&#39;t make sense at every location. Enter a few basic details about your deal, and the model will do the rest.</div></div>' +
    '<div class="bu-hero-grid">' +
    '<div class="bu-card bu-addr-card" id="buAddrCard"><div class="bu-map" id="buMap"><div class="bu-map-ph"><span class="bu-ico">' + ICON.pin + '</span><span>Your site, the nearest factory and the delivery route appear here once you enter an address.</span></div></div>' +
    '<div class="bu-route" id="buRoute" aria-live="polite"></div><div id="buAddrSlot"></div></div>' +
    '<div class="bu-hero-side">' +
    '<div class="bu-card bu-lever" id="buLeverUnits"><div class="bu-lever-head"><span class="bu-ico">' + ICON.units + '</span><label for="buUnits">Number of units</label></div><div class="bu-lever-row"><input id="buUnits" type="number" min="1" step="1" inputmode="numeric"><input type="range" id="buUnitsR" min="1" max="20" step="1" aria-label="Number of units slider"></div><span class="bu-lever-foot" id="buUnitsFoot"></span></div>' +
    '<div class="bu-card bu-lever" id="buLeverArea"><div class="bu-lever-head"><span class="bu-ico">' + ICON.area + '</span><label for="buArea">Square feet per unit</label></div><div class="bu-lever-row"><input id="buArea" type="number" min="1" step="10" inputmode="numeric"><input type="range" id="buAreaR" min="400" max="4000" step="10" aria-label="Square feet per unit slider"></div><span class="bu-lever-foot" id="buAreaFoot"></span></div>' +
    '<div class="bu-card bu-proj" id="buProj" aria-live="polite"><span class="bu-vlab">Your project</span><div class="bu-proj-grid">' +
      '<div class="bu-ctr"><span class="bu-ctr-v" id="buPjSf">—</span><span class="bu-ctr-l">Total sf</span><span class="bu-ctr-s" id="buPjSfS"></span></div>' +
      '<div class="bu-ctr"><span class="bu-ctr-v" id="buPjFac">—</span><span class="bu-ctr-l">Est. factory cost</span><label class="bu-pj-rate"><span>Rate</span><input id="buFacRate" inputmode="decimal" aria-label="Factory rate, dollars per square foot"><span>/sf</span></label><button type="button" class="bu-link bu-pj-reset" id="buFacReset" hidden>Reset to $90/sf</button></div>' +
      '<div class="bu-ctr"><span class="bu-ctr-v" id="buPjTrips">—</span><span class="bu-ctr-l">Truck trips</span><span class="bu-ctr-s" id="buPjTripsS"></span></div>' +
      '<div class="bu-ctr"><span class="bu-ctr-v accent-t" id="buPjTot">—</span><span class="bu-ctr-l">Est. Total Project Cost</span><span class="bu-ctr-s" id="buPjTotS"></span></div>' +
    '</div></div>' +
    '</div>' +
    '</div>');
  top.appendChild(hero);
  if (addrStep) {
    $('#buAddrSlot').appendChild(addrStep);
    var ttl = $('.addr-step-title', addrStep); if (ttl) ttl.textContent = 'Property address';
    var ia = $('#inpAddr'); if (ia) { ia.setAttribute('rows', '1'); ia.setAttribute('placeholder', 'Enter your site address'); if (/^\s*sample modular deal\s*$/i.test(ia.value)) { ia.value = ''; try { var _i = B.loadInputs(); if (/sample modular deal/i.test(_i.addr || '')) { _i.addr = ''; B.saveInputs(_i); } } catch (e) { } } /* owner Nov 11: project name must not show as the address */ ia.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) { e.preventDefault(); ia.dispatchEvent(new Event('change', { bubbles: true })); } }); }
  }
  /* verdict + results + steps containers */
  var verdict = el('section', { class: 'bu-verdict bu-w', id: 'buVerdict', 'aria-label': 'Quick verdict', 'data-keep-parens': '1' });
  top.appendChild(verdict);
  var results = el('section', { class: 'bu-results bu-w', id: 'buResults', 'aria-label': 'Results' }, '<div class="bu-sec-head"><div class="bu-kicker">Results</div><h2>Your deal at a <span class="accent">glance</span></h2></div><div class="bu-results-body" id="buResultsBody"></div>');
  top.appendChild(results);
  var prog = el('nav', { class: 'bu-progress', id: 'buProgress', 'aria-label': 'Steps' });
  var steps = el('section', { class: 'bu-steps bu-w', id: 'buSteps' }, '<div class="bu-sec-head"><div class="bu-kicker">Fine-tune</div><h2>Five steps to <span class="accent">your model</span></h2><div class="bu-sec-lede">Everything is pre-filled with our estimates. Move any slider and watch the chart beside it react.</div></div>');
  top.appendChild(prog);
  top.appendChild(steps);
  var holdRow = el('section', { class: 'bu-hold bu-w bu-hide-rev', id: 'buHold', hidden: '', 'data-hidden-by': 'owner 10:19 — remove bu-hide-rev and hidden to restore' }, '<div class="bu-sec-head bu-sec-head-sm"><h3>Hold and sale detail</h3></div><div class="bu-hold-body" id="buHoldBody"></div>');
  top.appendChild(holdRow);
  var ready = el('section', { class: 'bu-ready bu-w', id: 'buReady', 'data-keep-parens': '1' });
  top.appendChild(ready);
  vest.classList.add('bu-vest');

  /* ---------------- steps (input section | its outputs) ---------------- */
  function secOf(id) { var t = document.getElementById(id); return t ? t.closest('section.sec') : null; }
  var mainSec = secOf('adminModelTable'), siteSec = $('#siteCostSec'), rentSec = secOf('inpRent'), opexSec = secOf('opexTable'), uwSec = secOf('uwTable');
  var runRow = $('.run-row', vest); if (runRow) runRow.hidden = true; /* single page: no separate Outputs page to open */
  var schedSec = el('section', { class: 'sec sec-cat bu-sched-sec' }, '<table class="out-table in-table bu-sched-table"><thead><tr><th>Construction Schedule</th><th class="num">Days</th></tr></thead><tbody id="buSchedBody"></tbody></table>');
  var STEPS = [
    /* Step 1 shows outputs only: units and sf/unit are edited in the hero levers, factory rate in the hero project card, land in the verdict Land card.
       The Main Inputs fields stay in the page (hidden) as the single source the model reads. Construction schedule step removed (owner 10:16); schedule math unchanged. */
    { id: 'size', title: 'Land and sources', left: [], right: ['land', 'sources'] },
    { id: 'site', title: 'Permitting and site costs', left: [siteSec], right: ['siteDonut', 'siteTable'] },
    { id: 'rent', title: 'Rent and value', left: [rentSec], right: ['waterfall', 'rentProj', 'cfYear', 'coc'], stack: true }, /* owner 12:55: Cash Flow by Year + Cash on Cash 2-up directly below NOI/Five-Year */
    { id: 'opex', title: 'Operating expenses', left: [opexSec], right: ['opexChart', 'noi', 'exp', 'carry'], hideRev: ['noi', 'exp', 'carry'] }, /* owner Nov 11 12:51: three tables hidden reversibly (bu-hide-rev); one chart replaces them */
    { id: 'fin', title: 'Financing and hold', left: [uwSec], right: ['loans'], wide: true } /* Underwriting Assumptions full width, loan schedules directly below it; charts moved to Rent and value */
  ];
  STEPS.forEach(function (st, i) { st.n = i + 1; });
  var srcHold = el('div', { id: 'buSrcHold', class: 'bu-src-hold', hidden: '' }); vest.appendChild(srcHold);
  if (mainSec) srcHold.appendChild(mainSec);
  srcHold.appendChild(el('div', { class: 'bu-slot', 'data-key': 'gantt' }));
  STEPS.forEach(function (st) {
    var row = el('section', { class: 'bu-step', id: 'buStep-' + st.id, 'data-step': st.id },
      '<div class="bu-step-head"><span class="bu-step-n">Step ' + st.n + '</span><h3>' + esc(st.title) + '</h3></div>' +
      '<div class="bu-pair"><div class="bu-pair-in"></div><div class="bu-pair-out" data-slot="' + st.id + '"></div></div>');
    st.left.forEach(function (s) { if (s) $('.bu-pair-in', row).appendChild(s); });
    st.right.forEach(function (k) { var sl = el('div', { class: 'bu-slot', 'data-key': k }); if (st.hideRev && st.hideRev.indexOf(k) >= 0) { sl.classList.add('bu-hide-rev'); sl.hidden = true; sl.setAttribute('data-hidden-by', 'owner 12:51 — remove bu-hide-rev and hidden to restore'); } $('.bu-pair-out', row).appendChild(sl); });
    if (st.below) { var bl = el('div', { class: 'bu-step-below' }); st.below.forEach(function (k) { bl.appendChild(el('div', { class: 'bu-slot', 'data-key': k })); }); row.appendChild(bl); }
    if (!st.left.length) row.classList.add('bu-step-outonly');
    if (st.wide) row.classList.add('bu-step-wide');
    if (st.stack) row.classList.add('bu-step-stack'); /* inputs as a compact strip on top, its two charts 2-up below */
    steps.appendChild(row);
    st.row = row;
    prog.appendChild(el('a', { href: '#buStep-' + st.id, 'data-step': st.id, class: 'bu-prog-item' }, '<span class="bu-prog-dot">' + st.n + '</span><span class="bu-prog-t">' + esc(st.title) + '</span>'));
  });
  /* waterfall slot is ours (new chart); the rest are existing outputs relocated after each render */
  function slot(k) { return document.querySelector('.bu-slot[data-key="' + k + '"]'); }

  /* construction schedule: read-only, existing model plan (no editable timing inputs exist in the model) */
  function paintSched() {
    var tb = $('#buSchedBody'); if (!tb) return;
    var plan = (B.WEEKLY_PLAN || []).slice(), FP = B.FACTORY_PRODUCTION || {}, CO = B.CO_DAY;
    var rows = [['Factory production', 'Day ' + FP.start + ' – ' + (FP.start + FP.dur - 1)]];
    plan.forEach(function (t) {
      var s = t.rel === 'delivery' ? (t.at != null ? t.at : 49) : t.start, e = s + Math.max(1, t.dur) - 1;
      rows.push([t.label, s === e ? 'Day ' + s : 'Day ' + s + ' – ' + e]);
    });
    rows.push(['Certificate of occupancy', 'Day ' + CO]);
    tb.innerHTML = rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="num"><output class="uw-derived">' + esc(r[1]) + '</output></td></tr>'; }).join('');
  }
  paintSched();

  /* ---------------- relocate rendered outputs into the slots after every render ---------------- */
  var outRoot = $('#outRoot');
  function thText(sec) { var th = sec && sec.querySelector('th'); return th ? th.textContent.trim() : ''; }
  var lastSig = {};
  function place(key, nodes) {
    var s = slot(key) || (key === 'results' ? $('#buResultsBody') : key === 'hold' ? $('#buHoldBody') : null);
    if (!s) return;
    if (!nodes.some(function (n) { return n && n.parentNode !== s; })) return; /* no fresh render for this slot */
    $$('[data-bu-moved]', s).forEach(function (n) { if (nodes.indexOf(n) < 0) n.remove(); });
    nodes.forEach(function (n) { if (!n) return; n.setAttribute('data-bu-moved', key); if (n.parentNode !== s) s.appendChild(n); });
    var sig = nodes.map(function (n) { return n ? n.textContent.replace(/\s+/g, ' ').slice(0, 4000) : ''; }).join('|');
    if (lastSig[key] != null && lastSig[key] !== sig) { s.classList.remove('bu-pulse'); void s.offsetWidth; s.classList.add('bu-pulse'); }
    lastSig[key] = sig;
  }
  var placing = false;
  function relocate() {
    if (placing || !outRoot) return; placing = true;
    try {
      var kids = Array.prototype.slice.call(outRoot.children);
      if (!kids.length) return;
      var find = function (fn) { for (var i = 0; i < kids.length; i++) if (fn(kids[i])) return kids[i]; return null; };
      var tm = find(function (k) { return k.classList.contains('top-metrics'); });
      var cp = find(function (k) { return k.classList.contains('cost-pair'); });
      var land = find(function (k) { return k.classList.contains('sec-cat') && /^Land And Closing/i.test(thText(k)); });
      var site = find(function (k) { return k.classList.contains('sec-cat') && /^Permitting And Site Costs/i.test(thText(k)); });
      var gantt = find(function (k) { return k.classList.contains('gantt-sec'); });
      var noi = find(function (k) { return k.id === 'noiSec'; });
      var rp = find(function (k) { return k.id === 'rentProj'; });
      var exp = find(function (k) { return k.id === 'expSec'; });
      var carry = find(function (k) { return k.id === 'carryingCostSec'; });
      var hold = find(function (k) { return k.id === 'holdSec'; });
      var hc = find(function (k) { return k.classList.contains('hold-charts'); });
      var deal = find(function (k) { return k.id === 'dealFinancialsSec'; });
      var cards = hc ? $$(':scope > .chart-card', hc) : [];
      var cardBy = function (t) { for (var i = 0; i < cards.length; i++) { var h = cards[i].querySelector('[data-core-chart],[data-title]'); var tt = (cards[i].getAttribute('data-title') || (h && h.getAttribute('data-title')) || cards[i].textContent || ''); if (tt.indexOf(t) >= 0) return cards[i]; } return null; };
      var cfY = cards[0] || null, coc = cards[1] || null, src = cards[2] || null;
      place('results', [tm, cp]);
      place('land', [land]); place('sources', [src]);
      place('siteTable', [site]);
      place('gantt', [gantt]);
      requestAnimationFrame(eqSite); paintWaterfall(); paintRentSale(); paintOpexChart(); uniCards(); requestAnimationFrame(function () { eqPair('opex', '.bu-ox', 901); }); /* demo-owned persistent chart; the re-rendered rentProj section stays off-page */
      place('noi', [noi]); place('exp', [exp]); place('carry', [carry]);
      place('cfYear', [cfY]); place('coc', [coc]);
      place('hold', [hold, deal]);
      var lb = $('#loanLifecycleBottom'); if (lb) place('loans', [lb]);
      redrawGantt();
      paintSiteDonut();
      paintWaterfall();
      sizeAllPct();
      paintVerdict();
      paintReady();
    } finally { placing = false; }
  }
  function redrawGantt() {
    requestAnimationFrame(function () {
      var g = slot('gantt'), gs = g && g.querySelector('[data-core-chart="gantt"]');
      if (gs && gs.offsetParent && window.BUDrawGantt && window.__BU_gantt) { try { window.BUDrawGantt(gs, window.__BU_gantt); } catch (e) { } }
    });
  }
  if (outRoot) new MutationObserver(function () { setTimeout(relocate, 0); }).observe(outRoot, { childList: true });
  /* outputs' own resize handler re-renders; avoid a resize loop by only nudging BUCharts observers */
  var _de = window.dispatchEvent.bind(window);

  /* ---------------- Permitting and site costs donut (replaces the output table display; table kept hidden, export unchanged) ---------------- */
  var SITE_COLORS = ['#359BC5', '#50ADD3', '#6CC0E0', '#8ACEE8', '#A9DCEF', '#D6EEF7', '#FFFFFF'];
  var siteDonutPrev = '';
  function paintSiteDonut() {
    var s = slot('siteDonut'); if (!s) return;
    var r = B.compute(B.loadInputs());
    var items = r.costLines.filter(function (l) { return l.section === 'site'; }).map(function (l) { return { label: l.label, v: l.value == null ? 0 : +l.value, miss: l.value == null }; });
    var tot = items.reduce(function (a, b) { return a + b.v; }, 0);
    var sig = JSON.stringify(items) + '|' + r.total; /* share card follows Total Project Cost (address-driven transport/land) */
    if (sig === siteDonutPrev && s.firstChild) return; siteDonutPrev = sig;
    /* owner Nov 11 13:23: breakdown is a horizontal BAR chart (share of Total Project Cost becomes the donut) */
    var vmax = Math.max.apply(null, items.map(function (it) { return it.v; }).concat([1]));
    var bars = items.map(function (it, i) { var pc = tot > 0 ? Math.round(it.v / tot * 1000) / 10 : 0; return '<li><span class="bu-sb-l">' + esc(it.label) + '</span><span class="bu-sb-t"><i style="width:' + (it.v / vmax * 100).toFixed(2) + '%;background:' + SITE_COLORS[i % SITE_COLORS.length] + '"><title>' + esc(it.label) + ': ' + money0(it.v) + '</title></i></span><b>' + (it.miss ? '—' : money0(it.v)) + '</b><em>' + pc.toFixed(1) + '%</em></li>'; }).join('');
    s.innerHTML = '<div class="chart-card bu-sd">' + cardHead('Permitting and Site Costs', money0(tot)) + '<ul class="bu-sb" role="img" aria-label="Permitting and site costs by line, total ' + money0(tot) + '">' + bars + '</ul></div>' + siteShareCard(r, items);
    requestAnimationFrame(eqSite);
  }
  /* second Step 2 chart: permitting and site work as a share of Total Project Cost (existing line values only) */
  function siteShareCard(r, items) {
    var T = r.total, per = 0, site = 0;
    items.forEach(function (it) { if (/^Permitting$/i.test(it.label)) per += it.v; else site += it.v; });
    var rest = T != null ? T - per - site : null;
    var segs = [{ l: 'Permitting', v: per, c: '#359BC5' }, { l: 'Site work', v: site, c: '#A9DCEF' }, { l: 'Rest of project', v: rest, c: 'rgba(255,255,255,.16)' }];
    /* owner Nov 11 13:23: share of Total Project Cost is the DONUT */
    var R = 88, r0 = 58, cx = 110, cy = 110, a0 = -Math.PI / 2, paths = '', rows = '';
    function arc(a1, a2) { var lg = a2 - a1 > Math.PI ? 1 : 0, c = Math.cos, n = Math.sin; return 'M' + (cx + R * c(a1)) + ' ' + (cy + R * n(a1)) + ' A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + (cx + R * c(a2)) + ' ' + (cy + R * n(a2)) + ' L' + (cx + r0 * c(a2)) + ' ' + (cy + r0 * n(a2)) + ' A' + r0 + ' ' + r0 + ' 0 ' + lg + ' 0 ' + (cx + r0 * c(a1)) + ' ' + (cy + r0 * n(a1)) + ' Z'; }
    segs.forEach(function (g, i) { var pc = T > 0 && g.v != null ? g.v / T * 100 : 0;
      if (T > 0 && g.v > 0) { var sp = g.v / T * Math.PI * 2; paths += '<path class="bu-sd-arc" style="animation-delay:' + (i * 60) + 'ms" d="' + arc(a0, a0 + Math.max(0.001, sp - 0.018)) + '" fill="' + g.c + '"><title>' + esc(g.l) + ': ' + money0(g.v) + '</title></path>'; a0 += sp; }
      rows += '<li><i style="background:' + g.c + '"></i><span class="bu-sd-l">' + esc(g.l) + '</span><b>' + (g.v == null ? '—' : money0(g.v)) + '</b><em>' + pc.toFixed(1) + '%</em></li>'; });
    var sharePc = T > 0 ? ((per + site) / T * 100).toFixed(1) + '%' : '—';
    return '<div class="chart-card bu-ss">' + cardHead('Share of Total Project Cost', money0(T)) + '<div class="bu-sd-body"><svg viewBox="0 0 220 220" role="img" aria-label="Permitting and site work as a share of Total Project Cost">' + paths +
      '<text x="110" y="108" text-anchor="middle" class="bu-sd-c">' + sharePc + '</text><text x="110" y="128" text-anchor="middle" class="bu-sd-s">PERMIT + SITE</text></svg><ul class="bu-sd-leg">' + rows + '</ul></div></div>';
  }
  /* Step 2: left input card and right chart column end at the same height (≥601px) */
  function eqSite() {
    var row = document.querySelector('#buStep-site .bu-pair'), s = slot('siteDonut'); if (!row || !s) return;
    var inC = row.querySelector('.bu-pair-in'), outC = row.querySelector('.bu-pair-out'), ss = s.querySelector('.bu-sd'); /* the bar card absorbs any difference: its rows share it evenly */
    if (!inC || !outC || !ss) return;
    if (!row._ro && window.ResizeObserver) { row._ro = new ResizeObserver(function () { requestAnimationFrame(eqSite); }); row._ro.observe(inC); row._ro.observe(outC); }
    var exO = ss._ex || 0, exI = inC._ex || 0;
    if (window.innerWidth < 601) { if (exO || exI) { ss._ex = inC._ex = 0; ss.style.minHeight = ''; inC.style.minHeight = ''; } return; }
    var hi = inC.getBoundingClientRect().height - exI, ho = outC.getBoundingClientRect().height - exO; /* natural heights */
    var nO = Math.max(0, hi - ho), nI = Math.max(0, ho - hi);
    if (Math.abs(nO - exO) > 0.5) { ss._ex = nO; ss.style.minHeight = nO ? (ss.getBoundingClientRect().height - exO + nO) + 'px' : ''; }
    if (Math.abs(nI - exI) > 0.5) { inC._ex = nI; inC.style.minHeight = nI ? (hi + nI) + 'px' : ''; }
  }

  /* ---------------- Step 4: Operating Expenses column chart (existing opexLines values only) ---------------- */
  /* ---------------- one card pattern for every paired card (owner Nov 11 13:14): header row = title left, total right ---------------- */
  var CH_H = 250; /* plot height shared by the four Rent and value charts */
  function cardHead(t, v) { return '<div class="bu-ch"><span class="bu-ch-t">' + esc(t) + '</span>' + (v != null ? '<b class="bu-ch-v">' + esc(v) + '</b>' : '') + '</div>'; }
  function ensureHead(card, t, v) {
    if (!card) return; var h = null; for (var c = card.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains('bu-ch')) { h = c; break; }
    if (!h) { var d = document.createElement('div'); d.innerHTML = cardHead(t, v); card.insertBefore(d.firstChild, card.firstChild); return; }
    var a = h.querySelector('.bu-ch-t'); if (a && a.textContent !== t) a.textContent = t;
    var b = h.querySelector('.bu-ch-v');
    if (v != null) { if (!b) { b = document.createElement('b'); b.className = 'bu-ch-v'; h.appendChild(b); } if (b.textContent !== v) b.textContent = v; } else if (b) b.remove();
  }
  function uniCards() { /* cards rendered by the outputs code get the same header row; idempotent (writes only on change) */
    var ls = slot('land'), sec = ls && ls.querySelector('.sec'); if (sec) { var tf = sec.querySelector('tfoot td:last-child'); ensureHead(sec, 'Land and Closing', tf ? tf.textContent.trim() : null);
      var tb = sec.querySelector('tbody'); if (tb) { var r0 = B.compute(B.loadInputs()), lt = (line('land', r0) || 0) + (line('landClose', r0) || 0), sh = r0.total > 0 ? (lt / r0.total * 100).toFixed(1) + '%' : '—';
        var sr = tb.querySelector('tr.bu-land-share'); if (!sr) { sr = document.createElement('tr'); sr.className = 'bu-land-share'; sr.innerHTML = '<td>Share of Total Project Cost</td><td class="num"></td>'; tb.appendChild(sr); }
        if (sr.lastChild.textContent !== sh) sr.lastChild.textContent = sh; } }
    var ss = slot('sources'), cc = ss && ss.querySelector('.chart-card'); if (cc) ensureHead(cc, 'Sources', window.__BU_srcTotS || null);
    var cf = slot('cfYear'), c1 = cf && cf.querySelector('.chart-card'); if (c1) ensureHead(c1, 'Cash Flow by Year', null);
    var co = slot('coc'), c2 = co && co.querySelector('.chart-card'); if (c2) ensureHead(c2, 'Cash on Cash', null);
  }
  function paintOpexChart() {
    var s = slot('opexChart'); if (!s) return;
    var inp = B.loadInputs(), R = B.computeReturns(inp, B.compute(inp));
    var NAMES = { taxes: 'Property taxes', insurance: 'Insurance', utilities: 'Electricity', management: 'Management' };
    var items = ['taxes', 'insurance', 'utilities', 'management'].map(function (k) { var l = (R.opexLines || []).filter(function (x) { return x.key === k; })[0]; return { k: k, l: NAMES[k], v: l && l.value != null ? +l.value : null, basis: l && l.basis }; });
    var tot = items.reduce(function (a, b) { return a + (b.v || 0); }, 0);
    var card = s.querySelector('.bu-ox'); if (!card) { s.innerHTML = '<div class="chart-card bu-ox"><div class="bu-ch"><span class="bu-ch-t">Operating Expenses · annual</span><b class="bu-ch-v" id="buOxTot"></b></div><div class="bu-ox-plot"></div></div>'; card = s.firstChild; }
    var plot = card.querySelector('.bu-ox-plot'), W = Math.max(240, Math.floor(plot.clientWidth || 500)), H = Math.max(200, Math.floor(plot.clientHeight || 240)), pl = 52, pr = 12, pt = 24, pb = 32; /* same frame as the Rent and value charts */
    var raw = Math.max.apply(null, items.map(function (d) { return d.v || 0; }).concat([1])), nt = stableMax(s, raw), max = nt.max, iw = W - pl - pr, ih = H - pt - pb, gap = iw / items.length, bw = Math.min(64, gap * 0.56);
    var fills = ['#359BC5', '#6CC0E0', '#A9DCEF', '#D6EEF7'], fmt = window.BUTickFmt || function (v) { return '$' + Math.round(v); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Annual operating expenses">';
    for (var tv = 0; tv <= max + 1e-6; tv += nt.step) { var yy = pt + ih * (1 - tv / max); svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy.toFixed(2) + '" y2="' + yy.toFixed(2) + '" stroke="rgba(255,255,255,.07)"/><text x="' + (pl - 6) + '" y="' + (yy + 4).toFixed(2) + '" text-anchor="end" class="bu-wf-tick">' + fmt(tv) + '</text>'; }
    items.forEach(function (d, i) { var v = d.v || 0, bh = v / max * ih, x = pl + gap * i + (gap - bw) / 2, y = pt + ih - bh, cx = pl + gap * i + gap / 2;
      svg += '<g class="bu-wf-bar"><rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + Math.max(0, bh).toFixed(2) + '" rx="4" fill="' + fills[i] + '"><title>' + esc(d.l) + ': ' + money0(d.v) + '</title></rect>' +
        '<text x="' + cx.toFixed(2) + '" y="' + (y - 7).toFixed(2) + '" text-anchor="middle" class="bu-wf-val">' + (d.v == null ? '—' : money0(d.v)) + '</text>' +
        '<text x="' + cx.toFixed(2) + '" y="' + (H - 14) + '" text-anchor="middle" class="bu-wf-lab">' + esc(gap < 78 && d.k === 'taxes' ? 'Taxes' : gap < 78 && d.k === 'utilities' ? 'Electric' : gap < 78 && d.k === 'management' ? 'Mgmt' : d.l) + '</text></g>'; });
    svg += '</svg>';
    var shape = W + 'x' + H + '|' + max, old = plot.querySelector('svg');
    if (old && plot.dataset.shape === shape) morphSvg(old, svg); else { if (old) card.classList.add('bu-nogrow'); plot.dataset.shape = shape; plot.innerHTML = svg; }
    $('#buOxTot').textContent = money0(tot);
    /* owner Nov 11 13:32: management note removed (display only; rate stays in the inputs) */
  }
  /* generic: left input card and right column end at the same height; the flex card absorbs the difference */
  function eqPair(stepId, fillSel, minW) {
    var row = document.querySelector('#buStep-' + stepId + ' .bu-pair'); if (!row) return;
    var inC = row.querySelector('.bu-pair-in'), outC = row.querySelector('.bu-pair-out'), fill = row.querySelector(fillSel);
    if (!inC || !outC || !fill) return;
    if (!row._ro && window.ResizeObserver) { row._ro = new ResizeObserver(function () { requestAnimationFrame(function () { eqPair(stepId, fillSel, minW); }); }); row._ro.observe(inC); row._ro.observe(outC); }
    var exO = fill._ex || 0, exI = inC._ex || 0;
    if (window.innerWidth < minW) { if (exO || exI) { fill._ex = inC._ex = 0; fill.style.minHeight = ''; inC.style.minHeight = ''; } return; }
    var hi = inC.getBoundingClientRect().height - exI, ho = outC.getBoundingClientRect().height - exO;
    var nO = Math.max(0, hi - ho), nI = Math.max(0, ho - hi);
    if (Math.abs(nO - exO) > 0.5) { fill._ex = nO; fill.style.minHeight = nO ? (fill.getBoundingClientRect().height - exO + nO) + 'px' : ''; }
    if (Math.abs(nI - exI) > 0.5) { inC._ex = nI; inC.style.minHeight = nI ? (hi + nI) + 'px' : ''; }
  }
  /* Step 5: Cash Flow by Year + Cash on Cash fill the Underwriting Assumptions height (charts redrawn taller, same design) */
  var finCh = 0, finT;
  function eqFin() {
    var row = document.querySelector('#buStep-fin .bu-pair'); if (!row) return;
    var inC = row.querySelector('.bu-pair-in'), a = slot('cfYear'), b = slot('coc'); if (!inC || !a || !b) return;
    var ca = a.querySelector('.chart-card'), cb = b.querySelector('.chart-card'), sa = a.querySelector('.chart-slot,[data-core-chart]'), sb = b.querySelector('.chart-slot,[data-core-chart]');
    if (!ca || !cb || !sa || !sb) return;
    if (!row._ro && window.ResizeObserver) { row._ro = new ResizeObserver(function () { requestAnimationFrame(eqFin); }); row._ro.observe(inC); }
    var want = 0;
    if (window.innerWidth >= 901) {
      var hUW = inC.getBoundingClientRect().height, gap = parseFloat(getComputedStyle(row.querySelector('.bu-pair-out')).rowGap) || 20;
      var chrome = ca.getBoundingClientRect().height - sa.getBoundingClientRect().height; /* card padding + title outside the chart slot */
      want = Math.max(220, Math.round(((hUW - gap) / 2 - chrome) * 100) / 100);
    }
    if (Math.abs(want - finCh) < 0.5) return;
    finCh = want;
    if (want) document.documentElement.style.setProperty('--bu-fin-ch', want + 'px'); else document.documentElement.style.removeProperty('--bu-fin-ch');
    clearTimeout(finT); finT = setTimeout(function () { if (window.modRecalc) window.modRecalc(); }, 60); /* redraw the two charts at the new height (same chart code) */
  }

  /* ---------------- stable chart frame helpers (owner Nov 11 12:45: charts must not jump) ---------------- */
  /* y-axis max is sticky per slot: rescale only when values exceed it (with headroom) or fall below 40% of it */
  function stableMax(s, raw) {
    var nice = window.BUNiceTicks || function (m) { return { max: m * 1.1, step: m * 1.1 / 4 }; };
    var cur = s._yMax;
    if (cur && raw <= cur.max && raw >= cur.max * 0.3) return cur;
    var nt = nice(raw * (cur ? 1.25 : 1.08)); s._yMax = nt; return nt; /* first paint: tight; on overflow: extra headroom so a drag rescales at most once */
  }
  /* morph old SVG to new markup of identical structure: numeric geometry tweens, text updates in place */
  var MORPH_ATTR = ['x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2'];
  function morphSvg(oldSvg, markup) {
    var tmp = document.createElement('div'); tmp.innerHTML = markup; var nu = tmp.querySelector('svg'); if (!nu) return;
    var a = oldSvg.querySelectorAll('*'), b = nu.querySelectorAll('*');
    if (a.length !== b.length) { oldSvg.parentNode.replaceChild(nu, oldSvg); return; }
    var tw = [];
    for (var i = 0; i < a.length; i++) {
      var o = a[i], n = b[i];
      if (o.tagName !== n.tagName) { oldSvg.parentNode.replaceChild(nu, oldSvg); return; }
      MORPH_ATTR.forEach(function (k) { if (!n.hasAttribute(k)) return; var f = parseFloat(o.getAttribute(k)), t = parseFloat(n.getAttribute(k)); if (isFinite(f) && isFinite(t) && f !== t) tw.push([o, k, f, t]); else if (o.getAttribute(k) !== n.getAttribute(k)) o.setAttribute(k, n.getAttribute(k)); });
      if (n.hasAttribute('transform') && o.getAttribute('transform') !== n.getAttribute('transform')) o.setAttribute('transform', n.getAttribute('transform'));
      if (n.hasAttribute('fill') && o.getAttribute('fill') !== n.getAttribute('fill')) o.setAttribute('fill', n.getAttribute('fill'));
      if ((o.tagName === 'text' || o.tagName === 'title') && o.textContent !== n.textContent) o.textContent = n.textContent;
    }
    var id = (oldSvg._tw || 0) + 1; oldSvg._tw = id;
    if (!tw.length) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, D = reduce ? 0 : 220, t0 = performance.now();
    (function step(now) {
      if (oldSvg._tw !== id) return; /* a newer update took over from the current positions */
      var p = D ? Math.min(1, (now - t0) / D) : 1, e = 1 - Math.pow(1 - p, 3);
      tw.forEach(function (q) { q[0].setAttribute(q[1], (q[2] + (q[3] - q[2]) * e).toFixed(2)); });
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------------- Five-Year Rent and Sale: persistent frame (replaces the per-render redraw in this slot) ---------------- */
  function paintRentSale() {
    var s = slot('rentProj'); if (!s) return;
    var data = window.__BU_rentSaleBars; if (!data || !data.length) return;
    var card = s.querySelector('.bu-rs'); if (!card) { s.innerHTML = '<div class="chart-card bu-rs"><div class="bu-rs-plot"></div></div>'; card = s.firstChild; }
    var lastL = String(data[data.length - 1][0]), hy = (/(\d+)/.exec(lastL) || [])[1] || (data.length - 1), WORD = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
    var rsTitle = (WORD[+hy] || hy) + '-Year Rent and Sale'; ensureHead(card, rsTitle, null); /* owner Nov 11: title follows the hold period */
    var plotEl = card.querySelector('.bu-rs-plot'); if (!plotEl) { plotEl = document.createElement('div'); plotEl.className = 'bu-rs-plot'; card.appendChild(plotEl); }
    var wfS = slot('waterfall'), W = Math.max(240, Math.floor((s.clientWidth || 556) - 44)), H = 250, pl = 52, pr = 12, pt = 24, pb = (wfS && wfS._pb) || 32;
    var raw = Math.max.apply(null, data.map(function (d) { return +d[1] || 0; }).concat([1]));
    var nt = stableMax(s, raw), max = nt.max, iw = W - pl - pr, ih = H - pt - pb, gap = iw / data.length, bw = Math.max(12, Math.min(44, gap * 0.58));
    var fills = ['#247A9C', '#359BC5', '#4FB3DC', '#6CC0E0', '#A9DCEF'];
    /* one label format for every bar: full ('Year 1 … End Year 5 Sale') if all fit, else 'Y1 … Y5 Sale', else 'Y1 … Sale' */
    var T0 = data.map(function (d) { return String(d[0]); }),
      T1 = T0.map(function (l) { return l.replace(/^End Year (\d+) Sale$/, 'Y$1 Sale').replace(/^Year\s*(\d+)$/, 'Y$1'); }),
      T2 = T1.map(function (l) { return l.replace(/^Y\d+ Sale$/, 'Sale'); });
    var fits = function (L) { return L.every(function (l) { return l.length * 6.6 <= gap - 6; }); };
    var labs = fits(T0) ? T0 : fits(T1) ? T1 : T2;
    if (!fits(T2)) { var n = T2.length; labs = T2.map(function (l, i) { return (n - 1 - i) % 2 === 0 ? l : ''; }); } /* too tight: every other label, anchored on the last bar */
    var labY = pb > 32 ? H - pb + 18 : H - 14;
    var fmt = window.BUTickFmt || function (v) { return '$' + Math.round(v); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + rsTitle + '">';
    for (var tv = 0; tv <= max + 1e-6; tv += nt.step) { var yy = pt + ih * (1 - tv / max); svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy.toFixed(2) + '" y2="' + yy.toFixed(2) + '" stroke="rgba(255,255,255,.07)"/><text x="' + (pl - 6) + '" y="' + (yy + 4).toFixed(2) + '" text-anchor="end" class="bu-wf-tick">' + fmt(tv) + '</text>'; }
    data.forEach(function (d, i) {
      var v = +d[1] || 0, bh = Math.max(0, v / max * ih), x = pl + gap * i + (gap - bw) / 2, y = pt + ih - bh, lab = labs[i];
      svg += '<g class="bu-wf-bar"><rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + bh.toFixed(2) + '" rx="3" fill="' + (i === data.length - 1 ? '#247A9C' : fills[i % fills.length]) + '"><title>' + esc(String(d[0])) + ': ' + money0(v) + '</title></rect>' +
        '<text x="' + (pl + gap * i + gap / 2).toFixed(2) + '" y="' + labY + '" text-anchor="middle" class="bu-wf-lab">' + esc(lab) + '</text></g>';
    });
    svg += '</svg>';
    var shape = W + '|' + max + '|' + pb + '|' + labs.join(',');
    var old = plotEl.querySelector('svg');
    if (old && card.dataset.shape === shape) { morphSvg(old, svg); return; }
    if (old) card.classList.add('bu-nogrow');
    card.dataset.shape = shape; plotEl.innerHTML = svg;
  }

  /* ---------------- NOI build-up waterfall (new chart; values from computeReturns only) ---------------- */
  function paintWaterfall() {
    var s = slot('waterfall'); if (!s) return;
    var inp = B.loadInputs(), r = B.compute(inp), R = B.computeReturns(inp, r);
    var steps = [];
    if (R.grossAnnualRent == null) { s.innerHTML = '<div class="chart-card bu-wf"><h3>NOI Build-Up</h3><div class="bu-muted">Needs rent, rent basis and vacancy.</div></div>'; return; }
    steps.push({ l: 'Gross rent', v: R.grossAnnualRent, t: 'start' });
    if (R.vacancyLoss != null) steps.push({ l: 'Vacancy', v: -R.vacancyLoss });
    var OPL = { taxes: 'Taxes', insurance: 'Insurance', utilities: 'Electricity', management: 'Maint. & mgmt' };
    ['taxes', 'insurance', 'utilities', 'management'].forEach(function (k) { (R.opexLines || []).forEach(function (l) { if (l.key === k && l.value != null && !(k === 'utilities' && inp.utilitiesMode === 'tenant')) steps.push({ l: OPL[k], v: -l.value }); }); });
    steps.push({ l: 'NOI', v: R.noi, t: 'end' });
    var W = Math.max(240, Math.floor((s.clientWidth || 556) - 44)), H = 250, pl = 52, pr = 12, pt = 24, pb = 32; /* W = card content width so the SVG renders 1:1 (no scaling), matching the Five-Year chart */
    var rot = false; s._pb = pb; /* no rotated labels: narrow cards use short horizontal labels so every chart shares the same baseline */ /* rotated labels need a taller band; the Five-Year chart copies pb so baselines align */
    var run = 0, bars = [], max = 0;
    steps.forEach(function (d) { var a, b; if (d.t === 'start') { a = 0; b = d.v; run = d.v; } else if (d.t === 'end') { a = 0; b = d.v; } else { a = run; b = run + d.v; run = b; } bars.push({ d: d, a: a, b: b }); max = Math.max(max, a, b); });
    max = max || 1; var nt = stableMax(s, max); max = nt.max; var bw = (W - pl - pr) / bars.length, y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="NOI build-up waterfall">';
    for (var tv = 0; tv <= max + 1e-6; tv += nt.step) { var yy = y(tv); svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" stroke="rgba(255,255,255,.07)"/><text x="' + (pl - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="bu-wf-tick">' + (window.BUTickFmt ? window.BUTickFmt(tv) : '$' + Math.round(tv)) + '</text>'; }
    bars.forEach(function (o, i) {
      var x = pl + i * bw + bw * .16, w = bw * .68, y0 = y(Math.max(o.a, o.b)), h = Math.max(1.5, Math.abs(y(o.a) - y(o.b)));
      var fill = o.d.t === 'start' ? '#359BC5' : o.d.t === 'end' ? '#A9DCEF' : '#1F5D78';
      svg += '<g class="bu-wf-bar" style="animation-delay:' + (i * 40) + 'ms"><rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '"><title>' + esc(o.d.l) + ': ' + money0(o.d.v) + '</title></rect>';
      if (bw >= 40) svg += '<text x="' + (x + w / 2) + '" y="' + (y0 - 6) + '" text-anchor="middle" class="bu-wf-val">' + (Math.abs(o.d.v) >= 1000 ? (o.d.v < 0 ? '-' : '') + '$' + (Math.abs(o.d.v) / 1000).toFixed(1) + 'k' : money0(o.d.v)) + '</text>';
      var SH = { 'Gross rent': 'Gross', 'Insurance': 'Insur.', 'Electricity': 'Elec.', 'Maint. & mgmt': 'Mgmt' }, XS = { 'Gross rent': 'Gross', 'Vacancy': 'Vac.', 'Insurance': 'Ins.', 'Electricity': 'Elec.', 'Maint. & mgmt': 'Mgmt' }, lab = bw < 48 ? (XS[o.d.l] || o.d.l) : bw < 64 ? (SH[o.d.l] || o.d.l) : o.d.l;
      var lx = x + w / 2, ly = H - 14;
      var ry = H - pb + 13; svg += rot ? '<text x="' + lx + '" y="' + ry + '" text-anchor="end" transform="rotate(-38 ' + lx + ' ' + ry + ')" class="bu-wf-lab">' + esc(lab) + '</text></g>' : '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" class="bu-wf-lab' + (bw < 48 ? ' xs' : '') + '">' + esc(lab) + '</text></g>';
      if (i < bars.length - 1 && o.d.t !== 'end') { var nx = pl + (i + 1) * bw + bw * .16, yy2 = y(o.b); svg += '<line x1="' + (x + w) + '" x2="' + nx + '" y1="' + yy2 + '" y2="' + yy2 + '" stroke="rgba(169,220,239,.35)" stroke-dasharray="3 3"/>'; }
    });
    svg += '</svg>';
    var sig = JSON.stringify(steps.map(function (d) { return Math.round(d.v); }));
    var wfc = s.querySelector('.bu-wf'); if (wfc) ensureHead(wfc, 'NOI Build-Up', money0(R.noi));
    if (s.dataset.sig === sig && s.dataset.w == W && s.querySelector('svg')) return;
    var shape = W + '|' + max + '|' + steps.map(function (d) { return d.l; }).join(',');
    s.dataset.sig = sig; s.dataset.w = W;
    var old = s.querySelector('.bu-wf svg');
    if (old && s.dataset.shape === shape) { morphSvg(old, svg); return; } /* same frame: tween bars, labels and connectors in place */
    s.dataset.shape = shape;
    var first = !old;
    s.innerHTML = '<div class="chart-card bu-wf' + (first ? '' : ' bu-nogrow') + '">' + cardHead('NOI Build-Up', money0(R.noi)) + svg + '</div>';
  }

  /* ---------------- hero levers <-> existing inputs (inpUnits / inpArea; rows unchanged) ---------------- */
  function bindLever(numId, rngId, realId, minR, maxR) {
    var num = document.getElementById(numId), rng = document.getElementById(rngId), real = document.getElementById(realId);
    if (!num || !rng || !real) return;
    function fromReal() { if (document.activeElement === num) return; var v = real.value; num.value = v; if (v !== '') { rng.max = maxR; rng.value = Math.min(Math.max(+v || minR, minR), maxR); } }
    function push(v) { real.value = v; real.dispatchEvent(new Event('input', { bubbles: true })); real.dispatchEvent(new Event('change', { bubbles: true })); markTouched(realId); }
    function clampNum() {
      if (num.value === '') return;
      var v = +num.value;
      if (!isFinite(v)) { num.value = ''; return; }
      v = Math.min(Math.max(Math.round(v), minR), maxR);
      if (+num.value !== v) num.value = v;
      rng.max = maxR; rng.value = v; push(v);
    }
    num.addEventListener('input', function () { if (num.value !== '') { var v = +num.value; rng.max = maxR; rng.value = isFinite(v) ? Math.min(Math.max(v, minR), maxR) : minR; } if (num.value !== '' && isFinite(+num.value) && +num.value >= minR && +num.value <= maxR) push(num.value); });
    num.addEventListener('blur', clampNum);
    num.addEventListener('change', clampNum);
    rng.addEventListener('input', function () { num.value = rng.value; push(rng.value); });
    real.addEventListener('input', fromReal);
    return fromReal;
  }
  var syncU = bindLever('buUnits', 'buUnitsR', 'inpUnits', 1, 20), syncA = bindLever('buArea', 'buAreaR', 'inpArea', 400, 4000);
  var _apply = B.applyInputsToDom;
  B.applyInputsToDom = function () { var r = _apply.apply(this, arguments); try { syncU && syncU(); syncA && syncA(); syncSliders(); paintTags(); } catch (e) { } return r; };

  /* ---------------- synced slider on every numeric input in the steps + Estimate tags ---------------- */
  var RANGE = { inpUnits: [1, 20, 1], inpArea: [400, 4000, 10], inpFactoryRate: [40, 250, 1], cLand: [0, 250000, 500], cPermit: [0, 60000, 100], cClear: [0, 40000, 100], cWater: [0, 20000, 100], cPower: [0, 30000, 100], cLandscape: [0, 30000, 100], cFoundation: [0, 80000, 100], cDrive: [0, 40000, 100], inpRent: [0, 8000, 25], inpCapRate: [3, 12, .05], inpOpexTaxes: [0, 20000, 25], inpOpexInsurance: [0, 15000, 25], inpOpexUtilities: [0, 15000, 25], inpOpexPct: [0, 30, .5], inpVacancy: [0, 30, .5], inpALtv: [0, 100, 1], inpARate: [0, 20, .05], inpBConstRate: [0, 20, .05], inpPermRate: [0, 15, .05], inpBLtv: [0, 100, 1], inpSellCost: [0, 12, .25], inpHoldYears: [1, 30, 1] };
  var sliders = {};
  Object.keys(RANGE).forEach(function (id) {
    var inp = document.getElementById(id); if (!inp || !inp.closest('.bu-steps')) return;
    var cfg = RANGE[id], cell = inp.closest('td') || inp.parentNode;
    var r = el('input', { type: 'range', class: 'bu-range', min: cfg[0], max: cfg[1], step: cfg[2], 'aria-label': ((inp.closest('tr') || {}).textContent || id).trim() + ' slider', 'data-for': id });
    cell.appendChild(r); sliders[id] = r;
    r.addEventListener('input', function () { inp.value = r.value; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); markTouched(id); });
    inp.addEventListener('input', function (e) { if (e.isTrusted) markTouched(id); syncSlider(id); });
    inp.addEventListener('blur', function () { clampInput(id); });
    inp.addEventListener('change', function () { clampInput(id); });
  });
  /* Generous hard caps (wider than the slider) so unusual-but-real deals still compute; only non-finite or absurd values are pulled back. Slider thumbs never extend past RANGE max. */
  var HARD = { inpUnits: [1, 20], inpArea: [400, 4000], inpFactoryRate: [1, 1000], cLand: [0, 1e8], cPermit: [0, 1e8], cClear: [0, 1e8], cWater: [0, 1e8], cPower: [0, 1e8], cLandscape: [0, 1e8], cFoundation: [0, 1e8], cDrive: [0, 1e8], inpRent: [0, 1e6], inpCapRate: [0, 50], inpOpexTaxes: [0, 1e8], inpOpexInsurance: [0, 1e8], inpOpexUtilities: [0, 1e8], inpOpexPct: [0, 100], inpVacancy: [0, 100], inpALtv: [0, 100], inpARate: [0, 50], inpBConstRate: [0, 50], inpPermRate: [0, 50], inpBLtv: [0, 100], inpSellCost: [0, 50], inpHoldYears: [1, 30] };
  function clampInput(id) {
    var inp = document.getElementById(id), lim = HARD[id]; if (!inp || !lim) return;
    var raw = inp.value; if (raw === '' || raw == null) return;
    var v = +raw;
    if (!isFinite(v)) {
      var prev = (B.loadInputs() || {})[({ inpUnits: 'units', inpArea: 'area', inpFactoryRate: 'factoryRatePsf', cLand: 'land', cPermit: 'permit', cClear: 'clear', cWater: 'water', cPower: 'power', cLandscape: 'landscape', cFoundation: 'foundation', cDrive: 'drive', inpRent: 'rent', inpCapRate: 'exitCapPct', inpOpexTaxes: 'opexTaxes', inpOpexInsurance: 'opexInsurance', inpOpexUtilities: 'opexUtilities', inpOpexPct: 'maintenanceManagementPct', inpVacancy: 'vacancyPct', inpALtv: 'aLtvPct', inpARate: 'finRateA', inpBConstRate: 'finRateB', inpPermRate: 'permLoanRate', inpBLtv: 'bLtvPct', inpSellCost: 'sellCostPct', inpHoldYears: 'holdYears' })[id]];
      inp.value = (prev != null && isFinite(+prev)) ? prev : '';
      return;
    }
    var c = Math.min(Math.max(v, lim[0]), lim[1]);
    if (id === 'inpUnits' || id === 'inpHoldYears') c = Math.round(c);
    if (c !== v) { inp.value = c; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    syncSlider(id);
  }
  function syncSlider(id) { var r = sliders[id], inp = document.getElementById(id); if (!r || !inp) return; var v = +inp.value; if (inp.value === '' || !isFinite(v)) return; var cap = RANGE[id] ? RANGE[id][1] : +r.max; r.max = cap; r.min = RANGE[id] ? RANGE[id][0] : r.min; r.value = Math.min(Math.max(v, +r.min), cap); }
  function syncSliders() { Object.keys(sliders).forEach(syncSlider); }
  function markTouched(id) { if (!S.touched[id]) { S.touched[id] = 1; save(); paintTags(); } var st = (document.getElementById(id) || document.body).closest('.bu-step'); if (st) markDone(st.dataset.step); }
  /* Estimate tag: every pre-filled value is one of our estimates/defaults until the visitor changes it */
  function paintTags() {
    Object.keys(RANGE).concat(['inpRentBasis']).forEach(function (id) {
      var inp = document.getElementById(id); if (!inp) return; var tr = inp.closest('tr'); if (!tr) return;
      var lab = tr.querySelector('td:first-child'); if (!lab) return;
      var tag = lab.querySelector('.bu-est');
      var est = !S.touched[id] && inp.value !== '';
      if (est && !tag) { tag = el('span', { class: 'bu-est', title: 'Pre-filled estimate — change it to use your own number' }, 'Estimate'); lab.appendChild(tag); }
      if (!est && tag) tag.remove();
    });
  }

  /* ---------------- collapsible Permitting and Site Costs ---------------- */
  (function () {
    if (!siteSec) return;
    var thead = siteSec.querySelector('thead'), th = thead && thead.querySelectorAll('th');
    if (!th || th.length < 2) return;
    /* owner Nov 11 12:44: always expanded, no toggle (accordion removed) */
    siteSec.classList.add('bu-site-open');
    th[1].innerHTML = '<span class="bu-acc-total" id="buSiteTotal"></span>';
    var tb = siteSec.querySelector('tbody'); tb.id = 'siteCostBody';
    siteSec.addEventListener('input', function () { markDone('site'); });
  })();
  function paintSiteTotal() {
    var t = $('#buSiteTotal'); if (!t) return;
    var r = B.compute(B.loadInputs()), s = 0, miss = 0;
    r.costLines.forEach(function (l) { if (l.section === 'site') { if (l.value == null) miss++; else s += l.value; } });
    t.textContent = money0(s) + (miss ? ' · ' + miss + ' missing' : '');
  }

  /* ---------------- % sits right after the number (display only: the field box is the wrapper, the input sizes to its value) ---------------- */
  var pctMirror = null;
  function sizePct(inp) { if (!inp) return; var v = String(inp.value == null ? '' : inp.value) || '0';
    try {
      if (!pctMirror) { pctMirror = document.createElement('span'); pctMirror.setAttribute('aria-hidden', 'true'); pctMirror.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden;padding:0;border:0'; document.body.appendChild(pctMirror); }
      var cs = getComputedStyle(inp); ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'fontVariantNumeric'].forEach(function (k) { pctMirror.style.setProperty(k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), cs[k], 'important'); });
      pctMirror.textContent = v; inp.style.setProperty('width', Math.max(8, Math.ceil(pctMirror.getBoundingClientRect().width) + 1) + 'px', 'important');
    } catch (e) { inp.style.setProperty('width', Math.max(1.6, v.length + 0.6) + 'ch', 'important'); } }
  function sizeAllPct() { $$('.pct-wrap > input').forEach(sizePct); }
  document.addEventListener('input', function (e) { if (e.target && e.target.parentNode && e.target.parentNode.classList && e.target.parentNode.classList.contains('pct-wrap')) sizePct(e.target); }, true);
  document.addEventListener('change', function (e) { if (e.target && e.target.parentNode && e.target.parentNode.classList && e.target.parentNode.classList.contains('pct-wrap')) sizePct(e.target); }, true);
  document.addEventListener('click', function (e) { var w = e.target && e.target.closest && e.target.closest('.pct-wrap'); if (w && e.target === w) { var i = w.querySelector('input'); if (i) i.focus(); } });
  var _apply2 = B.applyInputsToDom; B.applyInputsToDom = function () { var r = _apply2.apply(this, arguments); try { sizeAllPct(); } catch (e) { } return r; };
  (function () { /* Selling costs is a percent field with no % suffix: wrap it like the others (display only) */
    var sc = document.getElementById('inpSellCost');
    if (sc && !(sc.parentNode.classList && sc.parentNode.classList.contains('pct-wrap'))) { var w = el('span', { class: 'pct-wrap' }); sc.parentNode.insertBefore(w, sc); w.appendChild(sc); w.appendChild(el('span', { class: 'pct-suffix', 'aria-hidden': 'true' }, '%')); }
  })();
  sizeAllPct(); setTimeout(sizeAllPct, 300); setTimeout(sizeAllPct, 1500);

  /* ---------------- factory rate reset + land assessed note ---------------- */
  (function () { /* hero project card: factory rate proxy -> the single source field #inpFactoryRate */
    var fi = document.getElementById('buFacRate'), fb = document.getElementById('buFacReset'), fr = document.getElementById('inpFactoryRate');
    if (!fi || !fr) return;
    function push(v) { fr.value = v; fr.dispatchEvent(new Event('input', { bubbles: true })); fr.dispatchEvent(new Event('change', { bubbles: true })); }
    fi.addEventListener('input', function () { var c = clean(fi.value); var caret = fi.value.length - fi.selectionStart; fi.value = c === '' ? '' : '$' + c; try { fi.setSelectionRange(fi.value.length - caret, fi.value.length - caret); } catch (e) { } });
    fi.addEventListener('change', function () { var c = clean(fi.value); if (c === '' || !(+c > 0) || !isFinite(+c)) { fi.value = '$' + (fr.value || 90); return; } var v = Math.min(Math.max(+c, 1), 1000); fi.value = '$' + v; push(v); markTouched('inpFactoryRate'); });
    fi.addEventListener('keydown', function (e) { if (e.key === 'Enter') fi.blur(); });
    if (fb) fb.addEventListener('click', function () { push(90); delete S.touched.inpFactoryRate; save(); paintTags(); });
  })();
  (function () {
    var fr = document.getElementById('inpFactoryRate');
    if (fr) { var a = el('button', { type: 'button', class: 'bu-link', id: 'buFactoryReset' }, 'Reset to $90/sf'); fr.closest('td').appendChild(a); a.addEventListener('click', function () { fr.value = 90; fr.dispatchEvent(new Event('input', { bubbles: true })); delete S.touched.inpFactoryRate; save(); paintTags(); }); }
    var cl = document.getElementById('cLand');
    if (cl) {
      var n = el('span', { class: 'bu-land-note', id: 'buLandNote', 'data-keep-parens': '1' }); cl.closest('td').appendChild(n);
      cl.addEventListener('input', function (e) { if (e.isTrusted) { S.auto.landUser = true; save(); paintLandNote(); } });
    }
  })();
  function paintLandNote() {
    var n = $('#buLandNote'); if (!n) return; var L = S.land;
    if (!S.site) { n.innerHTML = ''; return; }
    if (L && L.ok) n.innerHTML = 'Assessed land value (county records, tax year ' + esc(L.taxYear || '—') + '): ' + money0(L.value) + (S.auto.landUser ? ' · <button type="button" class="bu-link" id="buLandReset">Reset to assessed</button>' : '');
    else n.innerHTML = 'Assessed value not available here — enter land cost';
    var rb = $('#buLandReset'); if (rb) rb.addEventListener('click', function () { S.auto.landUser = false; save(); applyLand(true); });
  }

  /* ---------------- data ---------------- */
  var DATA = {};
  function getJSON(u, ms) {
    ms = ms == null ? 8000 : ms;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) try { ctl.abort(); } catch (e) { } }, ms);
    return fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json();
    }).catch(function (e) { clearTimeout(t); throw e; });
  }
  var dataReady = Promise.all([
    getJSON("data/factories.json?v=20261111d").then(function (j) { DATA.factories = j.factories; DATA.factMeta = j; }).catch(function () { DATA.factories = []; }),
    getJSON('data/county-list-psf.json').then(function (j) { DATA.psf = j; }).catch(function () { DATA.psf = null; }),
    getJSON('data/crane-40t-rates.json').then(function (j) { DATA.crane = j; }).catch(function () { DATA.crane = null; })
  ]);

  /* ---------------- providers ---------------- */
  function hav(a, b) { var R = 3958.8, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  var Geocoders = {
    /* street addresses: exact match from the US Census Geocoder (via our function); anything it can't place (city or ZIP only) falls back to Photon */
    census: function (q) {
      return getJSON('https://bespokeunderwriting.com/.netlify/functions/geocode?q=' + encodeURIComponent(q)).then(function (j) {
        var m = j && j.ok && j.matches && j.matches[0]; if (!m) return Geocoders.photon(q);
        var t = function (x) { return String(x).toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }, parts = m.match.split(',').map(function (x) { return x.trim(); });
        var match = parts.length >= 4 ? t(parts[0]) + ', ' + t(parts[1]) + ', ' + parts[2] + ' ' + parts[3] : m.match;
        return { lat: m.lat, lng: m.lng, state: m.state, county: '', label: q, match: match };
      }, function () { return Geocoders.photon(q); });
    },
    photon: function (q) {
      /* owner Nov 11: bias to the US Southeast (Carolinas center) and take the best US match, not just the first hit */
      var hasZip = /\b\d{5}\b/.test(q), hasSt = /,\s*[A-Za-z]{2}\b|\b(south|north) carolina\b|\bgeorgia\b|\bvirginia\b|\btennessee\b/i.test(q);
      var bias = '&lat=34.6&lon=-81.0' + (hasZip || hasSt ? '' : '&location_bias_scale=0.1&zoom=6');
      return getJSON('https://photon.komoot.io/api/?limit=8&lang=en' + bias + '&q=' + encodeURIComponent(q)).then(function (j) {
        /* score US candidates: house number, ZIP and state from the query win over the first hit (Photon often ranks landmarks first) */
        var ST = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', VI: 'Virgin Islands', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
        var qn = (/^\s*(\d+[a-z]?)\s/i.exec(q) || [])[1], qz = (/\b(\d{5})\b/.exec(q) || [])[1], qs = (/,\s*([A-Za-z]{2})\b(?:\s+\d{5})?\s*$/.exec(q) || [])[1];
        var qsName = qs ? ST[qs.toUpperCase()] : null, qStreet = q.replace(/^\s*\d+[a-z]?\s+/i, '').split(',')[0].toLowerCase().replace(/\b(n|s|e|w)\b\.?/g, '').replace(/\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|hwy|highway)\b\.?/g, '').replace(/\s+/g, ' ').trim();
        var us = (j.features || []).filter(function (f) { var cc = f.properties && String(f.properties.countrycode || '').toUpperCase(); return cc === 'US' || cc === 'PR' || cc === 'VI' || cc === 'GU' || cc === 'AS' || cc === 'MP'; });
        us.forEach(function (f, i) { var p = f.properties, sc = -i * 0.1, st = String(p.street || p.name || '').toLowerCase();
          if (qn && String(p.housenumber || '').toLowerCase() === qn.toLowerCase()) sc += 4;
          if (qz && p.postcode && String(p.postcode).slice(0, 5) === qz) sc += 3;
          if (qsName && p.state === qsName) sc += 3; else if (qsName && p.state) sc -= 3;
          if (qStreet && st && st.indexOf(qStreet) >= 0) sc += 2;
          if (qn && p.osm_key && p.osm_key !== 'place' && p.osm_key !== 'highway' && p.osm_key !== 'building' && !p.housenumber) sc -= 2; /* landmark instead of the street address */
          f._s = sc; });
        var f = us.sort(function (a, b) { return b._s - a._s; })[0];
        if (!f) return null; var p = f.properties, c = f.geometry.coordinates;
        if (qn && !p.housenumber && p.street == null && p.osm_key === 'highway') p.street = p.name; /* matched the street itself: show the street, no house number */
        var street = [p.housenumber, p.street].filter(Boolean).join(' ') || (p.type !== 'city' && p.name !== p.city ? p.name : '');
        var match = [street, p.city || p.town || p.village || p.district || (p.type === 'city' ? p.name : ''), [p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        return { lat: c[1], lng: c[0], state: p.state || '', county: p.county || '', label: q, match: match };
      });
    }
  };
  var Routers = {
    osrm: {
      table: function (site, cands) { var pts = [site].concat(cands).map(function (p) { return p[1] + ',' + p[0]; }).join(';'); return getJSON('https://router.project-osrm.org/table/v1/driving/' + pts + '?sources=0&annotations=distance').then(function (j) { return (j.distances && j.distances[0] || []).slice(1); }); },
      route: function (a, b) { return getJSON('https://router.project-osrm.org/route/v1/driving/' + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=simplified&geometries=geojson').then(function (j) { var r = j.routes && j.routes[0]; if (!r) throw new Error('no route'); return { miles: r.distance / 1609.344, coords: r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) }; }); }
    }
  };
  function countyFips(lat, lng) { return getJSON('https://geo.fcc.gov/api/census/area?format=json&lat=' + lat + '&lon=' + lng).then(function (j) { var r = j.results && j.results[0]; return r ? { fips: r.county_fips, county: r.county_name, state: r.state_code } : null; }); }
  var Maps = {
    leaflet: {
      map: null, layers: null,
      show: function (site, fac, route) {
        var box = $('#buMap'); if (!window.L || !box) return;
        if (!this.map) { box.innerHTML = ''; this.map = L.map(box, { scrollWheelZoom: false, zoomControl: true, preferCanvas: true }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'bu-tiles', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(this.map); /* OSM raster darkened by CSS filter (.bu-tiles); CARTO dark tiles now need an API key */ this.layers = L.layerGroup().addTo(this.map); this.map.attributionControl.setPrefix(box.offsetWidth < 480 ? false : '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>'); /* phones: keep the full OSM credit on one line */ box.classList.add('on'); }
        this.layers.clearLayers();
        L.circleMarker([site.lat, site.lng], { radius: 16, stroke: false, fillColor: '#359BC5', fillOpacity: .18, interactive: false }).addTo(this.layers);
        var sm = L.circleMarker([site.lat, site.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#359BC5', fillOpacity: 1 }).bindTooltip('Your site', { className: 'bu-tip', direction: 'top', offset: [0, -8] }).addTo(this.layers);
        var pts = [[site.lat, site.lng]];
        if (fac) {
          var line = route && route.coords ? route.coords : [[fac.lat, fac.lng], [site.lat, site.lng]], dash = route && route.coords ? null : '6 8';
          L.polyline(line, { color: '#359BC5', weight: 14, opacity: .12, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.layers); /* soft glow */
          L.polyline(line, { color: '#6CC0E0', weight: 8, opacity: .22, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.layers);
          L.polyline(line, { color: '#359BC5', weight: 3.5, opacity: 1, dashArray: dash, lineCap: 'round', lineJoin: 'round' }).addTo(this.layers);
          L.circleMarker([fac.lat, fac.lng], { radius: 7, color: '#359BC5', weight: 3, fillColor: '#171918', fillOpacity: 1 }).bindTooltip(fac.company + ' · ' + fac.city + ', ' + fac.state, { className: 'bu-tip', direction: 'top', offset: [0, -8] }).addTo(this.layers);
          if (fac.miles != null) { var mid = line[Math.floor(line.length / 2)]; L.marker(mid, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'bu-map-pill-wrap', html: '<span class="bu-map-pill"><i></i>' + Math.round(fac.miles).toLocaleString('en-US') + ' mi' + (fac.approx ? ' approx.' : '') + '</span>', iconSize: null }) }).addTo(this.layers); }
          pts = pts.concat(line);
        }
        if (pts.length > 1) this.map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] }); else this.map.setView([site.lat, site.lng], 14);
        var m = this.map; setTimeout(function () { m.invalidateSize(); }, 60);
      }
    }
  };

  /* ---------------- region / crane / transport / land / building cost ---------------- */
  var REGION = { Northeast: 'CT ME MA NH RI VT NJ NY PA', Midwest: 'IL IN MI OH WI IA KS MN MO NE ND SD', South: 'DE FL GA MD NC SC VA DC WV AL KY MS TN AR LA OK TX', West: 'AZ CO ID MT NV NM UT WY AK CA HI OR WA' };
  function censusRegion(st) { for (var k in REGION) if ((' ' + REGION[k] + ' ').indexOf(' ' + st + ' ') >= 0) return k; return null; }
  function craneRate(st) { var R = DATA.crane && DATA.crane.regions; if (!R) return null; for (var k in R) if ((R[k].states || []).indexOf(st) >= 0) return { region: k, rate: R[k].day_rate_usd, estimate: !!R[k].estimate, source: R[k].source }; return null; }
  function logiDefaults() {
    var L = S.logi; if (L.rate == null) L.rate = 20; if (L.minTrip == null) L.minTrip = 1500;
    return L;
  }
  function logistics() {
    var inp = B.loadInputs(), r = B.compute(inp), L = logiDefaults();
    var units = Math.max(1, Math.round(+inp.units || 1)), mods = Math.max(1, Math.round(+inp.boxes || 2));
    var trips = units * mods, F = S.factory, miles = F ? F.miles : null;
    var perTrip = miles == null ? null : Math.max(L.rate * miles, L.minTrip);
    var extra = (+L.permits || 0) + (+L.escorts || 0);
    var transport = perTrip == null ? null : Math.round(trips * perTrip + extra);
    var cr = S.site ? craneRate(S.site.state) : null;
    var craneDays = Math.ceil(trips / ((DATA.crane && DATA.crane.assumption_boxes_per_day) || 2));
    var crane = 10000; /* owner Nov 11 12:39: crane and crew flat $10,000 always */
    var width = L.width || (r.geo && r.geo.boxW ? Math.round(r.geo.boxW) : 14);
    return { units: units, mods: mods, trips: trips, miles: miles, perTrip: perTrip, transport: transport, crane: crane, craneDays: craneDays, cr: cr, width: width, oversize: width >= 15, L: L };
  }
  function setSaved(patch) {
    var inp = B.loadInputs(); Object.keys(patch).forEach(function (k) { inp[k] = patch[k]; });
    B.saveInputs(inp); B.applyInputsToDom(B.loadInputs());
    if (window.modRecalc) window.modRecalc();
  }
  function applyAuto() {
    var lg = logistics(), inp = B.loadInputs(), patch = {}, D = B.DEFAULTS;
    var userT = !!S.touched.inpTransport; /* only a hand-typed transport value is kept; every other value follows the address and trip count */
    var userC = S.auto.crane != null && inp.crane !== S.auto.crane && inp.crane !== D.crane;
    if (lg.transport != null && !userT && inp.transport !== lg.transport) { patch.transport = lg.transport; }
    if (lg.transport != null && !userT) S.auto.transport = lg.transport;
    if (inp.crane !== 10000) patch.crane = 10000; /* flat crane and crew; the model line is fixed at $10,000 regardless */
    S.auto.crane = 10000; userC = false;
    if (S.site) { var reg = censusRegion(S.site.state); if (reg && inp.marRegion !== reg) patch.marRegion = reg; }
    if (+inp.boxes !== lg.mods) patch.boxes = lg.mods;
    S.userTransport = userT; S.userCrane = userC; save();
    if (Object.keys(patch).length) setSaved(patch);
  }
  function applyLand(force) {
    var cl = document.getElementById('cLand'); if (!cl) return;
    var L = S.land;
    if (L && L.ok && !(+L.value > 0)) { L.ok = false; L.reason = 'zero-assessed'; } /* a $0 land assessment (exempt or right-of-way parcel) is not a land price */
    if (L && L.ok && (force || !S.auto.landUser)) {
      if (+cl.value !== L.value) { cl.value = L.value; cl.dispatchEvent(new Event('input', { bubbles: true })); }
      S.auto.land = L.value; delete S.touched.cLand;
    } else if (S.auto.land != null && !S.auto.landUser) { /* previous address set land; this one has no assessment: back to the model default */
      var d = B.DEFAULTS && B.DEFAULTS.land != null ? B.DEFAULTS.land : 18000;
      if (+cl.value !== d) { cl.value = d; cl.dispatchEvent(new Event('input', { bubbles: true })); }
      delete S.auto.land;
    }
    save(); paintLandNote(); paintTags();
  }
  var geoSeq = 0, lastQ = null;
  function locate(q, force) {
    q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (q.length < 6 || (!force && q === lastQ)) return; lastQ = q;
    var my = ++geoSeq, st = $('#buRoute');
    st.innerHTML = '<span class="bu-muted">Finding your site…</span>';
    var locateWatch = setTimeout(function () {
      if (my === geoSeq && st && /Finding your site/.test(st.textContent || '')) {
        st.innerHTML = '<span class="bu-muted">Map services are taking longer than expected; the model still runs on its defaults.</span>';
      }
    }, 8000);
    (Geocoders[CFG.geocoder] || Geocoders.photon)(q).then(function (g) {
      if (my !== geoSeq) return;
      if (!g) { clearTimeout(locateWatch); st.innerHTML = '<span class="bu-muted">We couldn’t place that address on the map yet. Pick a suggestion or add city and state.</span>'; return; }
      return Promise.all([dataReady, countyFips(g.lat, g.lng).catch(function () { return null; })]).then(function (res) {
        if (my !== geoSeq) return;
        var c = res[1] || {};
        S.site = { lat: g.lat, lng: g.lng, label: q, match: g.match || q, state: c.state || '', fips: c.fips || '', county: c.county || g.county || '' };
        save();
        Maps[CFG.mapProvider].show(S.site, null, null);
        var site = [g.lat, g.lng], F = (DATA.factories || []).map(function (f) { return { f: f, d: hav(site, [f.lat, f.lng]) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
        var R = Routers[CFG.routeProvider] || Routers.osrm;
        var nearestP = R.table(site, F.map(function (x) { return [x.f.lat, x.f.lng]; })).then(function (dist) {
          var best = null; dist.forEach(function (m, i) { if (m != null && (best == null || m < best.m)) best = { m: m, i: i }; });
          if (!best) throw new Error('no table');
          var f = F[best.i].f; return R.route(site, [f.lat, f.lng]).then(function (rt) { return { f: f, miles: rt.miles, coords: rt.coords, approx: false }; }, function () { return { f: f, miles: best.m / 1609.344, coords: null, approx: false }; });
        }).catch(function () { var f = F[0] && F[0].f; return f ? { f: f, miles: F[0].d * CFG.roadFactor, coords: null, approx: true } : null; });
        var landP = S.site.fips ? getJSON(CFG.parcelEndpoint + '?fips=' + S.site.fips + '&lat=' + g.lat + '&lng=' + g.lng).catch(function () { return { ok: false, reason: 'unavailable' }; }) : Promise.resolve({ ok: false, reason: 'no-county' });
        return Promise.all([nearestP, landP]).then(function (o) {
          if (my !== geoSeq) return;
          var n = o[0];
          S.factory = n ? { company: n.f.company, city: n.f.city, state: n.f.state, lat: n.f.lat, lng: n.f.lng, miles: Math.round(n.miles), approx: n.approx } : null;
          S.land = o[1]; save();
          clearTimeout(locateWatch);
          Maps[CFG.mapProvider].show(S.site, S.factory, n && n.coords ? { coords: n.coords } : null);
          paintRoute(); applyLand(false); applyAuto(); paintVerdict(); markDone('size');
        });
      });
    }).catch(function () { clearTimeout(locateWatch); if (my === geoSeq) st.innerHTML = '<span class="bu-muted">Map services are unavailable right now; the model still runs on its defaults.</span>'; });
  }
  function paintRoute() {
    var st = $('#buRoute'), F = S.factory; if (!st) return;
    if (!F) { st.innerHTML = ''; return; }
    st.innerHTML = (S.site && S.site.match ? '<div class="bu-matched" data-keep-parens="1"><span class="bu-muted">Matched:</span> ' + esc(S.site.match) + (S.site.county ? ' · ' + esc(S.site.county) : '') + '</div>' : '') + '<span class="bu-route-dot"></span><b>Nearest factory:</b> ' + esc(F.company) + ', ' + esc(F.city) + ' ' + esc(F.state) + ' — <b>' + F.miles.toLocaleString('en-US') + ' mi</b>' + (F.approx ? ' <span class="bu-muted">approximate: straight line × ' + CFG.roadFactor + '</span>' : ' <span class="bu-muted">by road</span>');
  }
  var addr = document.getElementById('inpAddr'), addrT = null;
  if (addr) {
    addr.addEventListener('change', function () { locate(addr.value); });
    addr.addEventListener('input', function () { clearTimeout(addrT); addrT = setTimeout(function () { locate(addr.value); }, 1400); });
  }

  /* ---------------- verdict ---------------- */
  function topMetrics() {
    var inputs = B.loadInputs(), r = B.compute(inputs), R = B.computeReturns(inputs, r), h = (inputs.yocHurdle == null || inputs.yocHurdle === '' || !isFinite(+inputs.yocHurdle)) ? null : +inputs.yocHurdle;
    var HD = typeof B.computeHold === 'function' ? B.computeHold(inputs, r) : null, verdict, why = '';
    /* same rule as the Outputs Pass/Fail tile (owner Nov 8 08:41): Total IRR vs the Inputs hurdle */
    if (h == null) { verdict = 'Pending'; why = 'Set target'; }
    else if (!R.costComplete) { verdict = 'Pending'; why = 'Partial cost basis'; }
    else if (HD && !HD.missing.length && HD.irr == null && HD.totalDistributions != null && HD.totalDistributions <= 0) verdict = 'Fail';
    else if (!HD || HD.missing.length || HD.irr == null) { verdict = 'Pending'; why = 'Total IRR unavailable'; }
    else verdict = (HD.irr * 100 >= h) ? 'Pass' : 'Fail';
    return { inputs: inputs, r: r, R: R, H: HD, hurdle: h, verdict: verdict, why: why };
  }
  function line(k, r) { for (var i = 0; i < r.costLines.length; i++) if (r.costLines[i].key === k) return r.costLines[i].value; return null; }
  var ctrPrev = {};
  function ctr(id, v, fmt) {
    var e = document.getElementById(id); if (!e) return;
    if (v == null || !isFinite(v)) { e.textContent = '—'; ctrPrev[id] = null; return; }
    var from = ctrPrev[id]; ctrPrev[id] = v;
    if (from == null || from === v || !window.requestAnimationFrame) { e.textContent = fmt(v); return; }
    var t0 = null, D = 450; (function step(ts) { if (t0 == null) t0 = ts; var k = Math.min(1, (ts - t0) / D), q = 1 - Math.pow(1 - k, 3); e.textContent = fmt(from + (v - from) * q); if (k < 1 && ctrPrev[id] === v) requestAnimationFrame(step); else if (ctrPrev[id] === v) e.textContent = fmt(v); })(performance.now());
  }
  function paintProject(inp, r, lg) {
    var units = +inp.units || 0, area = +inp.area || 0, tsf = units * area, fac = line('factory', r);
    var rate = r.factoryCalc && r.factoryCalc.ratePsf, nf = function (x) { return Math.round(x).toLocaleString('en-US'); }, mf = function (x) { return '$' + nf(x); };
    ctr('buPjSf', tsf || null, nf); ctr('buPjFac', fac, mf); ctr('buPjTrips', lg.trips, nf); ctr('buPjTot', r.total, mf);
    var set = function (id, t) { var e = document.getElementById(id); if (e) e.textContent = t; };
    set('buPjSfS', units && area ? nf(units) + ' × ' + nf(area) + ' sf' : '');
    var fi = document.getElementById('buFacRate'); if (fi && document.activeElement !== fi) fi.value = rate ? '$' + nf(rate) : '';
    var fb = document.getElementById('buFacReset'); if (fb) fb.hidden = !(rate && rate !== 90);
    set('buPjTripsS', lg.units + ' units × ' + lg.mods + ' modules');
    set('buPjTotS', 'all-in model total');
  }
  function paintVerdict() {
    try {
    var t = topMetrics(), r = t.r, R = t.R, inp = t.inputs, lg = logistics(), L = lg.L;
    paintProject(inp, r, lg);
    var units = +inp.units || 0, area = +inp.area || 0, tsf = units * area;
    var psf = S.site && DATA.psf && DATA.psf.counties[S.site.fips] ? DATA.psf.counties[S.site.fips][1] : null;
    var local = psf != null ? psf * 0.7 : null; /* owner Nov 11: local $/sf override removed */
    var land = line('land', r), lc = line('landClose', r);
    var modPsf = tsf > 0 && r.total != null ? (r.total - (land || 0) - (lc || 0)) / tsf : null;
    var diff = local && modPsf ? (modPsf - local) / local : null;
    var vcls = t.verdict === 'Pass' ? 'pass' : t.verdict === 'Fail' ? 'fail' : 'pend';
    var irr = t.H && t.H.irr != null ? pct(t.H.irr) : '—';
    var F = S.factory;
    var html = '<div class="bu-sec-head bu-sec-head-sm"><div class="bu-kicker">Quick verdict</div></div><div class="bu-vgrid">' +
      '<div class="bu-vcard bu-vmain ' + vcls + '"><span class="bu-vlab">Does it pencil?</span><span class="bu-vbig">' + esc(t.verdict) + '</span><span class="bu-vsub">' + (t.verdict === 'Pending' ? esc(t.why) : 'Total IRR ' + irr + ' vs ' + (t.hurdle != null ? t.hurdle + '%' : '—') + ' target') + '</span>' +
      '<div class="bu-vkv"><span>Total Project Cost</span><b>' + money0(r.total) + '</b></div><div class="bu-vkv"><span>Yield to Cost</span><b>' + pct(R.yoc) + '</b></div><div class="bu-vkv"><span>Cash on Cash</span><b>' + (R.equityNonPositive ? 'Not meaningful' : pct(R.coc)) + '</b></div><div class="bu-vkv"><span>DSCR</span><b>' + fmtDscr(R.dscr) + '</b></div></div>' +
      '<div class="bu-vcard bu-vlocal"><span class="bu-vlab">Local build cost vs modular</span>' +
      '<div class="bu-cmp"><div><span class="bu-cmp-v">' + (local != null ? '$' + Math.round(local) : '—') + '</span><span class="bu-cmp-l">local $/sf · 70% of county list $/sf</span></div><div><span class="bu-cmp-v accent-t">' + (modPsf != null ? '$' + Math.round(modPsf) : '—') + '</span><span class="bu-cmp-l">modular $/sf · project cost excl. land</span></div></div>' +
      '<div class="bu-vsub">' + (diff == null ? (S.site ? 'County list price not available for this county.' : 'Enter an address to load the county list price.') : (diff < 0 ? 'Modular is <b>' + Math.round(-diff * 100) + '% below</b> local building cost' : 'Modular is <b>' + Math.round(diff * 100) + '% above</b> local building cost')) + '</div>' +
      '<div class="bu-vkv"><span>Est. local building cost' + (tsf ? ' · ' + tsf.toLocaleString('en-US') + ' sf' : '') + '</span><b>' + (local != null && tsf ? money0(local * tsf) : '—') + '</b></div>' +
      '</div>' +
      '<div class="bu-vcard"><span class="bu-vlab">Delivery and set</span>' +
      '<div class="bu-vkv"><span>Nearest factory</span><b>' + (F ? esc(F.city + ', ' + F.state) : '—') + '</b></div>' +
      '<div class="bu-vkv"><span>Road miles' + (F && F.approx ? ' · approx.' : '') + '</span><b>' + (F ? F.miles.toLocaleString('en-US') : '—') + '</b></div>' +
      '<div class="bu-vkv"><span>Truck trips · ' + lg.units + ' units × ' + lg.mods + ' modules</span><b>' + lg.trips + '</b></div>' +
      '<div class="bu-vkv"><span>Transport' + (S.userTransport ? ' · your value kept' : '') + '</span><b>' + money0(line('transport', r)) + '</b></div>' +
      '<div class="bu-vkv"><span>Crane and crew · flat</span><b>' + money0(line('crane', r)) + '</b></div>' +
      '<div class="bu-vkv"><span>Oversize permits / escorts</span><b>' + (lg.oversize ? 'May be required' : 'Not flagged') + '</b></div>' +
      '<details class="bu-logi"><summary>Edit logistics</summary><div class="bu-logi-grid">' +
      '<label><span>Modules per unit</span><input id="buMods" type="number" min="1" step="1" value="' + lg.mods + '"></label>' +
      '<label><span>Module width</span><select id="buWidth">' + [12, 14, 15, 16].map(function (w) { return '<option' + (w === lg.width ? ' selected' : '') + ' value="' + w + '">' + w + ' ft</option>'; }).join('') + '</select></label>' +
      '<label><span>$ per mile per truck</span><input id="buRate" data-m="1" value="$' + L.rate + '"></label>' +
      '<label><span>Minimum per trip</span><input id="buMin" data-m="1" value="' + fmtMoney(L.minTrip) + '"></label>' +
      (lg.oversize ? '<label><span>Oversize permits $</span><input id="buPermits" data-m="1" placeholder="to be confirmed" value="' + (L.permits ? fmtMoney(L.permits) : '') + '"></label><label><span>Escorts $</span><input id="buEscorts" data-m="1" placeholder="to be confirmed" value="' + (L.escorts ? fmtMoney(L.escorts) : '') + '"></label>' : '') +
      '</div><div class="bu-src">Transport = trips × max($/mile × road miles, minimum per trip) — $20/mile per module and $1,500 minimum are Michael’s figures. Crane and crew: flat $10,000 per project.' + (lg.oversize ? ' Modules 15 ft and wider: oversize permits and escorts may be required in states along the route — to be confirmed.' : '') + '</div></details></div>' +
      '<div class="bu-vcard"><span class="bu-vlab">Land</span><span class="bu-vbig sm">' + money0(land) + '</span><span class="bu-vsub">' + (S.land && S.land.ok ? 'Assessed land value (county records, tax year ' + esc(S.land.taxYear || '—') + ')' + (S.auto.landUser ? ' · your value in use' : '') : S.site ? 'Assessed value not available here — enter land cost' : 'Model default until an address is entered') + '</span><label class="bu-mini bu-land-in"><span>Land cost</span><input id="buLandIn" inputmode="decimal" aria-label="Land cost" value="' + (land != null ? money0(land) : '') + '"></label>' + (S.land && S.land.ok && S.auto.landUser ? '<button type="button" class="bu-link" id="buLandReset2">Reset to assessed</button>' : '') + '</div>' +
      '<div class="bu-vcard bu-vfin"><span class="bu-vlab">Financing</span>' +
      '<div class="bu-vkv"><span>Construction loan · Lender B</span><b>' + (inp.bLtvPct != null ? inp.bLtvPct + '% LTV' : '—') + ' · ' + (inp.finRateB != null ? inp.finRateB + '%' : '—') + '</b></div>' +
      '<div class="bu-vkv"><span>Permanent rate · 5 yrs IO, then 30-yr</span><b>' + (inp.permLoanRate != null ? inp.permLoanRate + '%' : '—') + '</b></div>' +
      '<div class="bu-vkv"><span>Factory loan · Lender A · 60% of factory, repaid at delivery</span><b>' + (inp.aLtvPct != null ? inp.aLtvPct + '% LTV' : '—') + ' · ' + (inp.finRateA != null ? inp.finRateA + '%' : '—') + '</b></div>' +
      '<div class="bu-vkv"><span>Hold · exit cap · selling costs</span><b>' + (inp.holdYears || '—') + ' yrs · ' + (inp.exitCapPct != null ? inp.exitCapPct + '%' : '—') + ' · ' + (inp.sellCostPct != null ? inp.sellCostPct + '%' : '—') + '</b></div>' +
      '<a class="bu-link" href="#buStep-fin">Edit financing ↓</a></div>' +
      '</div>';
    var open = $('#buVerdict details.bu-logi'); var wasOpen = open && open.open, foc = document.activeElement && document.activeElement.id;
    if (foc && /^bu(Bld|Mods|Width|Rate|Min|Crew|Permits|Escorts|LandIn)/.test(foc)) return; /* don't repaint under the cursor */
    verdict.innerHTML = html;
    if (wasOpen) $('#buVerdict details.bu-logi').open = true;
    wireVerdict();
    paintSiteTotal();
    } catch (err) {
      try { console.error('[bespoke-demo] verdict', err); } catch (e) { }
      try {
        verdict.innerHTML = '<div class="bu-sec-head bu-sec-head-sm"><div class="bu-kicker">Quick verdict</div></div><div class="bu-vcard bu-vmain pend"><span class="bu-vlab">Does it pencil?</span><span class="bu-vbig">Pending</span><span class="bu-vsub">The current inputs could not be calculated. Check the figures and try again.</span></div>';
      } catch (e2) { }
    }
  }
  function wireVerdict() {
    var num = function (v) { var c = clean(v); return c === '' ? null : +c; };
    function bindM(id, key) { var e = document.getElementById(id); if (!e) return; e.addEventListener('blur', function () { e.value = e.value ? fmtMoney(e.value) : ''; }); e.addEventListener('change', function () { S.logi[key] = num(e.value); save(); applyAuto(); paintVerdict(); }); }
    bindM('buRate', 'rate'); bindM('buMin', 'minTrip'); bindM('buCrew', 'crew'); bindM('buPermits', 'permits'); bindM('buEscorts', 'escorts');
    var m = $('#buMods'); if (m) m.addEventListener('change', function () { var v = Math.max(1, Math.round(+m.value || 2)); setSaved({ boxes: v }); applyAuto(); paintVerdict(); });
    var w = $('#buWidth'); if (w) w.addEventListener('change', function () { S.logi.width = +w.value; save(); paintVerdict(); });
    var bp = $('#buBldPsf'); if (bp) { bp.addEventListener('blur', function () { bp.value = bp.value ? fmtMoney(bp.value) : ''; }); bp.addEventListener('change', function () { var c = clean(bp.value); S.logi.bldPsf = c === '' ? null : +c; save(); paintVerdict(); }); }
    var li = $('#buLandIn'), cl = document.getElementById('cLand');
    if (li && cl) {
      li.addEventListener('blur', function () { li.value = li.value ? fmtMoney(li.value) : ''; });
      li.addEventListener('change', function () { var c = clean(li.value); if (c === '') return; cl.value = +c; S.auto.landUser = true; save(); cl.dispatchEvent(new Event('input', { bubbles: true })); cl.dispatchEvent(new Event('change', { bubbles: true })); markTouched('cLand'); paintLandNote(); setTimeout(paintVerdict, 0); });
    }
    var lr = $('#buLandReset2'); if (lr) lr.addEventListener('click', function () { S.auto.landUser = false; save(); applyLand(true); setTimeout(paintVerdict, 0); });
    $$('[data-jump]', verdict).forEach(function (a) { a.addEventListener('click', function (e) { var t = document.getElementById(a.dataset.jump); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { t.focus(); }, 400); } }); });
  }

  /* ---------------- final section ---------------- */
  function paintReady() { /* owner Nov 11 14:04: standalone full-width "Download your model" section directly beneath Step 5 Financing and hold (not inside the UW grid); same export (#outExport) */
    var exp = !!document.getElementById('outExport') && !!window.BespokeCoreExportOOXML;
    var old = document.getElementById('buReadyCell'); if (old && old.parentNode) old.parentNode.removeChild(old);
    ready.hidden = false;
    if (!ready.querySelector('#buDownload')) {
      ready.innerHTML = '<div class="bu-dl-card"><button type="button" class="bu-btn" id="buDownload">Download Your Model</button></div>'; /* owner Nov 11 15:14: centered blue button only, no heading, no card */
      ready.querySelector('#buDownload').addEventListener('click', function () { var b = document.getElementById('outExport'); if (b) b.click(); });
    }
    var st5 = document.getElementById('buStep-fin'); if (st5 && st5.parentNode && ready.previousElementSibling !== st5) st5.parentNode.insertBefore(ready, st5.nextSibling);
    var btn = ready.querySelector('#buDownload'); if (btn.disabled !== !exp) btn.disabled = !exp;
  }
  /* ---------------- progress + steps done ---------------- */
  function markDone(id) { if (!id || S.done[id]) return; S.done[id] = 1; save(); paintProgress(); }
  function paintProgress() { $$('.bu-prog-item', prog).forEach(function (a) { a.classList.toggle('done', !!S.done[a.dataset.step]); }); }
  if ('IntersectionObserver' in window) {
    var timers = {};
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { var id = e.target.dataset.step; if (e.isIntersecting) { timers[id] = setTimeout(function () { markDone(id); }, 1200); $$('.bu-prog-item', prog).forEach(function (a) { a.classList.toggle('cur', a.dataset.step === id); }); } else clearTimeout(timers[id]); }); }, { threshold: 0.45 });
    STEPS.forEach(function (s) { io.observe(s.row); });
  }
  paintProgress();
  $$('.bu-pair-in', steps).forEach(function (p) { p.addEventListener('input', function (e) { var st = e.target.closest('.bu-step'); if (st) markDone(st.dataset.step); }); });

  /* ---------------- free-trial gate (owner Nov 11 14:10/14:11) ----------------
     One free model per visitor, client-side only (localStorage 'bespoke.trial.v1'; the saved-settings reset never touches this key).
     Trigger 1: the first press of Run (the sticky "Recalculate" button) is the free model; any later press is blocked, results stay as they were.
     Trigger 2 (rev 14:40): sample downloads before Run are free; the first download after Run counts; later clicks blocked. Trigger 3 (14:28): a different address after the first run is frozen. Slider/input live updates are NOT gated. No URL bypass. */
  var TRIAL_KEY = 'bespoke.trial.v1';
  var trialMem = {};
  function trialGet() {
    try {
      var raw = localStorage.getItem(TRIAL_KEY);
      if (raw) {
        var t = JSON.parse(raw);
        if (t && typeof t === 'object' && !Array.isArray(t)) { trialMem = t; return t; }
      }
    } catch (e) { }
    return trialMem || {};
  }
  function trialSet(t) { trialMem = t || {}; try { localStorage.setItem(TRIAL_KEY, JSON.stringify(trialMem)); } catch (e) { } }
  var trialBox = null, trialPrevFocus = null;
  function trialClose() { if (!trialBox) return; trialBox.hidden = true; document.documentElement.classList.remove('bu-trial-open'); if (trialPrevFocus && trialPrevFocus.focus) try { trialPrevFocus.focus(); } catch (e) { } }
  function trialShow(why) {
    if (!trialBox) {
      trialBox = el('div', { class: 'bu-trial', id: 'buTrial', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'buTrialH', hidden: '' },
        '<div class="bu-trial-card"><h2 id="buTrialH">Your trial has ended</h2><div class="bu-trial-msg">You\u2019ve used your free model. To run more deals, get in touch and we\u2019ll set you up.</div>' +
        '<div class="bu-trial-btns"><a class="bu-btn bu-trial-go" href="https://bespokeunderwriting.com/#contact">Get in touch</a><button type="button" class="bu-trial-x">Close</button></div></div>');
      document.body.appendChild(trialBox);
      trialBox.querySelector('.bu-trial-x').addEventListener('click', trialClose);
      trialBox.addEventListener('click', function (e) { if (e.target === trialBox) trialClose(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && trialBox && !trialBox.hidden) trialClose(); });
    }
    trialPrevFocus = document.activeElement; trialBox.hidden = false; trialBox.setAttribute('data-why', why || '');
    document.documentElement.classList.add('bu-trial-open');
    var go = trialBox.querySelector('.bu-trial-go'); if (go) go.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#buRecalc, #buDownload, #outExport') : null; if (!t) return;
    var tr = trialGet();
    if (t.id === 'buRecalc') {
      if (!tr.runs) { tr.runs = 1; tr.firstRunAt = new Date().toISOString(); var ad = document.getElementById('inpAddr'); tr.addr = ad ? String(ad.value || '') : ''; trialSet(tr); return; }
      var firstMs = tr.firstRunAt ? Date.parse(tr.firstRunAt) : 0;
      if (firstMs && isFinite(firstMs) && (Date.now() - firstMs) < 1200) return; /* swallow a double-click on the first Recalculate so the trial box does not pop immediately */
      tr.blockedRuns = (tr.blockedRuns || 0) + 1; trialSet(tr);
      e.preventDefault(); e.stopImmediatePropagation(); trialShow('run'); return;
    }
    if (t.id === 'outExport' && !e.isTrusted) return; /* programmatic click from #buDownload, already checked */
    /* owner Nov 11 14:40: one download of the free model. Sample downloads before any Run are free and never counted;
       only the first download after the first Run counts; later clicks blocked. (A pre-14:40 count is honored only if it came after the first run.) */
    if (!tr.runs) return;
    var used = !!tr.dlAfterRun || (!!tr.downloads && !!tr.firstDownloadAt && !!tr.firstRunAt && tr.firstDownloadAt >= tr.firstRunAt);
    if (used) { tr.blockedDownloads = (tr.blockedDownloads || 0) + 1; trialSet(tr); e.preventDefault(); e.stopImmediatePropagation(); trialShow('download'); return; }
    tr.dlAfterRun = 1; tr.downloads = 1; tr.firstDownloadAt = new Date().toISOString(); trialSet(tr);
  }, true);
  /* owner Nov 11 14:28: after the first run, a different address is frozen: no geocode, no recompute, the first model's address and results stay, box shown.
     If the first run had no address (sample case), the first address entered becomes the model's address. Sliders stay live. */
  function normA(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function addrAllowed(v, tr) {
    var n = normA(v); if (!n) return true;
    if (tr.addr && n === normA(tr.addr)) return true;
    if (S.site && (n === normA(S.site.label) || n === normA(S.site.match))) return true;
    return false;
  }
  function addrFrozen(tr) { return !!(tr.runs && tr.addr); }
  function adoptAddr() { var tr = trialGet(); if (tr.runs && !tr.addr && S.site && S.site.label) { var ad = document.getElementById('inpAddr'); tr.addr = (ad && ad.value) || S.site.label; trialSet(tr); } }
  window.addEventListener('bespoke-core-inputs', function () { setTimeout(adoptAddr, 0); });
  function addrRestore(tr) { var ad = document.getElementById('inpAddr'); if (!ad) return; var v = tr.addr || (S.site && S.site.label) || ''; if (ad.value !== v) ad.value = v; var l = document.getElementById('addrList'); if (l) { l.hidden = true; l.innerHTML = ''; } ad.setAttribute('aria-expanded', 'false'); }
  ['input', 'change', 'focusout', 'keydown', 'paste'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var ad = e.target; if (!ad || ad.id !== 'inpAddr') return;
      var tr = trialGet(); if (!addrFrozen(tr)) return;
      if (type === 'keydown' && e.key !== 'Enter') return;
      if (type === 'input' || type === 'paste') { if (!addrAllowed(ad.value, tr)) e.stopImmediatePropagation(); return; } /* no lookups, saves or geocoding while typing */
      if (addrAllowed(ad.value, tr)) return;
      e.preventDefault(); e.stopImmediatePropagation(); tr.blockedAddrs = (tr.blockedAddrs || 0) + 1; trialSet(tr); addrRestore(tr); trialShow('address');
    }, true);
  });

  /* ---------------- sticky recalculate (harmless re-run) ---------------- */
  var rc = el('button', { type: 'button', class: 'bu-recalc', id: 'buRecalc' }, 'Recalculate');
  /* desktop/tablet: lives inside the sticky step bar so it never floats over content; phones: inline full-width button under the hero cards (never floats over inputs) */
  var mqDesk = window.matchMedia('(min-width: 768px)');
  function placeRc() { if (mqDesk.matches) { if (rc.parentNode !== prog) prog.appendChild(rc); } else { var hg = document.querySelector('.bu-hero-grid'); if (hg && rc.previousElementSibling !== hg) hg.parentNode.insertBefore(rc, hg.nextSibling); } }
  function setBarH() { var hb = document.querySelector('.bu-sitebar'), h = hb ? hb.getBoundingClientRect().height : 0, ps = getComputedStyle(prog).position === 'sticky' ? prog.getBoundingClientRect().height + 8 : 0, v = Math.round(h + ps + 16) + 'px'; if (document.documentElement.style.getPropertyValue('--bu-bar-h') !== v) document.documentElement.style.setProperty('--bu-bar-h', v); } /* anchors land below the sticky header + step bar */
  setBarH(); window.addEventListener('resize', setBarH); setTimeout(setBarH, 800);
  placeRc(); if (mqDesk.addEventListener) mqDesk.addEventListener('change', placeRc); else if (mqDesk.addListener) mqDesk.addListener(placeRc);
  document.addEventListener('input', function (e) { if (e.isTrusted) document.body.classList.add('bu-edited'); }, true);
  document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input,select,textarea')) document.body.classList.add('bu-typing'); });
  document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!(a && a.matches && a.matches('input,select,textarea'))) document.body.classList.remove('bu-typing'); }, 0); });
  rc.addEventListener('click', function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); if (window.modRecalc) window.modRecalc(); try { window.dispatchEvent(new CustomEvent('bespoke-core-inputs')); } catch (e) { } rc.classList.add('spin'); setTimeout(function () { rc.classList.remove('spin'); }, 600); });

  /* ---------------- equal heights per pair (CSS grid stretch does the work; this keeps maps/charts refreshed) ---------------- */
  function eqHeights() { try { if (Maps.leaflet.map) Maps.leaflet.map.invalidateSize(); } catch (e) { } }
  var autoT = null;
  window.addEventListener('bespoke-core-inputs', function () { if (S.factory) { clearTimeout(autoT); autoT = setTimeout(applyAuto, 30); } }); /* trips = units × modules: keep transport in step (applyAuto only writes when the value differs, so no loop) */
  window.addEventListener('bespoke-core-inputs', function () { setTimeout(function () { paintVerdict(); paintReady(); paintWaterfall(); paintSiteTotal(); }, 0); });
  var rzT; window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(function () { eqSite(); paintRentSale(); var ox = slot('opexChart'); if (ox) { var pl = ox.querySelector('.bu-ox-plot'); if (pl) pl.dataset.shape = ''; } paintOpexChart(); eqPair('opex', '.bu-ox', 901); var s = slot('waterfall'); if (s) { s.dataset.w = ''; } paintWaterfall(); redrawGantt(); eqHeights(); }, 200); });

  /* ---------------- boot ---------------- */
  function boot() {
    syncU && syncU(); syncA && syncA(); syncSliders(); paintTags(); paintSiteTotal(); paintLandNote();
    relocate();
    dataReady.then(function () {
      paintVerdict();
      if (S.site && S.site.label && addr && S.site.label === String(addr.value || '').replace(/\s+/g, ' ').trim()) { lastQ = S.site.label; S.factory = null; locate(addr.value, true); /* never repaint a cached factory; re-resolve from the current list */ }
      else if (addr && addr.value && addr.value.length > 8 && !/^sample modular deal$/i.test(addr.value.trim())) locate(addr.value);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 120); }); else setTimeout(boot, 120);
  setTimeout(function () { syncU && syncU(); syncA && syncA(); syncSliders(); paintTags(); relocate(); }, 1200);
  window.BUDemo = { state: S, locate: locate, relocate: relocate, logistics: logistics, topMetrics: topMetrics };
})();
