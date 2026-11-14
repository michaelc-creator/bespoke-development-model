(() => {
  const HOT = "#4FB3DC";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function lin(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function hexLum(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrastRatio(a, b) {
    const L1 = hexLum(a), L2 = hexLum(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function cellInk(fill) {
    const ink = "#101211", paper = "#FFFFFF";
    return contrastRatio(fill, paper) >= contrastRatio(fill, ink) ? paper : ink;
  }
  function money(n) {
    const v = Math.round(Number(n) * 100) / 100;
    const neg = v < 0;
    const abs = Math.abs(v);
    let s;
    if (Math.abs(abs - Math.round(abs)) < 0.001) s = "$" + Math.round(abs).toLocaleString("en-US");
    else s = "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return neg ? "-" + s : s;
  }
  function el(name, attrs, kids) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v !== "" && v != null) n.setAttribute(k, String(v)); });
    (kids || []).forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }
  function box(slot) {
    const r = slot.getBoundingClientRect();
    const spark = slot.classList.contains("spark") || slot.getAttribute("data-chart") === "spark";
    return {
      w: Math.max(spark ? 48 : 180, Math.round(r.width) || (spark ? 80 : 480)),
      h: Math.max(spark ? 22 : 120, Math.round(r.height) || (spark ? 34 : 220))
    };
  }
  function svgRoot(w, h, label) {
    return el("svg", {
      viewBox: `0 0 ${w} ${h}`, width: "100%", height: "100%",
      preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": label || ""
    });
  }
  function addPaint(svg) {
    const uid = "p" + Math.random().toString(36).slice(2, 8);
    const defs = el("defs", {});
    const glow = el("filter", { id: uid + "-glow", x: "-40%", y: "-40%", width: "180%", height: "180%" });
    glow.appendChild(el("feGaussianBlur", { stdDeviation: "2.4", result: "b" }));
    glow.appendChild(el("feMerge", {}, [el("feMergeNode", { in: "b" }), el("feMergeNode", { in: "SourceGraphic" })]));
    defs.appendChild(glow);
    const area = el("linearGradient", { id: uid + "-area", x1: "0", y1: "0", x2: "0", y2: "1" });
    area.appendChild(el("stop", { offset: "0%", "stop-color": "#4FB3DC", "stop-opacity": "0.4" }));
    area.appendChild(el("stop", { offset: "100%", "stop-color": "#359BC5", "stop-opacity": "0" }));
    defs.appendChild(area);
    const line = el("linearGradient", { id: uid + "-line", x1: "0", y1: "0", x2: "1", y2: "0" });
    line.appendChild(el("stop", { offset: "0%", "stop-color": "#359BC5" }));
    line.appendChild(el("stop", { offset: "100%", "stop-color": "#A9DCEF" }));
    defs.appendChild(line);
    svg.appendChild(defs);
    return { glow: "url(#" + uid + "-glow)", area: "url(#" + uid + "-area)", line: "url(#" + uid + "-line)" };
  }
  function gridY(svg, padL, padR, padT, innerH, w) {
    for (let i = 1; i <= 4; i++) {
      const y = padT + (innerH / 4) * i;
      svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: y, y2: y, stroke: "rgba(255,255,255,.07)", "stroke-width": 1 }));
    }
  }
  function smoothPath(pts) {
    if (!pts.length) return "";
    let d = "M" + pts[0][0] + " " + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      let c1x = p1[0] + (p2[0] - p0[0]) / 6;
      let c1y = p1[1] + (p2[1] - p0[1]) / 6;
      let c2x = p2[0] - (p3[0] - p1[0]) / 6;
      let c2y = p2[1] - (p3[1] - p1[1]) / 6;
      const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
      c1y = Math.min(hi, Math.max(lo, c1y));
      c2y = Math.min(hi, Math.max(lo, c2y));
      d += "C" + c1x + " " + c1y + " " + c2x + " " + c2y + " " + p2[0] + " " + p2[1];
    }
    return d;
  }

  let tip;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "chart-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }
  function showTip(x, y, html) {
    const t = ensureTip();
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 12;
    if (left + r.width > window.innerWidth - 12) left = x - r.width - 14;
    if (top < 8) top = y + 16;
    t.style.left = left + "px";
    t.style.top = top + "px";
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function bindHot(root, nodes, tipFn) {
    nodes.forEach((node, i) => {
      const enter = (ev) => {
        root.classList.add("is-hot");
        nodes.forEach((n) => n.classList.toggle("is-on", n === node));
        const p = ev.touches ? ev.touches[0] : ev;
        showTip(p.clientX, p.clientY, tipFn(i, node));
      };
      const move = (ev) => {
        if (!node.classList.contains("is-on")) return;
        const p = ev.touches ? ev.touches[0] : ev;
        showTip(p.clientX, p.clientY, tipFn(i, node));
      };
      const leave = () => { root.classList.remove("is-hot"); nodes.forEach((n) => n.classList.remove("is-on")); hideTip(); };
      node.addEventListener("pointerenter", enter);
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerleave", leave);
      node.addEventListener("touchstart", (e) => { enter(e); }, { passive: true });
    });
    root.addEventListener("pointerleave", () => { root.classList.remove("is-hot"); nodes.forEach((n) => n.classList.remove("is-on")); hideTip(); });
  }

  function drawTitle(svg, title, x, y) {
    if (!title) return;
    svg.appendChild(el("text", { x, y, "text-anchor": "start", class: "chart-title" }, [title]));
  }
  function axisY(svg, padL, padT, innerH, min, max, format) {
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const y = padT + (innerH / ticks) * i;
      const v = max - ((max - min) / ticks) * i;
      svg.appendChild(el("text", { x: padL - 6, y: y + 4, "text-anchor": "end", class: "tick" }, [format(v)]));
    }
  }

  function areaLine(slot, items, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat;
    const padL = opts.padL != null ? opts.padL : yFmt ? (opts.niceTicks ? 52 : 42) : 20, padR = opts.padR != null ? opts.padR : opts.niceTicks ? 16 : 22, padT = opts.padT != null ? opts.padT : title ? 42 : 26, padB = 32;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const inset = Math.max(0, opts.inset || 0); /* inner left/right padding so first/last points and the line stay off the frame */
    const dataMax = Math.max(...items.map((d) => d[1]));
    const dataMin = Math.min(...items.map((d) => d[1]));
    const span = Math.max(1, dataMax - dataMin);
    let min = span / dataMax < 0.35 ? Math.max(0, dataMin - span * 0.55) : 0;
    let max = dataMax + span * 0.18;
    if (opts.yMin != null) min = opts.yMin;
    if (opts.yMax != null) max = opts.yMax;
    const nice = opts.niceTicks && min === 0 ? niceTicks(Math.max(dataMax, 1)) : null;
    if (nice) max = nice.max;
    const svg = svgRoot(w, h, opts.label || title || "");
    const paint = addPaint(svg);
    drawTitle(svg, title, 16, 20);
    if (nice) {
      for (let v = 0; v <= max + 1e-6; v += nice.step) {
        const gy = padT + innerH * (1 - v / max);
        svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: gy, y2: gy, stroke: "rgba(255,255,255,.07)", "stroke-width": 1 }));
        svg.appendChild(el("text", { x: padL - 8, y: gy + 4, "text-anchor": "end", class: "tick" }, [tickFmt(v)]));
      }
    } else {
      gridY(svg, padL, padR, padT, innerH, w);
      if (yFmt) axisY(svg, padL, padT, innerH, min, max, yFmt);
    }
    const plotW = innerW - inset * 2;
    const pts = items.map((d, i) => {
      const x = padL + inset + (items.length === 1 ? plotW / 2 : (i / (items.length - 1)) * plotW);
      const y = padT + innerH - ((d[1] - min) / (max - min || 1)) * innerH;
      return [x, y];
    });
    const line = smoothPath(pts);
    const area = line + "L" + pts[pts.length - 1][0] + " " + (padT + innerH) + "L" + pts[0][0] + " " + (padT + innerH) + "Z";
    svg.appendChild(el("path", { d: area, fill: paint.area, class: "donut-grow" }));
    svg.appendChild(el("path", { d: line, fill: "none", stroke: paint.line, "stroke-width": 2.5, "stroke-linecap": "round", filter: paint.glow, class: "donut-grow" }));
    const hits = [];
    items.forEach((d, i) => {
      const g = el("g", { class: "hit" });
      g.appendChild(el("rect", { x: pts[i][0] - innerW / items.length / 2, y: padT, width: innerW / items.length, height: innerH, fill: "transparent" }));
      g.appendChild(el("circle", { cx: pts[i][0], cy: pts[i][1], r: 4, fill: HOT, class: "mark", filter: paint.glow }));
      svg.appendChild(g);
      hits.push(g);
    });
    let ticks = opts.ticks || [];
    if (innerW < 160 && ticks.length > 4) {
      ticks = ticks.filter((_, i, arr) => i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2));
    }
    if (inset && ticks.length > 2) { /* drop labels that would collide (min 34px apart); first and last always kept */
      const avg = ticks.length > 1 ? (pts[ticks[ticks.length - 1].i][0] - pts[ticks[0].i][0]) / (ticks.length - 1) : 0, minGap = Math.max(34, avg * 0.6), last = ticks[ticks.length - 1], kept = [ticks[0]]; /* a short final interval (e.g. M55 next to M60) drops the crowding label */
      ticks.slice(1, -1).forEach((tk) => {
        if (pts[tk.i][0] - pts[kept[kept.length - 1].i][0] >= minGap && pts[last.i][0] - pts[tk.i][0] >= minGap) kept.push(tk);
      });
      kept.push(last); ticks = kept;
    }
    ticks.forEach((tk, ti) => {
      let anchor = "middle", tx = pts[tk.i][0];
      if (!inset && ti === 0) { anchor = "start"; tx = padL; }
      if (!inset && ti === ticks.length - 1) { anchor = "end"; tx = w - padR; }
      svg.appendChild(el("text", { x: tx, y: h - 14, "text-anchor": anchor, class: "tick" }, [tk.label]));
    });
    if (opts.highlight != null && pts[opts.highlight]) {
      const hi = opts.highlight;
      const label = opts.format ? opts.format(items[hi][1]) : String(items[hi][1]);
      const tw = Math.max(36, measureLabel(label, 11) + 14);
      const x = pts[hi][0], y = pts[hi][1];
      let bx = x - tw / 2, by = y - 30;
      if (hi === pts.length - 1) { bx = x - tw - 12; by = y - 10; }
      if (by < padT - 4) by = Math.min(y + 12, padT + innerH - 24);
      if (bx < padL) bx = padL;
      if (bx + tw > w - 8) bx = w - 8 - tw;
      svg.appendChild(el("rect", { x: bx, y: by, width: tw, height: 20, rx: 6, fill: "#222322" }));
      svg.appendChild(el("text", { x: bx + tw / 2, y: by + 14, "text-anchor": "middle", class: "row-label", style: "font-size:11px" }, [label]));
      svg.appendChild(el("circle", { cx: x, cy: y, r: 6, fill: "none", stroke: "#A9DCEF", "stroke-width": 2 }));
    }
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${items[i][2] || items[i][0]}</b><span>${opts.format ? opts.format(items[i][1]) : money(items[i][1])}</span>`);
  }

  function multiLine(slot, series, labels, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat;
    const padL = yFmt ? 42 : 20, padR = 22, padB = 32;
    const legendFont = 11;
    const itemWs = series.map((s) => 8 + 8 + measureLabel(s.name, legendFont) + 10);
    const avail = w - 28;
    const oneRow = itemWs.reduce((a, b) => a + b, 0) <= avail;
    const legendCols = oneRow ? series.length : 2;
    const legendRows = Math.ceil(series.length / legendCols);
    const padT = (title ? 38 : 22) + legendRows * 16;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const all = series.flatMap((s) => s.values);
    const dataMax = Math.max(...all), dataMin = Math.min(...all);
    const span = Math.max(1, dataMax - dataMin);
    let min = Math.max(0, dataMin - span * 0.2), max = dataMax + span * 0.12;
    if (opts.yMin != null) min = opts.yMin;
    if (opts.yMax != null) max = opts.yMax;
    const svg = svgRoot(w, h, opts.label || title || "");
    const paint = addPaint(svg);
    drawTitle(svg, title, 16, 18);
    gridY(svg, padL, padR, padT, innerH, w);
    if (yFmt) axisY(svg, padL, padT, innerH, min, max, yFmt);
    if (oneRow) {
      let lx = 16;
      const legendY = title ? 32 : 14;
      series.forEach((s, i) => {
        svg.appendChild(el("rect", { x: lx, y: legendY, width: 7, height: 7, rx: 2, fill: s.color }));
        svg.appendChild(el("text", { x: lx + 11, y: legendY + 8, class: "row-label", style: "font-size:" + legendFont + "px" }, [s.name]));
        lx += itemWs[i];
      });
    } else {
      const colW = (w - 28) / 2;
      series.forEach((s, i) => {
        const lx = 16 + (i % 2) * colW;
        const legendY = (title ? 32 : 14) + Math.floor(i / 2) * 16;
        svg.appendChild(el("rect", { x: lx, y: legendY, width: 7, height: 7, rx: 2, fill: s.color }));
        svg.appendChild(el("text", { x: lx + 11, y: legendY + 8, class: "row-label", style: "font-size:" + legendFont + "px" }, [s.name]));
      });
    }
    const n = labels.length;
    const hits = [];
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => {
        const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
        const y = padT + innerH - ((v - min) / (max - min || 1)) * innerH;
        return [x, y];
      });
      svg.appendChild(el("path", { d: smoothPath(pts), fill: "none", stroke: s.color, "stroke-width": si === 0 ? 2.6 : 2, "stroke-linecap": "round", filter: si === 0 ? paint.glow : "", class: "donut-grow" }));
    });
    labels.forEach((lab, i) => {
      const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const g = el("g", { class: "hit" });
      g.appendChild(el("rect", { x: x - innerW / n / 2, y: padT, width: innerW / n, height: innerH, fill: "transparent" }));
      series.forEach((s) => {
        const y = padT + innerH - ((s.values[i] - min) / (max - min || 1)) * innerH;
        g.appendChild(el("circle", { cx: x, cy: y, r: 3.5, fill: s.color, class: "mark" }));
      });
      svg.appendChild(g);
      hits.push(g);
    });
    const tickIdx = opts.tickIdx || (n <= 4 ? labels.map((_, i) => i) : [0, Math.round((n - 1) / 2), n - 1]);
    tickIdx.forEach((i) => {
      if (!labels[i]) return;
      let anchor = "middle", tx = padL + (i / (n - 1)) * innerW;
      if (i === 0) { anchor = "start"; tx = padL; }
      if (i === n - 1) { anchor = "end"; tx = w - padR; }
      svg.appendChild(el("text", { x: tx, y: h - 14, "text-anchor": anchor, class: "tick" }, [labels[i]]));
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${labels[i]}</b>` + series.map((s) => `<span>${s.name} ${opts.format ? opts.format(s.values[i]) : money(s.values[i])}</span>`).join(""));
  }

  function stacked(slot, cats, series, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const padL = 20, padR = 20, padT = title ? 56 : 40, padB = 32;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const totals = cats.map((_, i) => series.reduce((s, ser) => s + ser.values[i], 0));
    const max = Math.max(...totals) * 1.08;
    const svg = svgRoot(w, h, opts.label || title || "");
    addPaint(svg);
    drawTitle(svg, title, padL, 18);
    gridY(svg, padL, padR, padT, innerH, w);
    let lx = padL;
    const legendY = title ? 32 : 14;
    const nameW = w < 220 ? 5.6 : 7.0;
    series.forEach((s) => {
      svg.appendChild(el("rect", { x: lx, y: legendY, width: 8, height: 8, rx: 2, fill: s.color }));
      svg.appendChild(el("text", { x: lx + 12, y: legendY + 8, class: "row-label" }, [s.name]));
      lx += 13 + s.name.length * nameW + 12;
    });
    const gap = innerW / cats.length;
    const bw = Math.max(12, Math.min(42, gap * 0.58));
    const hits = [];
    cats.forEach((cat, i) => {
      let y0 = padT + innerH;
      const g = el("g", { class: "hit bar-grow", style: reduce ? "" : `animation-delay:${i * 40}ms` });
      g.appendChild(el("rect", { x: padL + gap * i, y: padT, width: gap, height: innerH, fill: "transparent" }));
      series.forEach((s) => {
        const bh = (s.values[i] / max) * innerH;
        y0 -= bh;
        g.appendChild(el("rect", {
          x: padL + gap * i + (gap - bw) / 2, y: y0, width: bw, height: Math.max(bh, 0),
          rx: 3, fill: s.color, class: "mark"
        }));
      });
      svg.appendChild(g);
      hits.push(g);
      const tx = padL + gap * i + gap / 2;
      svg.appendChild(el("text", { x: tx, y: h - 14, "text-anchor": "middle", class: "axis-label" }, [cat]));
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => {
      const rows = series.map((s) => s.name + " " + money(s.values[i] * 1000)).join(" · ");
      return `<b>${cats[i]}</b><span>${rows}</span>`;
    });
  }

  let measureCtx;
  function measureLabel(str, size) {
    try {
      if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
      measureCtx.font = "400 " + size + "px Switzer, sans-serif";
      return measureCtx.measureText(str).width;
    } catch (err) {
      return str.length * size * 0.58;
    }
  }

  function donut(slot, items, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const inset = 16;
    const titleH = title ? 28 : 10;
    const total = items.reduce((s, d) => s + d[1], 0);
    const svg = svgRoot(w, h, opts.label || title || "");
    const paint = addPaint(svg);
    drawTitle(svg, title, inset, 20);
    const labels = items.map((d) => d[2] + "  " + d[0]);
    const longest = labels.reduce((a, b) => (a.length >= b.length ? a : b), "");
    const plotTop = titleH;
    const plotH = h - plotTop - inset;
    const innerW = w - inset * 2;
    const gap = 16;
    const rowH = 22;
    const noLegend = opts.legend === "none";
    let d, r, r0, cx, cy, legendFont, legendX, legendTop;
    if (noLegend) {
      d = Math.min(innerW, plotH) * 0.9;
      d = Math.max(96, Math.min(d, plotH - 6, innerW));
      r = d / 2; r0 = r * 0.62;
      cx = w / 2;
      cy = plotTop + plotH / 2;
    } else if (innerW < 340) {
      /* narrow cards (phones): legend stacked under the ring so labels never clip */
      legendFont = 12;
      const legendBlockH = items.length * rowH;
      d = Math.min(innerW * 0.62, plotH - legendBlockH - 14);
      d = Math.max(72, d);
      r = d / 2; r0 = r * 0.62;
      cx = w / 2;
      cy = plotTop + r + 2;
      legendX = inset;
      legendTop = cy + r + 12;
    } else {
      const targetD = Math.min(innerW * 0.58, plotH - 6);
      legendFont = (innerW < 240 ? 11 : 13);
      function legendNeed(font) {
        return 8 + 10 + measureLabel(longest, font) + 2;
      }
      let avail = innerW - targetD - gap;
      while (legendFont > 10 && legendNeed(legendFont) > avail) {
        legendFont -= 0.5;
      }
      let legendW = legendNeed(legendFont);
      d = targetD;
      if (legendW + gap + d > innerW) {
        d = Math.max(innerW * 0.52, innerW - gap - legendW);
        avail = innerW - d - gap;
        while (legendFont > 10 && legendNeed(legendFont) > avail) legendFont -= 0.5;
        legendW = Math.min(avail, legendNeed(legendFont));
        if (d + gap + legendW > innerW) d = Math.max(72, innerW - gap - legendW);
      }
      d = Math.min(d, plotH - 6, innerW * 0.62);
      d = Math.max(72, d);
      r = d / 2; r0 = r * 0.62;
      cx = inset + r;
      cy = plotTop + plotH / 2;
      legendX = inset + d + gap;
      const legendBlockH = items.length * rowH;
      legendTop = cy - legendBlockH / 2;
      legendTop = Math.max(plotTop, Math.min(legendTop, h - inset - legendBlockH));
    }

    let a0 = -Math.PI / 2;
    const hits = [];
    const colors = ["#359BC5", "#4FB3DC", "#6CC0E0", "#A9DCEF", "#D6EEF7"];
    function arc(a1, a2, rad, rin) {
      const large = a2 - a1 > Math.PI ? 1 : 0;
      const x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1);
      const x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2);
      const xi1 = cx + rin * Math.cos(a2), yi1 = cy + rin * Math.sin(a2);
      const xi2 = cx + rin * Math.cos(a1), yi2 = cy + rin * Math.sin(a1);
      return `M${x1} ${y1} A${rad} ${rad} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${rin} ${rin} 0 ${large} 0 ${xi2} ${yi2} Z`;
    }
    items.forEach((dItem, i) => {
      const span = (dItem[1] / total) * Math.PI * 2;
      const g = el("g", { class: "hit donut-grow", style: reduce ? "" : `animation-delay:${i * 60}ms` });
      g.appendChild(el("path", { d: arc(a0, a0 + span - 0.02, r, r0), fill: colors[i % colors.length], class: "mark", filter: i === 0 ? paint.glow : "" }));
      svg.appendChild(g);
      hits.push(g);
      a0 += span;
    });

    const centerLabel = opts.center || (total >= 1000 ? "$" + Math.round(total / 1000) + "k" : money(total));
    const maxCenterW = r0 * 2 * 0.68;
    const maxCenterH = r0 * 0.82;
    let centerSize = Math.min(24, maxCenterH, maxCenterW / Math.max(3.4, centerLabel.length * 0.66));
    centerSize = Math.max(9, centerSize);
    const subSize = Math.max(8, Math.min(11, r0 * 0.32, centerSize * 0.48));
    svg.appendChild(el("text", {
      x: cx, y: cy - subSize * 0.1, "text-anchor": "middle", class: "donut-center",
      style: "font-size:" + centerSize + "px !important"
    }, [centerLabel]));
    svg.appendChild(el("text", {
      x: cx, y: cy + Math.min(r0 * 0.52, centerSize * 0.7), "text-anchor": "middle", class: "axis-label",
      style: "font-size:" + subSize + "px !important"
    }, [opts.sub || "TOTAL"]));

    if (!noLegend) {
      items.forEach((dItem, i) => {
        const ly = legendTop + i * rowH;
        svg.appendChild(el("rect", { x: legendX, y: ly + 5, width: 8, height: 8, rx: 2, fill: colors[i % colors.length] }));
        svg.appendChild(el("text", {
          x: legendX + 16, y: ly + 13, class: "row-label",
          style: "font-size:" + legendFont + "px"
        }, [dItem[2] + "  " + dItem[0]]));
      });
    }
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${items[i][0]}</b><span>${items[i][2]} · ${money(items[i][1])}</span>`);
  }

  /* clean axis ticks (display only): 1/2/2.5/5 x 10^n steps, ~4 intervals */
  function niceTicks(rawMax) {
    const m = rawMax > 0 ? rawMax * 1.04 : 1, p0 = Math.pow(10, Math.floor(Math.log10(m / 4)));
    let best = null;
    [p0 / 10, p0, p0 * 10].forEach((p) => [1, 2, 2.5, 5].forEach((k) => {
      const step = k * p, n = Math.ceil(m / step - 1e-9);
      if (n < 3 || n > 5) return;
      const c = { max: n * step, step, n };
      if (!best || c.max < best.max - 1e-9 || (Math.abs(c.max - best.max) < 1e-9 && Math.abs(c.n - 4) < Math.abs(best.n - 4))) best = c;
    }));
    return best || { max: m, step: m / 4 };
  }
  function tickFmt(v) {
    if (v >= 1e6) return "$" + (+(v / 1e6).toFixed(2)).toString() + "M";
    if (v >= 1000) return "$" + (+(v / 1000).toFixed(1)).toString() + "k";
    return "$" + Math.round(v);
  }
  if (typeof window !== "undefined") { window.BUNiceTicks = niceTicks; window.BUTickFmt = tickFmt; }
  function vBars(slot, items, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat;
    const padL = opts.padL != null ? opts.padL : yFmt ? (opts.niceTicks ? 52 : 42) : 20, padR = opts.padR != null ? opts.padR : opts.niceTicks ? 12 : 20, padT = opts.padT != null ? opts.padT : title ? 42 : 24, padB = 32;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const rawMax = Math.max(0, ...items.map((d) => Number(d[1]) || 0));
    const nice = opts.niceTicks ? niceTicks(rawMax) : null;
    const max = nice ? nice.max : (rawMax > 0 ? rawMax : 1) * 1.18;
    const svg = svgRoot(w, h, opts.label || title || "");
    addPaint(svg);
    drawTitle(svg, title, 16, 20);
    if (nice) {
      for (let v = 0; v <= max + 1e-6; v += nice.step) {
        const y = padT + innerH * (1 - v / max);
        svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: y, y2: y, stroke: "rgba(255,255,255,.07)", "stroke-width": 1 }));
        svg.appendChild(el("text", { x: padL - 6, y: y + 4, "text-anchor": "end", class: "tick" }, [tickFmt(v)]));
      }
    } else {
      gridY(svg, padL, padR, padT, innerH, w);
      if (yFmt) axisY(svg, padL, padT, innerH, 0, max, yFmt);
    }
    const gap = innerW / items.length;
    const bw = Math.max(12, Math.min(44, gap * 0.58));
    const hits = [];
    const slim = innerW < 160;
    const fills = opts.colors || ["#247A9C", "#359BC5", "#4FB3DC", "#6CC0E0", "#A9DCEF"];
    items.forEach((d, i) => {
      const bh = (d[1] / max) * innerH;
      const x = padL + gap * i + (gap - bw) / 2;
      const y = padT + innerH - bh;
      const g = el("g", { class: "hit bar-grow", style: reduce ? "" : `animation-delay:${i * 40}ms` });
      g.appendChild(el("rect", { x: padL + gap * i, y: padT, width: gap, height: innerH, fill: "transparent" }));
      g.appendChild(el("rect", { x, y, width: bw, height: Math.max(bh, 0), rx: 3, fill: (typeof d[3] === "string" && d[3]) || fills[i % fills.length], class: "mark" })); /* optional per-bar color (Loan A paid weeks) */
      svg.appendChild(g);
      hits.push(g);
      const thin = items.length > 6 && gap < 26; /* narrow: every other label, anchored on the last bar (same rule as the Five-Year chart) */
      if ((thin ? (items.length - 1 - i) % 2 === 0 : (items.length <= 8 || !slim || i % 2 === 0 || i === items.length - 1))) {
        let lab = String(d[0]);
        if (Math.max(measureLabel(lab, 12), lab.length * 7.4) > gap - 4) lab = lab.replace(/^End Year (\d+) Sale$/, "Y$1 Sale").replace(/^Year\s*(\d+)$/, "Y$1"); /* narrow cards: short tick, full name stays in the tooltip */
        if (Math.max(measureLabel(lab, 12), lab.length * 7.4) > gap - 4) lab = lab.replace(/^Y\d+ Sale$/, "Sale");
        svg.appendChild(el("text", { x: padL + gap * i + gap / 2, y: h - 14, "text-anchor": "middle", class: "tick xlab" }, [lab]));
      }
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${(typeof items[i][2] === 'string' && items[i][2]) || items[i][0]}</b><span>${opts.format ? opts.format(items[i][1]) : money(items[i][1])}</span>`);
  }

  function hBars(slot, items, opts) {
    opts = opts || {};
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat;
    const fmt = opts.format || money;
    const rowH = 30;
    const padT = title ? 44 : 22;
    const padB = 32;
    const padR = 62;
    const labelFont = 16;
    const maxLabelW = Math.max(48, ...items.map((d) => measureLabel(String(d[0] || ""), labelFont)));
    slot.style.height = (padT + Math.max(items.length, 1) * rowH + padB) + "px";
    void slot.offsetHeight;
    const { w, h } = box(slot);
    const padL = Math.min(w < 480 ? Math.max(88, Math.floor(w * 0.38)) : 190, Math.max(88, Math.ceil(maxLabelW) + 14));
    function fitLabel(s) {
      if (w >= 480) return s;
      const budget = Math.max(56, padL - 12);
      if (measureLabel(s, labelFont) <= budget) return s;
      let cut = s;
      while (cut.length > 4 && measureLabel(cut + "…", labelFont) > budget) cut = cut.slice(0, -1);
      return cut + "…";
    }
    const innerW = Math.max(40, w - padL - padR);
    const innerH = Math.max(rowH, h - padT - padB);
    const rawMax = Math.max(0, ...items.map((d) => Number(d[1]) || 0));
    const max = (rawMax > 0 ? rawMax : 1) * 1.12;
    const svg = svgRoot(w, h, opts.label || title || "");
    const paint = addPaint(svg);
    drawTitle(svg, title, 16, 20);
    const tickStep = innerW < 160 ? 4 : innerW < 280 ? 2 : 1;
    for (let i = 0; i <= 4; i += tickStep) {
      const x = padL + (innerW / 4) * i;
      svg.appendChild(el("line", { x1: x, x2: x, y1: padT - 4, y2: padT + innerH, stroke: "rgba(255,255,255,.07)", "stroke-width": 1 }));
      if (yFmt) {
        const last = i + tickStep > 4;
        svg.appendChild(el("text", { x: x, y: h - 12, "text-anchor": i === 0 ? "start" : last ? "end" : "middle", class: "tick" }, [yFmt((max / 4) * i)]));
      }
    }
    const fills = opts.colors || ["#247A9C", "#359BC5", "#4FB3DC", "#6CC0E0", "#A9DCEF"];
    const hits = [];
    const bh = Math.max(10, Math.min(16, rowH - 12));
    items.forEach((d, i) => {
      const y = padT + i * rowH;
      const val = Number(d[1]) || 0;
      const label = String(d[0] || "");
      const valText = yFmt ? yFmt(val) : fmt(val);
      svg.appendChild(el("text", {
        x: padL - 10, y: y + 16, "text-anchor": "end", class: "row-label"
      }, [fitLabel(label)]));
      const bw = Math.max(val > 0 ? 4 : 0, val / max * innerW);
      const g = el("g", { class: "hit" });
      g.appendChild(el("rect", { x: padL, y: y, width: innerW + padR - 8, height: rowH, fill: "transparent" }));
      const bar = el("rect", {
        x: padL, y: y + (rowH - bh) / 2, width: bw, height: bh, rx: 3,
        fill: fills[i % fills.length], class: "mark bar-grow-x",
        filter: i % 3 === 0 ? paint.glow : "",
        style: reduce ? "" : "animation-delay:" + (i * 35) + "ms"
      });
      g.appendChild(bar);
      svg.appendChild(el("text", {
        x: padL + bw + 8, y: y + 16, "text-anchor": "start", class: "tick bar-val"
      }, [valText]));
      svg.appendChild(g);
      hits.push(g);
    });
    slot.appendChild(svg);
    slot._dim = box(slot);
    bindHot(slot, hits, (i) => `<b>${items[i][2] || items[i][0]}</b><span>${fmt(items[i][1])}</span>`);
  }

  function radial(slot) {
    const score = 78;
    const { w, h } = box(slot);
    const cx = w / 2, cy = h / 2;
    const r = Math.max(42, Math.min(w, h) / 2 - 24);
    const r0 = r * 0.72;
    const svg = svgRoot(w, h, "Pursue score 78");
    const paint = addPaint(svg);
    const C = 2 * Math.PI;
    function ring(from, to, fill, glow) {
      const a1 = -Math.PI / 2 + from * C;
      const a2 = -Math.PI / 2 + to * C;
      const large = a2 - a1 > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const xi1 = cx + r0 * Math.cos(a2), yi1 = cy + r0 * Math.sin(a2);
      const xi2 = cx + r0 * Math.cos(a1), yi2 = cy + r0 * Math.sin(a1);
      return el("path", {
        d: `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${r0} ${r0} 0 ${large} 0 ${xi2} ${yi2} Z`,
        fill, class: "mark", filter: glow || ""
      });
    }
    svg.appendChild(ring(0, 0.999, "rgba(255,255,255,.06)"));
    const g = el("g", { class: "hit donut-grow" });
    g.appendChild(ring(0, score / 100, "#359BC5", paint.glow));
    svg.appendChild(g);
    svg.appendChild(el("text", { x: cx, y: cy + 2, "text-anchor": "middle", class: "donut-center" }, [String(score)]));
    svg.appendChild(el("text", { x: cx, y: cy + 22, "text-anchor": "middle", class: "axis-label" }, ["SCORE"]));
    slot.appendChild(svg);
    bindHot(slot, [g], () => `<b>Pursue score</b><span>${score} of 100</span>`);
  }

  function heatmap(slot) {
    const rents = [-10, -5, 0, 5, 10];
    const caps = [6.5, 6.0, 5.5, 5.0, 4.5];
    const cells = [];
    rents.forEach((rent, r) => {
      caps.forEach((cap, c) => {
        const irr = Math.round((18 + (rent / 5) * 2.2 + ((5.5 - cap) / 0.5) * 1.6) * 10) / 10;
        const dscr = Math.round((1.35 + (rent / 5) * 0.08 + ((5.5 - cap) / 0.5) * 0.04) * 100) / 100;
        cells.push({ r, c, rent, cap, irr, dscr });
      });
    });
    const irrs = cells.map((d) => d.irr);
    const lo = Math.min(...irrs), hi = Math.max(...irrs);
    const { w, h } = box(slot);
    const title = slot.getAttribute("data-title") || "IRR sensitivity: exit cap vs. rent growth";
    const inset = 18;
    const padL = 78, padR = inset, padT = 72, padB = 18;
    const cw = (w - padL - padR) / caps.length, ch = (h - padT - padB) / rents.length;
    const svg = svgRoot(w, h, title);
    addPaint(svg);
    const titleSize = w < 360 ? 11 : 13;
    svg.appendChild(el("text", { x: inset, y: 20, "text-anchor": "start", class: "chart-title", "font-size": titleSize }, [title]));
    svg.appendChild(el("text", { x: padL + (w - padL - padR) / 2, y: 42, "text-anchor": "middle", class: "axis-label" }, ["EXIT CAP"]));
    caps.forEach((cap, c) => {
      svg.appendChild(el("text", { x: padL + c * cw + cw / 2, y: 58, "text-anchor": "middle", class: "tick" }, [cap.toFixed(1) + "%"]));
    });
    const axisY = padT + (h - padT - padB) / 2;
    svg.appendChild(el("text", {
      x: 16, y: axisY, "text-anchor": "middle", class: "axis-label",
      transform: "rotate(-90 16 " + axisY + ")"
    }, ["RENT GROWTH"]));
    const hits = [];
    cells.forEach((d, i) => {
      const t = (d.irr - lo) / (hi - lo || 1);
      const fill = t > 0.75 ? "#1A6484" : t > 0.5 ? "#247A9C" : t > 0.3 ? "#6CC0E0" : t > 0.15 ? "#A9DCEF" : "#D6EEF7";
      const ink = cellInk(fill);
      const g = el("g", { class: "hit donut-grow", style: reduce ? "" : `animation-delay:${i * 8}ms` });
      const x = padL + d.c * cw + 3, y = padT + d.r * ch + 3;
      g.appendChild(el("rect", { x, y, width: cw - 6, height: ch - 6, rx: 6, fill, class: "mark" }));
      g.appendChild(el("text", {
        x: x + (cw - 6) / 2, y: y + (ch - 6) / 2 + 4, "text-anchor": "middle",
        class: "row-val " + (ink === "#FFFFFF" ? "paper" : "ink")
      }, [d.irr.toFixed(1) + "%"]));
      svg.appendChild(g);
      hits.push(g);
    });
    rents.forEach((rent, r) => {
      svg.appendChild(el("text", { x: padL - 8, y: padT + r * ch + ch / 2 + 4, "text-anchor": "end", class: "tick" }, [(rent > 0 ? "+" : "") + rent + "%"]));
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => {
      const d = cells[i];
      return `<b>${(d.rent > 0 ? "+" : "") + d.rent}% rent · ${d.cap.toFixed(2)}% exit cap</b><span>IRR ${d.irr.toFixed(1)}% · DSCR ${d.dscr.toFixed(2)}x</span>`;
    });
  }

  function spark(slot) {
    const raw = (slot.getAttribute("data-series") || "1,2,3").split(",").map(Number);
    const { w, h } = box(slot);
    const pad = 2;
    const min = Math.min(...raw), max = Math.max(...raw);
    const svg = svgRoot(w, h, "");
    const paint = addPaint(svg);
    const pts = raw.map((v, i) => {
      const x = pad + (i / (raw.length - 1)) * (w - pad * 2);
      const y = pad + (h - pad * 2) - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return [x, y];
    });
    const line = smoothPath(pts);
    const area = line + "L" + pts[pts.length - 1][0] + " " + (h - pad) + "L" + pts[0][0] + " " + (h - pad) + "Z";
    svg.appendChild(el("path", { d: area, fill: paint.area }));
    svg.appendChild(el("path", { d: line, fill: "none", stroke: "#4FB3DC", "stroke-width": 1.6, "stroke-linecap": "round", filter: paint.glow }));
    slot.appendChild(svg);
  }

  const RENT_S = [1820, 1835, 1840, 1850, 1860, 1855, 1870, 1885, 1890, 1905, 1910, 1920];
  const RENT_M = [1790, 1800, 1810, 1815, 1825, 1830, 1840, 1845, 1855, 1860, 1870, 1875];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const TREND = [
    ["January", 412000], ["February", 418000], ["March", 421000], ["April", 419000],
    ["May", 428000], ["June", 436000], ["July", 441000], ["August", 438000],
    ["September", 449000], ["October", 458000], ["November", 465000], ["December", 472000]
  ];
  const SALE = [
    ["Year 1", 1840000], ["Year 2", 1910000], ["Year 3", 1985000],
    ["Year 4", 2060000], ["Year 5", 2140000], ["Year 6", 2235000], ["Year 7", 2320000]
  ];
  const RENT_COLL = [
    ["JAN", 51200], ["FEB", 49800], ["MAR", 53100],
    ["APR", 52400], ["MAY", 54800], ["JUN", 56100]
  ];
  const CASH = [
    ["Year 1", 42000], ["Year 2", 47000], ["Year 3", 52500], ["Year 4", 58500],
    ["Year 5", 65000], ["Year 6", 72000], ["Year 7 sale", 385000]
  ];
  const MIX = [
    ["Structure", 420000, "53%"],
    ["Land", 180000, "22%"],
    ["Site", 90000, "11%"],
    ["Soft", 60000, "8%"],
    ["Conting.", 50000, "6%"]
  ];


  function posNeg(slot, items, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat || ((v) => (v > 0 ? "+" : "") + Math.round(v) + "%");
    const padL = opts.padL != null ? opts.padL : 42, padR = opts.padR != null ? opts.padR : 14, padT = opts.padT != null ? opts.padT : title ? 42 : 24, padB = 32;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const ext = Math.max(...items.map((d) => Math.abs(d[1])), 1) * 1.25;
    const min = -ext, max = ext;
    const svg = svgRoot(w, h, opts.label || title || "");
    addPaint(svg);
    drawTitle(svg, title, 16, 20);
    gridY(svg, padL, padR, padT, innerH, w);
    axisY(svg, padL, padT, innerH, min, max, yFmt);
    const zeroY = padT + innerH * (max / (max - min));
    svg.appendChild(el("line", { x1: padL, x2: w - padR, y1: zeroY, y2: zeroY, stroke: "rgba(255,255,255,.22)", "stroke-width": 1 }));
    const gap = innerW / items.length;
    const bw = Math.max(8, Math.min(28, gap * 0.5));
    const hits = [];
    items.forEach((d, i) => {
      const bh = (Math.abs(d[1]) / (max - min)) * innerH;
      const x = padL + gap * i + (gap - bw) / 2;
      const y = d[1] >= 0 ? zeroY - bh : zeroY;
      const g = el("g", { class: "hit bar-grow", style: reduce ? "" : `animation-delay:${i * 40}ms` });
      g.appendChild(el("rect", { x: padL + gap * i, y: padT, width: gap, height: innerH, fill: "transparent" }));
      g.appendChild(el("rect", {
        x, y, width: bw, height: Math.max(bh, 1), rx: 3,
        fill: d[1] >= 0 ? "#359BC5" : "#1A6484", class: "mark"
      }));
      svg.appendChild(g);
      hits.push(g);
      if (!(items.length > 6 && gap < 26) || (items.length - 1 - i) % 2 === 0) svg.appendChild(el("text", { x: padL + gap * i + gap / 2, y: h - 14, "text-anchor": "middle", class: "tick" }, [d[0]]));
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${items[i][2] || items[i][0]}</b><span>${opts.format ? opts.format(items[i][1]) : yFmt(items[i][1])}</span>`);
  }

  function scatterPlot(slot, groups, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const padL = 44, padR = 18, padB = 36;
    const nameW0 = 6.2;
    let lrows = 1, lx0 = 16;
    groups.forEach((g) => {
      const need = 16 + g.name.length * nameW0 + 10;
      if (lx0 + need > w - 16 && lx0 > 16) { lrows += 1; lx0 = 16; }
      lx0 += need;
    });
    const padT = (title ? 40 : 24) + lrows * 16;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const all = groups.flatMap((g) => g.points);
    const xMin = opts.xMin != null ? opts.xMin : Math.min(...all.map((p) => p.x)) * 0.9;
    const xMax = opts.xMax != null ? opts.xMax : Math.max(...all.map((p) => p.x)) * 1.06;
    const yMin = opts.yMin != null ? opts.yMin : 0;
    const yMax = opts.yMax != null ? opts.yMax : Math.max(...all.map((p) => p.y)) * 1.15;
    const sx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const sy = (y) => padT + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;
    const svg = svgRoot(w, h, opts.label || title || "");
    const paint = addPaint(svg);
    drawTitle(svg, title, 16, 18);
    gridY(svg, padL, padR, padT, innerH, w);
    axisY(svg, padL, padT, innerH, yMin, yMax, opts.yFormat || ((v) => "$" + Math.round(v)));
    (opts.xTicks || [xMin, (xMin + xMax) / 2, xMax]).forEach((xv, ti, arr) => {
      let anchor = "middle", tx = sx(xv);
      if (ti === 0) { anchor = "start"; tx = padL; }
      if (ti === arr.length - 1) { anchor = "end"; tx = w - padR; }
      svg.appendChild(el("text", { x: tx, y: h - 14, "text-anchor": anchor, class: "axis-label" }, [opts.xFormat ? opts.xFormat(xv) : String(Math.round(xv))]));
    });
    let lx = 16;
    let legendY = title ? 34 : 16;
    groups.forEach((g) => {
      const need = 16 + g.name.length * 6.2 + 10;
      if (lx + need > w - 16 && lx > 16) { lx = 16; legendY += 16; }
      svg.appendChild(el("circle", { cx: lx + 4, cy: legendY, r: 4, fill: g.color }));
      svg.appendChild(el("text", { x: lx + 12, y: legendY + 4, class: "row-label", style: "font-size:11px" }, [g.name]));
      lx += need;
    });
    (opts.trends || []).forEach((tr) => {
      const pts = tr.xs.map((x) => [sx(x), sy(tr.fn(x))]);
      svg.appendChild(el("path", {
        d: smoothPath(pts), fill: "none", stroke: tr.color || "#4FB3DC",
        "stroke-width": tr.dash ? 1.6 : 2.2,
        "stroke-dasharray": tr.dash ? "5 4" : "",
        "stroke-linecap": "round", class: "donut-grow"
      }));
    });
    const hits = [];
    groups.forEach((g) => {
      g.points.forEach((pt) => {
        const gnode = el("g", { class: "hit" });
        gnode.appendChild(el("circle", { cx: sx(pt.x), cy: sy(pt.y), r: 12, fill: "transparent" }));
        gnode.appendChild(el("circle", { cx: sx(pt.x), cy: sy(pt.y), r: 4.5, fill: g.color, class: "mark", filter: paint.glow }));
        svg.appendChild(gnode);
        hits.push({ node: gnode, group: g, pt });
        if (pt.label) {
          const lx2 = sx(pt.x) + 8, ly2 = sy(pt.y) - 6;
          const clampedX = Math.min(w - padR - 4, lx2);
          svg.appendChild(el("text", { x: clampedX, y: ly2, class: "row-label", style: "font-size:11px" }, [pt.label]));
        }
      });
    });
    slot.appendChild(svg);
    bindHot(slot, hits.map((h) => h.node), (i) => {
      const { group, pt } = hits[i];
      return `<b>${pt.label || group.name}</b><span>${opts.xTip ? opts.xTip(pt.x) : Math.round(pt.x) + " sf"}</span><span>${opts.yTip ? opts.yTip(pt.y) : "$" + Math.round(pt.y) + " / sf"}</span>`;
    });
  }

  function rangeBars(slot, items, opts) {
    const { w, h } = box(slot);
    const title = opts.title || slot.getAttribute("data-title") || "";
    const yFmt = opts.yFormat || ((v) => v.toFixed(1) + "%");
    const padL = 42, padR = 14, padT = title ? 42 : 24, padB = 32;
    const innerW = w - padL - padR, innerH = h - padT - padB;
    const min = Math.min(...items.map((d) => d.low)) - 0.6;
    const max = Math.max(...items.map((d) => d.high)) + 0.6;
    const svg = svgRoot(w, h, opts.label || title || "");
    addPaint(svg);
    drawTitle(svg, title, 16, 20);
    gridY(svg, padL, padR, padT, innerH, w);
    axisY(svg, padL, padT, innerH, min, max, yFmt);
    const gap = innerW / items.length;
    const bw = Math.max(10, Math.min(20, gap * 0.36));
    const hits = [];
    const fills = ["#1A6484", "#247A9C", "#359BC5", "#4FB3DC", "#6CC0E0", "#A9DCEF"];
    items.forEach((d, i) => {
      const y1 = padT + innerH - ((d.high - min) / (max - min)) * innerH;
      const y2 = padT + innerH - ((d.low - min) / (max - min)) * innerH;
      const x = padL + gap * i + (gap - bw) / 2;
      const g = el("g", { class: "hit bar-grow", style: reduce ? "" : `animation-delay:${i * 40}ms` });
      g.appendChild(el("rect", { x: padL + gap * i, y: padT, width: gap, height: innerH, fill: "transparent" }));
      g.appendChild(el("rect", {
        x, y: y1, width: bw, height: Math.max(y2 - y1, 4), rx: 6,
        fill: fills[i % fills.length], class: "mark"
      }));
      svg.appendChild(g);
      hits.push(g);
      svg.appendChild(el("text", { x: padL + gap * i + gap / 2, y: h - 14, "text-anchor": "middle", class: "tick" }, [d.short || d.name]));
    });
    slot.appendChild(svg);
    bindHot(slot, hits, (i) => `<b>${items[i].name}</b><span>${items[i].low.toFixed(1)}% – ${items[i].high.toFixed(1)}%</span>`);
  }

  const makers = {
    trend: (slot) => areaLine(slot, TREND, {
      label: slot.getAttribute("data-title") || "Neighborhood price trend",
      title: slot.getAttribute("data-title") || "",
      ticks: [{ i: 0, label: "JAN" }, { i: 3, label: "APR" }, { i: 6, label: "JUL" }, { i: 9, label: "OCT" }]
    }),
    sale: (slot) => areaLine(slot, SALE, {
      label: "Projected sale value",
      title: "Projected sale value",
      ticks: SALE.map((d, i) => ({ i, label: "Y" + (i + 1) }))
    }),
    rentbars: (slot) => vBars(slot, RENT_COLL, {
      label: "Monthly rent collections",
      title: "Monthly rent collections"
    }),
    cashflow: (slot) => areaLine(slot, CASH, {
      label: "Cash flow over the hold",
      title: "Cash flow over the hold",
      ticks: CASH.map((d, i) => ({ i, label: i === 6 ? "SALE" : "Y" + (i + 1) }))
    }),
    multiline: (slot) => multiLine(slot, [
      { name: "In-place", color: "#4FB3DC", values: RENT_S },
      { name: "Market", color: "#A9DCEF", values: RENT_M }
    ], MONTHS, { label: "In-place rent versus market", title: slot.getAttribute("data-title") || "In-place rent vs market" }),
    stacked: (slot) => stacked(slot, ["Q1", "Q2", "Q3", "Q4"], [
      { name: "Land", color: "#359BC5", values: [180, 0, 0, 0] },
      { name: "Site", color: "#4FB3DC", values: [40, 50, 0, 0] },
      { name: "Hard", color: "#6CC0E0", values: [60, 140, 160, 60] },
      { name: "Soft", color: "#D6EEF7", values: [15, 20, 30, 80] }
    ], { label: "Build cost by quarter", title: "Build cost by quarter" }),
    donut: (slot) => donut(slot, MIX, { label: "Cost to build", title: "Cost to build" }),
    occ: (slot) => donut(slot, [
      ["Studio", 18, "18%"], ["1-bed", 31, "31%"], ["2-bed", 29, "29%"],
      ["3-bed", 16, "16%"], ["Vacant", 6, "6%"]
    ], { label: "Occupancy", title: "Occupancy", center: "94%", sub: "OCCUPIED", legend: "none" }),
    renttype: (slot) => vBars(slot, [
      ["Stu", 1250], ["1BR", 1680], ["2BR", 2140], ["3BR", 2680], ["TH", 3120]
    ], {
      label: "Rent by Unit Type", title: "Rent by Unit Type",
      yFormat: (v) => v >= 1000 ? "$" + (v / 1000).toFixed(1) + "k" : "$" + Math.round(v),
      format: (v) => "$" + Math.round(v).toLocaleString("en-US") + " / mo"
    }),
    leaseup: (slot) => areaLine(slot, [
      ["Month 1", 28], ["Month 2", 36], ["Month 3", 48], ["Month 4", 59],
      ["Month 6", 74], ["Month 9", 88], ["Month 12", 95]
    ], {
      label: "Lease-Up Curve", title: "Lease-Up Curve",
      format: (v) => Math.round(v) + "%",
      yFormat: (v) => Math.round(v) + "%",
      highlight: 6,
      yMin: 0, yMax: 100,
      ticks: [{ i: 0, label: "M1" }, { i: 2, label: "M3" }, { i: 4, label: "M6" }, { i: 6, label: "M12" }]
    }),
    noivar: (slot) => posNeg(slot, [
      ["J", 8.2, "January"], ["F", 3.4, "February"], ["M", -6.1, "March"],
      ["A", -2.8, "April"], ["M", 5.5, "May"], ["J", 11.2, "June"],
      ["J", -4.0, "July"], ["A", 7.1, "August"], ["S", 2.4, "September"],
      ["O", -3.2, "October"], ["N", 4.8, "November"], ["D", 6.0, "December"]
    ], { label: "Monthly NOI Variance", title: "Monthly NOI Variance" }),
    rentgrowth: (slot) => multiLine(slot, [
      { name: "Austin", color: "#359BC5", values: [3.1, 6.4, 8.2, 4.6, 3.2, 2.8] },
      { name: "Dallas", color: "#4FB3DC", values: [2.4, 4.1, 5.6, 3.8, 2.9, 2.4] },
      { name: "Denver", color: "#6CC0E0", values: [2.8, 5.2, 6.1, 3.4, 2.2, 1.9] },
      { name: "Tampa", color: "#A9DCEF", values: [3.6, 7.1, 9.4, 5.8, 3.6, 3.1] }
    ], ["’21", "’22", "’23", "’24", "’25", "’26"], {
      label: "Rent Growth by Market", title: "Rent Growth by Market",
      format: (v) => v.toFixed(1) + "%",
      yFormat: (v) => v.toFixed(0) + "%",
      yMin: 0, yMax: 10,
      tickIdx: [0, 2, 4]
    }),
    ppsqft: (slot) => scatterPlot(slot, [
      { name: "Eastside", color: "#359BC5", points: [
        { x: 3200, y: 48 }, { x: 4100, y: 44 }, { x: 5600, y: 39 }, { x: 7200, y: 34 }, { x: 8800, y: 31 }
      ]},
      { name: "River", color: "#4FB3DC", points: [
        { x: 2400, y: 62 }, { x: 3000, y: 58 }, { x: 4500, y: 51 }, { x: 6100, y: 46 }
      ]},
      { name: "Midtown", color: "#6CC0E0", points: [
        { x: 2800, y: 54 }, { x: 3900, y: 49 }, { x: 5200, y: 43 }, { x: 7000, y: 38 }
      ]},
      { name: "West End", color: "#A9DCEF", points: [
        { x: 3600, y: 41 }, { x: 4800, y: 37 }, { x: 6400, y: 33 }, { x: 9100, y: 28 }
      ]},
      { name: "Northgate", color: "#D6EEF7", points: [
        { x: 4200, y: 36 }, { x: 5800, y: 32 }, { x: 7600, y: 27 }, { x: 10200, y: 23 }
      ]}
    ], {
      label: "Price per SQFT vs. Lot Size", title: "Price per SQFT vs. Lot Size",
      xMin: 1800, xMax: 11200, yMin: 15, yMax: 72,
      xTicks: [2000, 6000, 10000],
      xFormat: (v) => (v / 1000).toFixed(0) + "k sf",
      yFormat: (v) => "$" + Math.round(v),
      xTip: (x) => Math.round(x).toLocaleString("en-US") + " sf lot",
      yTip: (y) => "$" + Math.round(y) + " / sf",
      trends: [
        { dash: true, color: "#6CC0E0", xs: [2000, 3500, 5000, 6500, 8000, 9500, 11000], fn: (x) => 75.137 - 0.008651 * x + 0.0000003762 * x * x },
        { dash: false, color: "#4FB3DC", xs: [2000, 3500, 5000, 6500, 8000, 9500, 11000], fn: (x) => 63.122 - 0.004083 * x }
      ]
    }),
    costmix: (slot) => donut(slot, [
      ["Hard", 195000, "53%"], ["Land", 62000, "17%"], ["Soft", 48000, "13%"],
      ["Site", 33000, "9%"], ["Conting.", 27000, "7%"]
    ], { label: "Total Project Cost", title: "Total Project Cost", legend: "none" }),
    coc: (slot) => areaLine(slot, [
      ["Year 1", 4.2], ["Year 2", 5.1], ["Year 3", 6.8], ["Year 4", 5.9],
      ["Year 5", 7.6], ["Year 6", 8.4], ["Year 7", 9.1]
    ], {
      label: "Cash on Cash", title: "Cash on Cash",
      format: (v) => v.toFixed(1) + "%",
      yFormat: (v) => v.toFixed(0) + "%",
      ticks: [
        { i: 0, label: "Y1" }, { i: 2, label: "Y3" }, { i: 4, label: "Y5" }, { i: 6, label: "Y7" }
      ]
    }),
    caprange: (slot) => rangeBars(slot, [
      { name: "Multifamily", short: "MF", low: 4.6, high: 5.5 },
      { name: "Industrial", short: "IND", low: 5.1, high: 6.4 },
      { name: "Retail", short: "RTL", low: 6.0, high: 7.4 },
      { name: "Office", short: "OFF", low: 6.8, high: 8.6 },
      { name: "Hotel", short: "HTL", low: 7.2, high: 9.1 }
    ], { label: "Cap Rate Range by Type", title: "Cap Rate Range by Type" }),
    radial: (slot) => radial(slot),
    heatmap: (slot) => heatmap(slot),
    spark: (slot) => spark(slot)
  };

  function paintCustom(slot) {
    const p = slot._payload;
    if (!p) return false;
    slot.innerHTML = "";
    if (p.kind === "multiLine") multiLine(slot, p.a, p.b, p.c || {});
    else if (p.kind === "stacked") stacked(slot, p.a, p.b, p.c || {});
    else if (p.kind === "donut") donut(slot, p.a, p.b || {});
    else if (p.kind === "vBars") vBars(slot, p.a, p.b || {});
    else if (p.kind === "hBars") hBars(slot, p.a, p.b || {});
    else if (p.kind === "areaLine") areaLine(slot, p.a, p.b || {});
    else if (p.kind === "posNeg") posNeg(slot, p.a, p.b || {});
    else if (p.kind === "rangeBars") rangeBars(slot, p.a, p.b || {});
    else if (p.kind === "scatterPlot") scatterPlot(slot, p.a, p.b || {});
    else if (p.kind === "spark") spark(slot);
    else return false;
    return true;
  }
  function mount(slot) {
    const dim = box(slot);
    const keep = slot.classList.contains("in-view");
    slot._dim = dim;
    if (paintCustom(slot)) {
      slot._dim = box(slot);
      requestAnimationFrame(function(){ slot.classList.add("in-view"); });
      return;
    }
    const type = slot.getAttribute("data-chart");
    if (!type && !slot._payload) {
      requestAnimationFrame(function(){ slot.classList.add("in-view"); });
      return;
    }
    slot.innerHTML = "";
    if (makers[type]) makers[type](slot);
    requestAnimationFrame(function(){ slot.classList.add("in-view"); });
  }
  function reveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".chart-slot").forEach((n) => {
      io.observe(n);
      const r = n.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) n.classList.add("in-view");
    });
  }
  function draw(slot, kind, a, b, c) {
    if (!slot) return;
    slot.classList.add("chart-slot");
    slot._payload = { kind: kind, a: a, b: b, c: c };
    if (!slot.getAttribute("data-chart")) slot.setAttribute("data-chart", kind);
    mount(slot);
    if (window.ResizeObserver && !slot._buRo) {
      slot._buRo = true;
      observeSlot(slot);
    }
  }
  let rd;
  const pending = new Set();
  function observeSlot(slot) {
    if (!window.ResizeObserver) return;
    if (!window.__BUChartsRO) {
      window.__BUChartsRO = new ResizeObserver((entries) => {
        entries.forEach((en) => pending.add(en.target));
        clearTimeout(rd);
        rd = setTimeout(() => {
          pending.forEach((n) => {
            const dim = box(n);
            if (!n._dim || Math.abs(n._dim.w - dim.w) > 2 || Math.abs(n._dim.h - dim.h) > 2) mount(n);
          });
          pending.clear();
        }, 80);
      });
    }
    try { window.__BUChartsRO.observe(slot); } catch (err) {}
  }
  document.querySelectorAll("[data-chart]").forEach(mount);
  reveal();
  document.querySelectorAll(".chart-slot").forEach(observeSlot);

  window.BUCharts = {
    draw: draw,
    mount: mount,
    money: money,
    addPaint: addPaint,
    el: el,
    box: box,
    svgRoot: svgRoot,
    bindHot: bindHot,
    drawTitle: drawTitle,
    gridY: gridY,
    HOT: HOT,
    areaLine: areaLine,
    donut: donut,
    vBars: vBars,
    hBars: hBars,
    posNeg: posNeg,
    multiLine: multiLine,
    stacked: stacked
  };
})();
