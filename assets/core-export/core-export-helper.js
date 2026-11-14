/* Bespoke Core workbook export helper.
   Returns cell patches from the live engine. Does not hardcode example case values.
   Core executor: clone export-assets/core-export-template.xlsx (JSZip), patch only
   mapped <c> values, leave every <f> formula node in place, write formulaCaches
   into each formula cell's cached <v>, and refresh chart caches/ranges.
   Do not rebuild the workbook with SheetJS XLSX.write — that drops OOXML styles and charts.
*/
(function (root) {
  'use strict';

  function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
  function pct(enginePct) { var v = num(enginePct); return v == null ? null : v / 100; }
  function moneyNeg(v) { var n = num(v); return n == null ? null : -n; }
  function costLine(cost, key) {
    var secs = (cost && cost.sections) || [];
    for (var i = 0; i < secs.length; i++) {
      var lines = (secs[i].data && secs[i].data.lines) || secs[i].lines || [];
      for (var j = 0; j < lines.length; j++) if (lines[j].key === key) return lines[j].value;
    }
    return null;
  }
  function opex(ret, key) {
    var lines = (ret && ret.opexLines) || [];
    for (var i = 0; i < lines.length; i++) if (lines[i].key === key) return lines[i].value;
    return null;
  }
  function cell(sheet, addr, value, type) {
    return { sheet: sheet, addr: addr, value: value, type: type || (typeof value === 'string' ? 's' : 'n') };
  }
  function cache(sheet, addr, value) {
    return { sheet: sheet, addr: addr, cache: value };
  }
  function basisLabel(basis) {
    if (basis === 'dwelling') return 'Per Dwelling Unit';
    if (basis === 'project') return 'Whole Project';
    return basis || '';
  }
  function lifecycle(B, inp) {
    if (root.BespokeLoanLifecycle && typeof root.BespokeLoanLifecycle.data === 'function') {
      return root.BespokeLoanLifecycle.data(B, inp);
    }
    return null;
  }
  function weeklyA(B, inp, life) {
    if (life && life.a) return life.a;
    return [];
  }

  function buildPatches(B, rawInputs) {
    var inp = B.normalizeInputs(rawInputs || B.loadInputs());
    var cost = B.compute(inp);
    var fin = B.computeFinancing(inp);
    var ret = B.computeReturns(inp, cost);
    var hold = B.computeHold(inp, cost);
    var life = lifecycle(B, inp);
    var weeks = weeklyA(B, inp, life);
    var years = (hold && hold.years) || [];
    var con = (fin && fin.construction) || {};
    var cells = [];
    var formulaCaches = [];
    var labels = [];

    /* ---- Inputs (blue) ---- */
    cells.push(cell('Inputs', 'B4', inp.addr || '', 's'));
    cells.push(cell('Inputs', 'B5', inp.units));
    cells.push(cell('Inputs', 'B6', inp.area));
    cells.push(cell('Inputs', 'B7', cost.factoryCalc && cost.factoryCalc.cost != null ? cost.factoryCalc.cost : null)); /* owner Nov 11: factory cost = factory $/sf x total sf (no separate override) */
    cells.push(cell('Inputs', 'B8', inp.land));
    cells.push(cell('Inputs', 'B12', inp.permit));
    cells.push(cell('Inputs', 'B13', inp.clear));
    cells.push(cell('Inputs', 'B14', inp.water));
    cells.push(cell('Inputs', 'B15', inp.power));
    cells.push(cell('Inputs', 'B16', inp.landscape));
    cells.push(cell('Inputs', 'B17', inp.foundation));
    cells.push(cell('Inputs', 'B18', inp.drive));
    cells.push(cell('Inputs', 'B22', inp.rent)); /* per dwelling when basis is dwelling; never units*rent */
    cells.push(cell('Inputs', 'B23', pct(inp.exitCapPct)));
    cells.push(cell('Inputs', 'B27', inp.opexTaxes));
    cells.push(cell('Inputs', 'B28', inp.opexInsurance));
    cells.push(cell('Inputs', 'B29', inp.opexUtilities));
    cells.push(cell('Inputs', 'B30', pct(inp.maintenanceManagementPct)));
    cells.push(cell('Inputs', 'B34', basisLabel(inp.rentBasis), 's'));
    cells.push(cell('Inputs', 'B35', pct(inp.vacancyPct)));
    cells.push(cell('Inputs', 'B36', pct(inp.aLtvPct)));
    cells.push(cell('Inputs', 'B37', pct(inp.finRateA)));
    var aPay = ret.aPayoff, aOut = ret.aOutstandingAtDelivery;
    var payoffDisp = (aOut && Math.abs((aPay || 0) - aOut) < 1e-6) ? '100%' : (aOut ? Math.round((aPay / aOut) * 100) + '%' : '');
    cells.push(cell('Inputs', 'B38', payoffDisp, 's'));
    cells.push(cell('Inputs', 'B39', pct(inp.permLoanRate))); /* permanent rate; construction finRateB drives Deal Financials A12 via con.rateB */
    cells.push(cell('Inputs', 'B40', pct(inp.bLtvPct)));
    cells.push(cell('Inputs', 'B41', pct(inp.sellCostPct)));
    cells.push(cell('Inputs', 'B42', inp.holdYears));
    cells.push(cell('Inputs', 'B43', '30 years', 's'));
    formulaCaches.push(cache('Inputs', 'B19',
      (num(inp.permit) || 0) + (num(inp.clear) || 0) + (num(inp.water) || 0) + (num(inp.power) || 0) +
      (num(inp.landscape) || 0) + (num(inp.foundation) || 0) + (num(inp.drive) || 0)));

    /* ---- Project Costs ---- */
    var pc = [
      ['B4', 'land'], ['B5', 'landClose'], ['B6', 'permit'], ['B7', 'clear'],
      ['B8', 'water'], ['B9', 'power'], ['B10', 'landscape'], ['B11', 'foundation'],
      ['B12', 'drive'], ['B13', 'factory'], ['B14', 'transport'], ['B15', 'crane'], ['B16', 'marriage']
    ];
    var pcVals = {};
    pc.forEach(function (pair) {
      var v = costLine(cost, pair[1]);
      pcVals[pair[0]] = v;
      cells.push(cell('Project Costs', pair[0], v));
    });
    var e4 = (num(pcVals.B4) || 0) + (num(pcVals.B5) || 0);
    var e5 = ['B6','B7','B8','B9','B10','B11','B12'].reduce(function (s, a) { return s + (num(pcVals[a]) || 0); }, 0);
    var e6 = ['B13','B14','B15','B16'].reduce(function (s, a) { return s + (num(pcVals[a]) || 0); }, 0);
    var e7 = e4 + e5 + e6;
    formulaCaches.push(cache('Project Costs', 'E4', e4));
    formulaCaches.push(cache('Project Costs', 'E5', e5));
    formulaCaches.push(cache('Project Costs', 'E6', e6));
    formulaCaches.push(cache('Project Costs', 'E7', e7));
    formulaCaches.push(cache('Project Costs', 'B17', e7));
    formulaCaches.push(cache('Project Costs', 'F4', e7 ? e4 / e7 : 0));
    formulaCaches.push(cache('Project Costs', 'F5', e7 ? e5 / e7 : 0));
    formulaCaches.push(cache('Project Costs', 'F6', e7 ? e6 / e7 : 0));
    formulaCaches.push(cache('Project Costs', 'F7', 1));

    /* ---- NOI Year 1 ---- */
    var ns = 'NOI & Cash Flow';
    cells.push(cell(ns, 'B4', ret.grossAnnualRent));
    cells.push(cell(ns, 'B5', moneyNeg(ret.vacancyLoss)));
    cells.push(cell(ns, 'B7', moneyNeg(opex(ret, 'taxes'))));
    cells.push(cell(ns, 'B8', moneyNeg(opex(ret, 'insurance'))));
    cells.push(cell(ns, 'B9', moneyNeg(opex(ret, 'utilities'))));
    cells.push(cell(ns, 'B10', moneyNeg(opex(ret, 'management'))));
    cells.push(cell(ns, 'B13', moneyNeg(ret.annualDebtService)));
    var b6 = (num(ret.grossAnnualRent) || 0) + (moneyNeg(ret.vacancyLoss) || 0);
    var b11 = (moneyNeg(opex(ret, 'taxes')) || 0) + (moneyNeg(opex(ret, 'insurance')) || 0) +
              (moneyNeg(opex(ret, 'utilities')) || 0) + (moneyNeg(opex(ret, 'management')) || 0);
    var b12 = b6 + b11;
    var b14 = b12 + (moneyNeg(ret.annualDebtService) || 0);
    formulaCaches.push(cache(ns, 'B6', b6));
    formulaCaches.push(cache(ns, 'B11', b11));
    formulaCaches.push(cache(ns, 'B12', b12));
    formulaCaches.push(cache(ns, 'B14', b14));

    var col = { 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };
    var rowStore = { 19: {}, 20: {}, 21: {}, 22: {}, 23: {}, 24: {}, 25: {}, 26: {}, 27: {} };
    years.forEach(function (y) {
      var c = col[y.year];
      if (!c) return;
      var vals = {
        19: y.gross, 20: moneyNeg(y.vacancy), 21: moneyNeg(y.management),
        22: moneyNeg(y.taxes), 23: moneyNeg(y.insurance), 24: moneyNeg(y.electricity),
        26: moneyNeg(y.debtService)
      };
      Object.keys(vals).forEach(function (r) {
        cells.push(cell(ns, c + r, vals[r]));
        rowStore[r][c] = num(vals[r]) || 0;
      });
      var noi = (vals[19] || 0) + (vals[20] || 0) + (vals[21] || 0) + (vals[22] || 0) + (vals[23] || 0) + (vals[24] || 0);
      var cf = noi + (vals[26] || 0);
      rowStore[25][c] = noi;
      rowStore[27][c] = cf;
      formulaCaches.push(cache(ns, c + '25', noi));
      formulaCaches.push(cache(ns, c + '27', cf));
    });
    [19, 20, 21, 22, 23, 24, 25, 26, 27].forEach(function (r) {
      var sum = ['B', 'C', 'D', 'E', 'F'].reduce(function (s, c) { return s + (rowStore[r][c] || 0); }, 0);
      formulaCaches.push(cache(ns, 'G' + r, sum));
    });
    cells.push(cell(ns, 'F28', hold.salePrice));
    cells.push(cell(ns, 'F29', moneyNeg(hold.sellingCost)));
    cells.push(cell(ns, 'F30', moneyNeg(hold.loanBalance)));
    var f31 = (num(hold.salePrice) || 0) + (moneyNeg(hold.sellingCost) || 0) + (moneyNeg(hold.loanBalance) || 0);
    formulaCaches.push(cache(ns, 'F31', f31));
    formulaCaches.push(cache(ns, 'G28', hold.salePrice));
    formulaCaches.push(cache(ns, 'G29', moneyNeg(hold.sellingCost)));
    formulaCaches.push(cache(ns, 'G30', moneyNeg(hold.loanBalance)));
    formulaCaches.push(cache(ns, 'G31', f31));
    formulaCaches.push(cache(ns, 'B32', rowStore[27].B));
    formulaCaches.push(cache(ns, 'C32', rowStore[27].C));
    formulaCaches.push(cache(ns, 'D32', rowStore[27].D));
    formulaCaches.push(cache(ns, 'E32', rowStore[27].E));
    var f32 = (rowStore[27].F || 0) + f31;
    formulaCaches.push(cache(ns, 'F32', f32));
    formulaCaches.push(cache(ns, 'G32', (rowStore[27].B || 0) + (rowStore[27].C || 0) + (rowStore[27].D || 0) + (rowStore[27].E || 0) + f32));

    /* ---- Deal Financials ---- */
    var ds = 'Deal Financials';
    cells.push(cell(ds, 'B4', hold.salePrice));
    cells.push(cell(ds, 'B5', moneyNeg(hold.sellingCost)));
    cells.push(cell(ds, 'B6', moneyNeg(hold.loanBalance)));
    cells.push(cell(ds, 'B8', hold.operatingCashTotal));
    cells.push(cell(ds, 'B10', ret.totalCost));
    cells.push(cell(ds, 'B11', con.aInterest));
    cells.push(cell(ds, 'B12', con.bInterest));
    cells.push(cell(ds, 'B14', moneyNeg(ret.lenderB)));
    cells.push(cell(ds, 'B17', hold.npv10));
    cells.push(cell(ds, 'B18', hold.equityMultiple));
    cells.push(cell(ds, 'B19', hold.irrOperating));
    cells.push(cell(ds, 'B20', hold.irr));
    var rateA = Math.round((con.rateA || 0) * 100);
    var rateB = Math.round((con.rateB || 0) * 100);
    var aUsed = (num(fin.aPeak) || 0) > 0; /* owner Nov 9 09:30: no Lender A; factory 10% deposit cash + 90% Lender B on delivery */
    labels.push(cell(ds, 'A11', aUsed ? 'One-time construction interest, Lender A ' + rateA + '% factory' : 'Lender A not used (factory 10% deposit cash, 90% balance Lender B on delivery)', 's'));
    labels.push(cell(ds, 'A12', 'One-time construction interest, Lender B ' + rateB + '% construction', 's'));
    labels.push(cell(ds, 'A6', 'Less Lender B payoff after 60 payments (IO from project month 0)', 's'));
    labels.push(cell(ds, 'A20', 'Total investment IRR (project month 0 + 5-year hold; sale at month 60)', 's'));
    labels.push(cell('Loan A - Construction', 'A1', aUsed ? 'Loan A — Factory Progress Payments (60% of factory · repaid by Loan B at delivery Day ' + (fin.aPayoffDay || 49) + ')' : 'Loan A — NOT USED (all zero). Factory: 10% deposit borrower cash Day ' + ((fin.factoryPayments && fin.factoryPayments[0].day) || 7) + ', 90% balance Lender B Day ' + ((fin.days && fin.days.delivery) || 49), 's'));
    var dfB7 = (num(hold.salePrice) || 0) + (moneyNeg(hold.sellingCost) || 0) + (moneyNeg(hold.loanBalance) || 0);
    var dfB9 = dfB7 + (num(hold.operatingCashTotal) || 0);
    var dfB13 = (num(ret.totalCost) || 0) + (num(con.aInterest) || 0) + (num(con.bInterest) || 0);
    var dfB15 = dfB13 + (moneyNeg(ret.lenderB) || 0);
    var dfB16 = dfB9 - dfB15;
    formulaCaches.push(cache(ds, 'B7', dfB7));
    formulaCaches.push(cache(ds, 'B9', dfB9));
    formulaCaches.push(cache(ds, 'B13', dfB13));
    formulaCaches.push(cache(ds, 'B15', dfB15));
    formulaCaches.push(cache(ds, 'B16', dfB16));

    /* ---- Summary (IRR / verdict stay engine values) ---- */
    var hurdle = pct(inp.yocHurdle != null ? inp.yocHurdle : 10);
    var verdict = (hold.irr != null && hold.irr >= hurdle) ? 'Pass' : 'Fail';
    cells.push(cell('Summary', 'B10', hold.irr));
    cells.push(cell('Summary', 'B11', verdict, 's'));
    formulaCaches.push(cache('Summary', 'B5', ret.annualDebtService ? b12 / ret.annualDebtService : null));
    formulaCaches.push(cache('Summary', 'B6', hold.salePrice));
    formulaCaches.push(cache('Summary', 'B7', dfB13 ? b12 / dfB13 : null));
    formulaCaches.push(cache('Summary', 'B8', dfB15 ? b14 / dfB15 : null));
    formulaCaches.push(cache('Summary', 'B9', b14 ? dfB15 / b14 : null));
    /* owner Nov 9 09:30: template B9 is a locked formula (cash invested / Year-1 cash flow, no sale); label it honestly. Outputs Payback tile includes the Year-5 sale. */
    labels.push(cell('Summary', 'A9', 'Operating-only payback, no sale (Outputs Payback incl. Year-5 sale)', 's'));

    /* ---- Loan A weekly values ---- */
    if (!weeks || !weeks.length) {
      throw new Error('Loan A weekly schedule is empty; cannot export charts/tables.');
    }
    if (weeks.length > 14) {
      throw new Error('Loan A has ' + weeks.length + ' weekly rows, but the export template supports at most 14 (W1–W14 through CO). Change aPayoffDay/CO so Loan A ends within 14 weeks, or extend the OOXML template before exporting.');
    }
    var nWeeks = weeks.length;
    var aPrincipal = [], aInterest = [], aCats = [];
    for (var i = 0; i < nWeeks; i++) {
      var r = 4 + i, w = weeks[i];
      cells.push(cell('Loan A - Construction', 'A' + r, w.label, 's'));
      cells.push(cell('Loan A - Construction', 'B' + r, w.draw));
      cells.push(cell('Loan A - Construction', 'C' + r, w.accrued));
      cells.push(cell('Loan A - Construction', 'D' + r, w.paid));
      cells.push(cell('Loan A - Construction', 'E' + r, w.unpaid));
      cells.push(cell('Loan A - Construction', 'F' + r, w.principalPaid));
      cells.push(cell('Loan A - Construction', 'G' + r, w.balance));
      aCats.push(w.label);
      aInterest.push(w.paid);
      aPrincipal.push(w.balance);
    }
    for (var clearR = 4 + nWeeks; clearR <= 17; clearR++) {
      cells.push(cell('Loan A - Construction', 'A' + clearR, '', 's'));
      ['B','C','D','E','F','G'].forEach(function (col) {
        cells.push(cell('Loan A - Construction', col + clearR, null));
      });
    }
    var lastA = 3 + nWeeks;

    /* ---- Loan B: month 0 = project start; build from draws to CO; IO months 0-60; sale payoff at M60; no rows past 60 ---- */
    var lbs = 'Loan B - Permanent';
    cells.push(cell(lbs, 'J3', ret.lenderB));
    cells.push(cell(lbs, 'J4', pct(inp.permLoanRate)));
    cells.push(cell(lbs, 'J5', 360));
    var ioPmt = ret.monthlyPayment;
    var piPmt = ret.amortizationPayment;
    var amt = ret.lenderB;
    var ratePct = num(inp.permLoanRate);
    var coDay = (fin.days && fin.days.co != null) ? fin.days.co : (fin.aPayoffDay || 98);
    labels.push(cell(lbs, 'A1', 'Loan B — Permanent Loan Amortization (Months 0–60 · sale payoff at month 60)', 's'));
    labels.push(cell(lbs, 'A2',
      'Loan Amount $' + (amt != null ? Number(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') +
      ' at CO Day ' + coDay + ' | Construction ' + Math.round((con.rateB || 0) * 100) + '% then permanent ' + (ratePct != null ? ratePct.toFixed(0) : '') +
      '% | IO from project month 0 through month 60 · sale payoff at M60 | IO ~$' +
      (ioPmt != null ? Number(ioPmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') +
      ' | P&I ~$' + (piPmt != null ? Number(piPmt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''),
      's'));
    formulaCaches.push(cache(lbs, 'J6', piPmt));
    var plan = (amt != null && ratePct != null && B.permanentSchedule) ? B.permanentSchedule(amt, ratePct) : null;
    var life = (typeof root !== 'undefined' && root.BespokeLoanLifecycle) ? root.BespokeLoanLifecycle.data(B, inp) : (typeof BespokeLoanLifecycle !== 'undefined' ? BespokeLoanLifecycle.data(B, inp) : null);
    var bm = life && life.bm ? life.bm : null;
    var bPrincipal = [], bInterest = [], bCats = [];
    var cum = 0;
    for (var mq = 0; mq <= 60; mq++) {
      var row = 5 + mq;
      var rec = bm && bm[mq] ? bm[mq] : null;
      var pm = plan && plan.months && mq >= 1 ? plan.months[mq - 1] : null;
      var begin, payment, interest, principal, endBal;
      if (rec && rec.day < coDay) {
        /* construction build-up: ending principal from draws; interest paid = construction cash interest in month */
        endBal = rec.balance;
        begin = mq === 0 ? endBal : (bm[mq - 1] ? bm[mq - 1].balance : endBal);
        interest = rec.paid || 0;
        principal = rec.principalPaid || 0;
        payment = interest + principal;
      } else if (pm) {
        begin = pm.begin; payment = pm.payment; interest = pm.interest; principal = pm.principal; endBal = pm.end;
      } else {
        begin = amt; payment = 0; interest = 0; principal = 0; endBal = amt;
      }
      if (mq === 60) {
        /* sale at month 60: IO interest (if any) + pay off remaining principal; no rows past 60 */
        begin = (pm ? pm.begin : (endBal || amt));
        interest = pm ? pm.interest : (begin * (ratePct || 0) / 1200);
        principal = begin;
        payment = interest + principal;
        endBal = 0;
      }
      if (mq === 0) {
        /* B5/F5 are template formulas (=J3 / =B5); patch caches only. C5/D5/E5/G5 are values. */
        formulaCaches.push(cache(lbs, 'B5', begin));
        formulaCaches.push(cache(lbs, 'F5', endBal));
        cells.push(cell(lbs, 'C5', payment));
        cells.push(cell(lbs, 'D5', interest));
        cells.push(cell(lbs, 'E5', principal));
        cells.push(cell(lbs, 'G5', interest));
        cum = interest;
      } else {
        formulaCaches.push(cache(lbs, 'B' + row, begin));
        formulaCaches.push(cache(lbs, 'C' + row, payment));
        formulaCaches.push(cache(lbs, 'D' + row, interest));
        formulaCaches.push(cache(lbs, 'E' + row, principal));
        formulaCaches.push(cache(lbs, 'F' + row, endBal));
        cum += interest;
        formulaCaches.push(cache(lbs, 'G' + row, cum));
      }
      bCats.push(String(mq));
      bInterest.push(interest);
      bPrincipal.push(endBal);
    }
    /* Clear any leftover template rows past month 60 (rows 66+) */
    for (var clearB = 66; clearB <= 74; clearB++) {
      cells.push(cell(lbs, 'A' + clearB, '', 's'));
      ['B','C','D','E','F','G'].forEach(function (col) {
        cells.push(cell(lbs, col + clearB, null));
      });
    }
    labels.push(cell(lbs, 'A77', 'Note: Schedule shown through month 60 (interest-only from project month 0, with remaining principal paid off at the month-60 sale). J3/J4 are inputs; J6 keeps the reference 30-year P&I payment. No rows past month 60.', 's'));

    /* ---- Supporting ---- */
    var ss = 'Supporting Tables';
    cells.push(cell(ss, 'B5', opex(ret, 'taxes')));
    cells.push(cell(ss, 'B6', opex(ret, 'insurance')));
    cells.push(cell(ss, 'B7', opex(ret, 'utilities')));
    cells.push(cell(ss, 'B8', opex(ret, 'management')));
    cells.push(cell(ss, 'B13', ret.annualDebtService));
    cells.push(cell(ss, 'B14', opex(ret, 'taxes')));
    cells.push(cell(ss, 'B15', opex(ret, 'insurance')));
    cells.push(cell(ss, 'B16', opex(ret, 'utilities')));
    cells.push(cell(ss, 'B22', costLine(cost, 'land')));
    cells.push(cell(ss, 'B23', costLine(cost, 'landClose')));
    formulaCaches.push(cache(ss, 'C13', (num(ret.annualDebtService) || 0) / 12));
    formulaCaches.push(cache(ss, 'C14', (num(opex(ret, 'taxes')) || 0) / 12));
    formulaCaches.push(cache(ss, 'C15', (num(opex(ret, 'insurance')) || 0) / 12));
    formulaCaches.push(cache(ss, 'C16', (num(opex(ret, 'utilities')) || 0) / 12));
    var stB17 = (num(ret.annualDebtService) || 0) + (num(opex(ret, 'taxes')) || 0) + (num(opex(ret, 'insurance')) || 0) + (num(opex(ret, 'utilities')) || 0);
    formulaCaches.push(cache(ss, 'B17', stB17));
    formulaCaches.push(cache(ss, 'C17', stB17 / 12));
    formulaCaches.push(cache(ss, 'B24', (num(costLine(cost, 'land')) || 0) + (num(costLine(cost, 'landClose')) || 0)));

    var chartUpdates = [
      {
        part: 'xl/charts/chart1.xml',
        title: 'Outstanding Principal',
        valueRef: "'Loan A - Construction'!$G$4:$G$" + lastA,
        catRef: "'Loan A - Construction'!$A$4:$A$" + lastA,
        values: aPrincipal,
        cats: aCats
      },
      {
        part: 'xl/charts/chart2.xml',
        title: 'Interest Paid',
        valueRef: "'Loan A - Construction'!$D$4:$D$" + lastA,
        catRef: "'Loan A - Construction'!$A$4:$A$" + lastA,
        values: aInterest,
        cats: aCats
      },
      {
        part: 'xl/charts/chart3.xml',
        title: 'Outstanding Principal',
        valueRef: "'Loan B - Permanent'!$F$5:$F$65",
        catRef: "'Loan B - Permanent'!$A$5:$A$65",
        values: bPrincipal,
        cats: bCats
      },
      {
        part: 'xl/charts/chart4.xml',
        title: 'Interest Paid',
        valueRef: "'Loan B - Permanent'!$D$5:$D$65",
        catRef: "'Loan B - Permanent'!$A$5:$A$65",
        values: bInterest,
        cats: bCats
      }
    ];

    return {
      filename: 'Bespoke-Core-Inputs-Outputs.xlsx',
      cells: cells.concat(labels),
      formulaCaches: formulaCaches,
      chartUpdates: chartUpdates,
      weekCount: weeks.length,
      verdict: verdict,
      notes: {
        doNotOverwriteFormulas: true,
        doNotUseSheetJSWrite: true,
        loanAFixedRows: 14,
        loanBFixedRows: 61
      }
    };
  }

  root.BespokeCoreExport = {
    buildPatches: buildPatches,
    MAPPING_VERSION: 1
  };
})(typeof window !== 'undefined' ? window : this);
