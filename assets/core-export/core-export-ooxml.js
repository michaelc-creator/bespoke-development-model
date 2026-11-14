/* Bespoke Core OOXML export — clone styled template zip, patch mapped values/caches/charts only.
   Requires: JSZip, BespokeCoreExport.buildPatches, __BU_CORE_EXPORT_TEMPLATE_B64
   Do not rebuild with SheetJS XLSX.write. */
(function (root) {
  'use strict';

  var SHEET_PARTS = {
    'Summary': 'xl/worksheets/sheet1.xml',
    'Inputs': 'xl/worksheets/sheet2.xml',
    'Project Costs': 'xl/worksheets/sheet3.xml',
    'NOI & Cash Flow': 'xl/worksheets/sheet4.xml',
    'Deal Financials': 'xl/worksheets/sheet5.xml',
    'Loan A - Construction': 'xl/worksheets/sheet6.xml',
    'Loan B - Permanent': 'xl/worksheets/sheet7.xml',
    'Supporting Tables': 'xl/worksheets/sheet8.xml'
  };

  function b64ToUint8(b64) {
    if (typeof Buffer !== 'undefined' && typeof atob !== 'function') {
      return Buffer.from(b64, 'base64');
    }
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatNum(v) {
    if (v == null || v === '' || !isFinite(Number(v))) return null;
    var n = Number(v);
    if (Object.is(n, -0)) n = 0;
    var s = String(n);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
      s = n.toFixed(12).replace(/\.?0+$/, '');
    }
    return s;
  }

  function cellRegex(addr) {
    return new RegExp('<c\\b([^>]*\\br="' + addr + '"[^>]*)>([\\s\\S]*?)<\\/c>', 'g');
  }

  function hasFormula(inner) {
    return /<f[\s>]/.test(inner);
  }

  function patchValueCell(xml, addr, value, type) {
    var re = cellRegex(addr);
    var found = false;
    var next = xml.replace(re, function (full, attrs, inner) {
      found = true;
      if (hasFormula(inner)) {
        throw new Error('Refusing to overwrite formula cell ' + addr);
      }
      var style = '';
      var m = attrs.match(/\ss="(\d+)"/);
      if (m) style = ' s="' + m[1] + '"';
      if (type === 's' || typeof value === 'string') {
        var text = value == null ? '' : String(value);
        return '<c r="' + addr + '"' + style + ' t="inlineStr"><is><t' +
          (text !== text.trim() || !text ? ' xml:space="preserve"' : '') + '>' +
          xmlEscape(text) + '</t></is></c>';
      }
      var num = formatNum(value);
      if (num == null) {
        return '<c r="' + addr + '"' + style + '/>';
      }
      return '<c r="' + addr + '"' + style + ' t="n"><v>' + num + '</v></c>';
    });
    if (!found) throw new Error('Mapped cell not found in sheet XML: ' + addr);
    return next;
  }

  function patchFormulaCache(xml, addr, value) {
    var re = cellRegex(addr);
    var found = false;
    var next = xml.replace(re, function (full, attrs, inner) {
      found = true;
      if (!hasFormula(inner)) {
        throw new Error('Expected formula at ' + addr + ' when writing cache');
      }
      var num = formatNum(value);
      if (num == null) {
        return '<c' + attrs.replace(/\st="[^"]*"/, '') + '>' + inner.replace(/<v>[\s\S]*?<\/v>/g, '') + '</c>';
      }
      if (/<v>[\s\S]*?<\/v>/.test(inner)) {
        inner = inner.replace(/<v>[\s\S]*?<\/v>/, '<v>' + num + '</v>');
      } else {
        inner = inner.replace(/(<\/f>)/, '$1<v>' + num + '</v>');
      }
      if (!/\st=/.test(attrs)) attrs += ' t="n"';
      else attrs = attrs.replace(/\st="[^"]*"/, ' t="n"');
      return '<c' + attrs + '>' + inner + '</c>';
    });
    if (!found) throw new Error('Formula cache cell not found: ' + addr);
    return next;
  }

  function rebuildCache(block, values, isStr) {
    var ptCount = values.length;
    var pts = values.map(function (v, i) {
      if (isStr) {
        return '<c:pt idx="' + i + '"><c:v>' + xmlEscape(v == null ? '' : String(v)) + '</c:v></c:pt>';
      }
      var num = formatNum(v);
      return '<c:pt idx="' + i + '"><c:v>' + (num == null ? '0' : num) + '</c:v></c:pt>';
    }).join('');
    if (isStr) {
      return block.replace(/<c:strCache>[\s\S]*?<\/c:strCache>/, '<c:strCache><c:ptCount val="' + ptCount + '"/>' + pts + '</c:strCache>');
    }
    return block.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/, function (nc) {
      var fc = (nc.match(/<c:formatCode>[\s\S]*?<\/c:formatCode>/) || ['<c:formatCode>General</c:formatCode>'])[0];
      return '<c:numCache>' + fc + '<c:ptCount val="' + ptCount + '"/>' + pts + '</c:numCache>';
    });
  }

  function updateChartXml(xml, upd) {
    xml = xml.replace(/<c:cat>[\s\S]*?<\/c:cat>/, function (cat) {
      cat = cat.replace(/<c:f>[\s\S]*?<\/c:f>/, '<c:f>' + xmlEscape(upd.catRef) + '</c:f>');
      return rebuildCache(cat, upd.cats, true);
    });
    xml = xml.replace(/<c:val>[\s\S]*?<\/c:val>/, function (val) {
      val = val.replace(/<c:f>[\s\S]*?<\/c:f>/, '<c:f>' + xmlEscape(upd.valueRef) + '</c:f>');
      return rebuildCache(val, upd.values, false);
    });
    return xml;
  }

  function applyPatchesToZip(zip, patches) {
    var names = Object.keys(SHEET_PARTS);
    return Promise.all(names.map(function (name) {
      return zip.file(SHEET_PARTS[name]).async('string').then(function (xml) {
        return { name: name, xml: xml };
      });
    })).then(function (loaded) {
      var sheetXml = {};
      loaded.forEach(function (x) { sheetXml[x.name] = x.xml; });

      (patches.cells || []).forEach(function (c) {
        if (!sheetXml[c.sheet]) throw new Error('Unknown sheet ' + c.sheet);
        sheetXml[c.sheet] = patchValueCell(sheetXml[c.sheet], c.addr, c.value, c.type);
      });
      (patches.formulaCaches || []).forEach(function (c) {
        if (!sheetXml[c.sheet]) throw new Error('Unknown sheet ' + c.sheet);
        sheetXml[c.sheet] = patchFormulaCache(sheetXml[c.sheet], c.addr, c.cache);
      });

      names.forEach(function (name) {
        zip.file(SHEET_PARTS[name], sheetXml[name]);
      });

      return Promise.all((patches.chartUpdates || []).map(function (u) {
        var f = zip.file(u.part);
        if (!f) throw new Error('Missing chart part ' + u.part);
        return f.async('string').then(function (xml) {
          zip.file(u.part, updateChartXml(xml, u));
        });
      }));
    });
  }

  function loadTemplateZip() {
    if (typeof JSZip === 'undefined') {
      return Promise.reject(new Error('JSZip is required for styled Core export'));
    }
    var b64 = root.__BU_CORE_EXPORT_TEMPLATE_B64;
    if (!b64) return Promise.reject(new Error('Embedded Core export template is missing'));
    return JSZip.loadAsync(b64ToUint8(b64));
  }

  function buildWorkbook(B, inputs) {
    if (!root.BespokeCoreExport || typeof root.BespokeCoreExport.buildPatches !== 'function') {
      return Promise.reject(new Error('BespokeCoreExport.buildPatches is missing'));
    }
    var patches;
    try {
      patches = root.BespokeCoreExport.buildPatches(B, inputs);
    } catch (e) {
      return Promise.reject(e);
    }
    return loadTemplateZip().then(function (zip) {
      ['xl/charts/chart1.xml','xl/charts/chart2.xml','xl/charts/chart3.xml','xl/charts/chart4.xml'].forEach(function (p) {
        if (!zip.file(p)) throw new Error('Template missing ' + p);
      });
      return applyPatchesToZip(zip, patches).then(function () {
        var genType = (typeof Blob !== 'undefined') ? 'blob' : 'nodebuffer';
        return zip.generateAsync({
          type: genType,
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }).then(function (out) {
          return { blob: out, patches: patches, filename: patches.filename || 'Bespoke-Core-Inputs-Outputs.xlsx' };
        });
      });
    });
  }

  function triggerDownload(blob, filename) {
    if (typeof document === 'undefined') return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = label || 'Preparing download…';
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = btn.dataset.idleLabel || 'Download Model';
    }
  }

  function showExportError(err) {
    var msg = (err && err.message) ? err.message : String(err);
    try { console.error('[bespoke-core] export failed', err); } catch (e) {}
    if (typeof alert === 'function') alert('Could not download underwriting model:\n' + msg);
  }

  function downloadCurrentCase(opts) {
    opts = opts || {};
    var B = root.BespokeCore;
    if (!B) return Promise.reject(new Error('BespokeCore engine is not loaded'));
    var inputs = opts.inputs || B.loadInputs();
    var btn = opts.button || (typeof document !== 'undefined' ? document.getElementById('outExport') : null);
    setBusy(btn, true);
    return buildWorkbook(B, inputs).then(function (res) {
      if (opts.returnOnly) return res;
      triggerDownload(res.blob, res.filename);
      return res;
    }).catch(function (err) {
      showExportError(err);
      throw err;
    }).finally(function () {
      setBusy(btn, false);
    });
  }

  function wireDownloadButton() {
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('outExport');
    if (!btn || btn.dataset.coreExportWired === '1') return;
    btn.dataset.coreExportWired = '1';
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      downloadCurrentCase({ button: btn }).catch(function () {});
    });
  }

  root.BespokeCoreExportOOXML = {
    buildWorkbook: buildWorkbook,
    downloadCurrentCase: downloadCurrentCase,
    wireDownloadButton: wireDownloadButton,
    SHEET_PARTS: SHEET_PARTS,
    VERSION: 1
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireDownloadButton);
    else wireDownloadButton();
  }
})(typeof window !== 'undefined' ? window : this);
