/* Presentation only: mounts marketing BUCharts drawers onto core-model outputs.
   Reads computed results; never writes inputs or changes calculations. */
(function (w) {
  'use strict';

  function kFmt(v) {
    var n = Number(v) || 0, neg = n < 0;
    n = Math.abs(n);
    var s = n >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '$' + Math.round(n);
    return neg ? '-' + s : s;
  }
  function money(n) {
    return (w.BUCharts && w.BUCharts.money) ? w.BUCharts.money(n) : (w.BespokeCore ? w.BespokeCore.moneyExact(n) : String(n));
  }
  function pctOf(v, total) {
    if (!(total > 0) || v == null || !isFinite(v)) return '0%';
    return (Math.round((v / total) * 1000) / 10).toFixed(1) + '%';
  }
  function titleCaseLabel(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/\s+Costs?$/i, '');
    s = s.replace(/\s+And\s+/gi, ' & ');
    return s.replace(/[A-Za-z][^\s-]*/g, function (w) {
      if (w.length <= 3 && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  function shortLabel(s) {
    return titleCaseLabel(s);
  }

  function drawGantt(slot, pack) {
    var C = w.BUCharts;
    if (!C || !slot || !pack || !pack.rows) return;
    var rows = pack.rows, weeks = pack.weeks || 14;
    var rowH = 28, padL = 168, padR = 18, padT = 42, padB = 22;
    slot.style.height = (padT + rows.length * rowH + padB) + 'px';
    var dim = C.box(slot);
    var width = dim.w, height = dim.h;
    slot.innerHTML = '';
    var svg = C.svgRoot(width, height, 'Construction schedule');
    var paint = C.addPaint(svg);
    C.drawTitle(svg, pack.title || 'Construction Schedule', 16, 20);
    var plotW = Math.max(80, width - padL - padR);
    var maxD = weeks * 7;
    function x(day) { return padL + (day / maxD) * plotW; }
    var i, wk;
    for (wk = 0; wk <= weeks; wk++) {
      var gx = x(wk * 7);
      svg.appendChild(C.el('line', { x1: gx, x2: gx, y1: padT - 6, y2: height - padB + 4, stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 }));
      if (wk < weeks) {
        svg.appendChild(C.el('text', { x: (x(wk * 7) + x(wk * 7 + 7)) / 2, y: padT - 10, 'text-anchor': 'middle', class: 'tick' }, [String(wk + 1)]));
      }
    }
    svg.appendChild(C.el('text', { x: 16, y: padT - 10, class: 'axis-label' }, ['WEEK']));
    var colors = ['#359BC5', '#4FB3DC', '#6CC0E0', '#247A9C', '#1A6484', '#A9DCEF', '#2A8FB5', '#7CC8E4'];
    var hits = [];
    rows.forEach(function (t, idx) {
      var y = padT + idx * rowH;
      var label = String(t.label || '');
      var shown = label.length > 26 ? label.slice(0, 24) + '…' : label;
      svg.appendChild(C.el('text', { x: padL - 10, y: y + 16, 'text-anchor': 'end', class: 'row-label' }, [shown]));
      var g = C.el('g', { class: 'hit bar-grow', style: 'animation-delay:' + (idx * 35) + 'ms' });
      var start = Number(t.startDay) || 0, end = Number(t.endDay != null ? t.endDay : start);
      var x0 = x(start), x1 = x(Math.max(end, start) + (t.ms || t.co ? 0 : 1));
      var tipBits = [label];
      if (t.co) tipBits.push('Certificate of occupancy · day ' + start);
      else if (t.ms) tipBits.push((t.fp ? 'Milestone' : 'Marker') + ' · day ' + start);
      else tipBits.push('Days ' + start + '–' + end);
      if (t.amount != null && isFinite(t.amount)) tipBits.push(money(t.amount));
      g.setAttribute('data-tip-title', tipBits[0]);
      g.setAttribute('data-tip-body', tipBits.slice(1).join(' · '));
      if (t.ms || t.co) {
        var cx = t.co ? x(start) : x(start + 0.5);
        var cy = y + 12;
        var d = 'M' + cx + ' ' + (cy - 6) + ' L' + (cx + 6) + ' ' + cy + ' L' + cx + ' ' + (cy + 6) + ' L' + (cx - 6) + ' ' + cy + ' Z';
        g.appendChild(C.el('path', { d: d, fill: t.co ? '#A9DCEF' : '#4FB3DC', class: 'mark', filter: paint.glow }));
      } else {
        var bw = Math.max(3, x1 - x0);
        g.appendChild(C.el('rect', {
          x: x0, y: y + 5, width: bw, height: 14, rx: 3,
          fill: colors[idx % colors.length], class: 'mark', filter: idx % 3 === 0 ? paint.glow : ''
        }));
      }
      svg.appendChild(g);
      hits.push(g);
    });
    slot.appendChild(svg);
    slot._dim = dim;
    C.bindHot(slot, hits, function (i, node) {
      return '<b>' + (node.getAttribute('data-tip-title') || '') + '</b><span>' + (node.getAttribute('data-tip-body') || '') + '</span>';
    });
    requestAnimationFrame(function () { slot.classList.add('in-view'); });
  }

  function mountOutputs() {
    var C = w.BUCharts, B = w.BespokeCore;
    if (!C || !B || typeof C.draw !== 'function') return;
    var root = document.getElementById('outRoot');
    if (!root) return;
    var inputs = B.loadInputs();
    var r = w.__BU_lastOutputs || B.compute(inputs);
    var fmtOpts = { yFormat: kFmt, format: money };

    var costSlot = root.querySelector('[data-core-chart="project-costs"]');
    if (costSlot) {
      var parts = (r.costLines || []).map(function (ln) {
        var v = ln.value != null && isFinite(ln.value) ? +ln.value : 0;
        return [shortLabel(ln.label), v, ln.label];
      }).filter(function (p) { return p[1] > 0; });
      C.draw(costSlot, 'hBars', parts, {
        title: 'Project Costs',
        label: 'Project Costs',
        yFormat: kFmt,
        format: function (v) { return money(v); }
      });
    }

    var donutSlot = root.querySelector('[data-core-chart="cost-donut"]');
    if (donutSlot) {
      var labels = { land: 'Land And Closing', site: 'Site And Permitting Costs', modular: 'Modular Specific Costs' };
      var slices = (r.sections || []).map(function (sec) {
        return [labels[sec.id] || sec.title, +sec.data.subtotal || 0];
      }).filter(function (p) { return p[1] > 0; });
      var tot = slices.reduce(function (s, d) { return s + d[1]; }, 0);
      var donutItems = slices.map(function (p) { return [p[0], p[1], pctOf(p[1], tot)]; });
      C.draw(donutSlot, 'donut', donutItems, {
        title: 'Project Cost Breakdown',
        label: 'Project Cost Breakdown',
        sub: 'TOTAL',
        center: tot >= 1000 ? '$' + Math.round(tot / 1000) + 'k' : money(tot)
      });
    }

    var ganttSlot = root.querySelector('[data-core-chart="gantt"]');
    if (ganttSlot && w.__BU_gantt) drawGantt(ganttSlot, w.__BU_gantt);

    var rentSlot = root.querySelector('[data-core-chart="rent-sale"]');
    if (rentSlot && w.__BU_rentSaleBars && w.__BU_rentSaleBars.length) {
      C.draw(rentSlot, 'vBars', w.__BU_rentSaleBars, {
        title: 'Five-Year Rent and Sale',
        label: 'Five-Year Rent and Sale',
        yFormat: kFmt,
        niceTicks: true,
        format: money
      });
    }

    var cfSlot = root.querySelector('[data-core-chart="cashflow-year"]');
    var cocSlot = root.querySelector('[data-core-chart="coc-line"]');
    var H = w.__BU_hold;
    if (H && !H.missing.length) {
      var cfItems = H.years.map(function (y, ix) {
        var v = y.cashFlow + (ix === H.years.length - 1 ? H.netSale : 0);
        return ['Y' + y.year, v, 'Year ' + y.year + (ix === H.years.length - 1 ? ' incl. sale' : '')];
      });
      var hasNeg = cfItems.some(function (d) { return d[1] < 0; });
      if (cfSlot) {
        if (hasNeg) {
          C.draw(cfSlot, 'posNeg', cfItems, {
            title: '',
            padL: 52, padR: 12, padT: 24, /* one plot frame for the four Rent and value charts */
            label: 'Cash Flow by Year',
            yFormat: kFmt,
            format: money
          });
        } else {
          C.draw(cfSlot, 'vBars', cfItems.map(function (d) { return [d[0], d[1]]; }), {
            title: '', /* card header row carries the title (demo card pattern) */
            padL: 52, padR: 12, padT: 24, /* one plot frame for the four Rent and value charts */
            label: 'Cash Flow by Year',
            niceTicks: true, /* clean rounded ticks ($100k, $200k ...) */
            yFormat: kFmt,
            format: money
          });
        }
      }
      if (cocSlot && H.equity > 0) {
        var cocItems = H.years.map(function (y) {
          return ['Year ' + y.year, (y.cashFlow / H.equity) * 100];
        });
        C.draw(cocSlot, 'areaLine', cocItems, {
          title: '',
          padL: 52, padR: 12, padT: 24, /* one plot frame for the four Rent and value charts */
          label: 'Cash on Cash',
          inset: 14, /* line and end dots stay off the plot edges */
          format: function (v) { return (Math.round(v * 10) / 10).toFixed(1) + '%'; },
          yFormat: function (v) { return Math.round(v) + '%'; },
          ticks: cocItems.map(function (d, i) { return { i: i, label: 'Y' + (i + 1) }; }).filter(function (t) { var n = cocItems.length, wd = Math.min(cocSlot.getBoundingClientRect().width || 500, (w.innerWidth || 1280) - 80); return !(n > 6 && wd / n < 34) || (n - 1 - t.i) % 2 === 0; })
        });
      }
    }

    var srcSlot = root.querySelector('[data-core-chart="sources"]');
    if (srcSlot && H && !H.missing.length) {
      var R = (typeof B.computeReturns === 'function') ? B.computeReturns(inputs, r) : null;
      var loan = R && R.lenderB != null ? R.lenderB : null;
      var eq = H.equity;
      if (loan != null && eq != null) {
        var srcTot = Math.max(0, eq) + Math.max(0, loan);
        /* owner Nov 11 13:50: Loan A (60% factory progress payments) is repaid by Loan B at delivery; show it as its own slice so the slices still sum to cash + Lender B */
        var FIN = (typeof B.computeFinancing === 'function') ? B.computeFinancing(inputs) : null, aAmt = FIN && FIN.aPeak > 0 ? Math.min(FIN.aPeak, Math.max(0, loan)) : 0, bNet = Math.max(0, loan) - aAmt;
        var srcItems = [
          ['Cash invested', Math.max(0, eq), pctOf(eq, srcTot)],
          ['Loan A factory', aAmt, pctOf(aAmt, srcTot)],
          ['Lender B', bNet, pctOf(bNet, srcTot)]
        ].filter(function (p) { return p[1] > 0; });
        w.__BU_srcTotS = '$' + Math.round(srcTot).toLocaleString('en-US');
        if (srcItems.length) {
          C.draw(srcSlot, 'donut', srcItems, {
            title: '',
            label: 'Sources',
            sub: 'TOTAL',
            center: srcTot >= 1000 ? '$' + Math.round(srcTot / 1000) + 'k' : money(srcTot)
          });
        }
      }
    }
  }

  function mountLoan() {
    var C = w.BUCharts;
    if (!C || typeof C.draw !== 'function') return;
    var host = document.getElementById('loanLifecycleBottom');
    if (!host) return;
    host.querySelectorAll('[data-core-chart]').forEach(function (slot) {
      if (slot.closest('[hidden], [data-not-used="1"]')) return;
      var rows;
      try { rows = JSON.parse(slot.getAttribute('data-rows') || '[]'); } catch (e) { rows = []; }
      var kind = slot.getAttribute('data-kind') || 'areaLine';
      var title = slot.getAttribute('data-title') || '';
      if (!rows.length) return;
      if (kind === 'vBars') {
        C.draw(slot, 'vBars', rows, { title: title, label: title, yFormat: kFmt, format: money, niceTicks: true });
      } else {
        C.draw(slot, 'areaLine', rows, {
          title: title,
          label: title,
          yFormat: kFmt,
          format: money,
          niceTicks: true,
          inset: 14,
          ticks: rows.map(function (d, i) { return { i: i, label: d[0] }; }).filter(function (t, i, arr) {
            return i === 0 || i === arr.length - 1 || i % Math.max(1, Math.ceil(arr.length / 6)) === 0;
          })
        });
      }
    });
  }

  w.BUMountCoreCharts = mountOutputs;
  w.BUMountLoanCharts = mountLoan;
  w.BUDrawGantt = drawGantt; /* demo page: redraw the Gantt at its paired-column width */
  function bootMount() { mountOutputs(); mountLoan(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootMount);
  else bootMount();
})(window);
