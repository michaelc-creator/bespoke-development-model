/* Shared Core Model calc + persistence (file:// safe). Namespace: bespoke */
(function (root) {
  'use strict';
  var STORAGE_KEY = 'bespoke.core.inputs.v1';
  var STORAGE_VER = 1;
  var memStore = null;

  var FACTORY = {
    company: 'Champion Home Builders',
    city: 'Lake City',
    state: 'FL',
    ll: [30.1894, -82.6395],
    website: 'https://championhomes.com',
    source: 'https://dca.georgia.gov/document/fact-sheets/approved-industrialized-building-manufacturers/download',
    notes: 'Champion Homes; retained in Core 94-factory registry',
    type: 'Single-family'
  };
  var SITE_LL = null; /* owner 15:01/15:16: former case site coordinates removed; no address geocoding, so no distance estimate */
  /* owner 15:16: internal model assumption (not an input): factory cost = $95 per sf of total factory (module) floor area.
     Separate from the $95/surface-sf marriage proxy (cpsf); neither replaces the other. */
  var FACTORY_RATE_PSF = 95;
  /* owner Nov 8 11:11: marriage line priced from LOCAL BUILD COST (owner-supplied regional whole-building construction $/floor sf).
     PROXY ASSUMPTION: 1 sf of seam work surface (roof + ceiling + floor strips + end walls) is priced at 1 floor sf of regional whole-building cost.
     This is a dimensional proxy, NOT an established finishing/surface trade rate and NOT a contractor bid. Region = South: current case 401 Harrison Ave NW, Roanoke, VA 24016 (Virginia = U.S. Census South region;
     the tax/insurance/electricity benchmarks are Roanoke-based). Fixed internal assumption, no region input. */
  var MAR_REGION_PSF = { South: 100, Midwest: 109, West: 131, Northeast: 155 };
  var MAR_REGION = 'South';
  var REMOVED_CASE_KEYS = ['bespoke.core.case.roanoke401.v1', 'bespoke.core.activeCaseView'];
  var REMOVED_ADDR = '96135 Nassau Place, Yulee, FL 32097';

  /* Illustrative planning defaults — seed only on first use (case-specific address removed 15:16) */
  var DEFAULTS = {
    addr: '',
    units: null, /* dwelling units (owner 15:15); not factory modules */
    houseW: 28,
    houseL: 53.571,
    area: 1500,
    boxes: 2,
    wallH: 12,
    strip: 2,
    split: 'long',
    driveSetback: 25,
    milesBasis: 'estimate',
    miles: null, /* auto from haversine×1.30 when null / not user */
    milesUser: false,
    transport: 11500,
    craneDay: 1600,
    crane: 10000, /* owner Nov 11 12:39: crane and crew = flat $10,000, always */
    cpsf: null, /* owner Nov 8 11:11: old automatic $95 retired; a non-95 manual value is kept as a manual marriage rate */
    marRegion: 'South', /* demo Nov 11: Census region for MAR_REGION_PSF; set from the geocoded property address (state -> region); default = prior fixed 'South' */
    cpsfSrc: 'ILLUSTRATIVE construction $/sf for marriage strips only — NOT Zillow sale/new-construction price.',
    marriageOverride: null,
    /* Marriage pricing (owner 2026-11-07 14:10): automatic ESTIMATE, not a contractor bid.
       Per seam surface sf = roof + ceiling + floor strips (seam length x 2 ft each) + outer end walls (wallH x 2 ft x 2 ends)
       + inner end walls (marInnerWallH x 2 ft x 2 ends). Seam length = house area / house width (houseW; 28 ft minimum house width if blank).
       Rate = existing model cpsf ($95 per surface sf, user-entered ILLUSTRATIVE planning proxy, not a validated trade price), treated all-in.
       $400/hr not applied (no source hours to derive); $10,000/seam minimum applied as floor (owner 14:12). Seams = modules - 1. */
    marMode: 'surfaceEst',
    marStripFt: 2,
    marInnerWallH: 8,
    marMinHouseWidthFt: 28,
    marHourlyRate: 400,
    marJobMinimum: 10000,
    land: 18000, /* owner Nov 8 07:45: one lot, total (not per dwelling) */
    landClose: 540, /* 3% of land */
    permit: 15000, /* owner 2026-11-07: permits $15,000, Lender B day 0 */
    clear: 8000,
    septic: 12000,
    water: 3500,
    power: 6500,
    landscape: 7500,
    foundation: 18000,
    drive: 8000,
    factory: 180000,
    arv: 375000, /* legacy manual value; unused since owner 19:18 (value is NOI / cap rate) */
    opexTaxes: 4575, opexInsurance: 3600, /* owner 19:37: editable estimate defaults */  /* owner 19:23: required user estimates, annual $ whole property; no default */
    utilitiesMode: 'owner', opexUtilities: 4064.40, /* owner 19:37: payer dropdown removed; electricity estimate in NOI */  /* '' | 'tenant' (confirmed $0) | 'owner' (annual $) */
    opexRepairsPct: 5, /* % of gross scheduled rent; model convention / practitioner proxy (S2) */
    reservesPerUnit: 250, /* $/dwelling/yr replacement reserve below NOI; multifamily lender proxy (S4/S5) */
    capRatePct: 5, /* owner 19:19: cap rate 5% for Estimated completed property value; editable */
    rent: 3750, /* owner Nov 11 14:56: $3,750/mo per dwelling (~$2.50/sf on 1,500 sf, mid of Miami $3,500-$4,000); was $2,451 (Nov 8 08:02) */
    exitCapPct: 7, sellCostPct: 6, holdYears: 5, /* owner Nov 9 10:04: default exit cap 7% for fresh profiles; saved exitCapPct not migrated */
    mgmt: 10,
    finRateA: 12, /* owner 18:46: Lender A rate, editable on Inputs */
    bLtvPct: 80, /* owner Nov 8 07:53: main case 80% (100% tested as variant only) */
    aLtvPct: 100, /* owner 18:46: Lender A LTV % of factory cost, editable */
    finRateB: 10, /* owner Nov 9 08:30: Lender B CONSTRUCTION-period rate 10% (was 12 Nov 8); distinct from permanent permLoanRate 8% */
    finDraw1Pct: 30,
    finDraw2Pct: 30,
    finDeliveryDay: 90,
    finRefiLagDays: 3,
    finPostMonths: 6,
    rentBasis: '', /* owner 17:01: '' | 'dwelling' | 'project' (explicit; no default) */
    vacancyPct: 5, /* owner 19:20: 5% vacancy stays (19:19 10% reverted) */ /* owner 18:00: default 5% vacancy (95% occupancy), editable; cleared = missing */
    opexMode: 'pct', /* owner 18:00: 'pct' = % of effective collected rent (after vacancy); 'dollar' = annual $ entry */
    maintenanceManagementPct: 10, /* Owner Nov 8 15:10: combined maintenance + management, % of collected rent. Legacy fields remain inactive. */
    opexPct: 10, /* owner 18:00: default 10% of effective collected rent, INCLUDES management (no second 10%) */
    factoryRatePsf: 90, /* owner Nov 11 (demo): factory cost = factory rate x total sf (sf per unit x units); default $90/sf, editable */
    factoryTotal: null, /* owner Nov 11: hard-coded $270,000 factory override retired; single source = factoryRatePsf x total sf */
    uwDefaultsVer: 14, /* migration marker: saved states without it get the 18:00 defaults applied once */
    opexAnnual: null, /* total annual operating expenses INCLUDING management, taxes, insurance, maintenance/reserves; excludes vacancy and debt service */
    permLoanAmt: null,
    permLoanRate: 8, /* owner Nov 8 07:51: 8%; earlier owner 18:33/18:46: Lender B rate, default 7%, editable */
    permLoanYears: null, /* not used: Lender B amortization fixed 30 years */
    cashInvested: null, /* total owner equity / cash invested, entered */
    yocHurdle: 10, /* owner 18:53: Pass/Fail target = 10% Yield To Cost (approved default); editable on Inputs only */
    finSchedule: 'weekly' /* 'legacy-monthly' keeps the original day-0/30/60/B-close schedule */
  };

  var FIELD_MAP = {
    inpAddr: 'addr',
    inpHouseW: 'houseW',
    inpHouseL: 'houseL',
    inpArea: 'area',
    inpUnits: 'units',
    inpBoxes: 'boxes',
    inpWallH: 'wallH',
    inpStrip: 'strip',
    inpSplit: 'split',
    inpDriveSetback: 'driveSetback',
    inpMilesBasis: 'milesBasis',
    inpMiles: 'miles',
    inpTransport: 'transport',
    inpCraneDay: 'craneDay',
    inpCrane: 'crane',
    inpCpsf: 'cpsf',
    inpCpsfSrc: 'cpsfSrc',
    inpMarriage: 'marriageOverride',
    inpMarInnerH: 'marInnerWallH',
    cLand: 'land',
    cLandClose: 'landClose',
    cPermit: 'permit',
    cClear: 'clear',
    cSeptic: 'septic',
    cWater: 'water',
    cPower: 'power',
    cLandscape: 'landscape',
    cFoundation: 'foundation',
    cDrive: 'drive',
    cFactory: 'factory',
    inpCapRate: 'exitCapPct',
    inpOpexTaxes: 'opexTaxes',
    inpOpexInsurance: 'opexInsurance',
    inpUtilMode: 'utilitiesMode',
    inpOpexUtilities: 'opexUtilities',
    inpOpexRepairsPct: 'opexRepairsPct',
    inpReservesPerUnit: 'reservesPerUnit',
    inpFactoryRate: 'factoryRatePsf',
    inpRent: 'rent',
    inpMgmt: 'mgmt',
    finRateA: 'finRateA',
    finRateB: 'finRateB',
    finDraw1Pct: 'finDraw1Pct',
    finDraw2Pct: 'finDraw2Pct',
    finDeliveryDay: 'finDeliveryDay',
    finRefiLagDays: 'finRefiLagDays',
    finPostMonths: 'finPostMonths',
    inpYocHurdle: 'yocHurdle',
    inpRentBasis: 'rentBasis',
    inpVacancy: 'vacancyPct',
    inpOpex: 'opexAnnual',
    inpOpexMode: 'opexMode',
    inpOpexPct: 'maintenanceManagementPct',
    inpPermRate: 'permLoanRate',
    inpBConstRate: 'finRateB',
    inpARate: 'finRateA',
    inpALtv: 'aLtvPct',
    inpBLtv: 'bLtvPct',
    inpExitCap: 'exitCapPct',
    inpSellCost: 'sellCostPct',
    inpHoldYears: 'holdYears'
  };

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function storageBackend() {
    var backends = [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bespoke.__probe', '1');
        localStorage.removeItem('bespoke.__probe');
        backends.push(localStorage);
      }
    } catch (e) {}
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('bespoke.__probe', '1');
        sessionStorage.removeItem('bespoke.__probe');
        backends.push(sessionStorage);
      }
    } catch (e) {}
    return backends;
  }

  function loadRaw() {
    var backends = storageBackend();
    for (var i = 0; i < backends.length; i++) {
      try {
        var raw = backends[i].getItem(STORAGE_KEY);
        if (raw) return raw;
      } catch (e) {}
    }
    if (memStore) return memStore;
    return null;
  }

  function saveRaw(raw) {
    memStore = raw;
    var backends = storageBackend();
    var ok = false;
    for (var i = 0; i < backends.length; i++) {
      try {
        backends[i].setItem(STORAGE_KEY, raw);
        ok = true;
      } catch (e) {}
    }
    return ok;
  }

  function normalizeInputs(src) {
    var d = clone(DEFAULTS);
    if (!src || typeof src !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) d[k] = src[k];
    });
    Object.keys(d).forEach(function (k) {
      var v = d[k], def = DEFAULTS[k];
      if (typeof v === 'number' && !isFinite(v)) d[k] = def;
    });
    d.strip = 2; /* always locked */
    if (d.marMode !== 'legacy') d.marMode = 'surfaceEst'; /* migrate saved 'surface' state */
    if (n(d.cpsf) === 95) d.cpsf = null; /* owner Nov 8 11:11: old automatic $95 default must not stick in a saved case */
    if (n(d.permit) === 5500) d.permit = 15000; /* old seed default -> owner-confirmed $15,000 */
    if (d.addr === REMOVED_ADDR) d.addr = ''; /* migration: removed case address */
    if (d.milesUser == null) d.milesUser = false;
    var uwv = +src.uwDefaultsVer || 0;
    if (uwv < 3) { /* owner 18:46 one-time defaults for older saved states */
      if (src.permLoanRate == null || src.permLoanRate === '') d.permLoanRate = 7;
      if (src.aLtvPct == null || src.aLtvPct === '') d.aLtvPct = 100;
    }
    if (uwv < 4) { /* owner 18:53 one-time: saved hurdle 20 (or blank) -> 10; later edits are kept */
      var hOld = n(src.yocHurdle);
      if (hOld == null || hOld === 20) d.yocHurdle = 10;
    }
    if (uwv < 5 && (src.capRatePct == null || src.capRatePct === '')) d.capRatePct = 5; /* owner 19:19 one-time default */
    if (uwv < 6) { /* owner 19:37 one-time: blank expense lines get the estimates; non-blank user values kept */
      if (src.opexTaxes == null || src.opexTaxes === '') d.opexTaxes = 4575;
      if (src.opexInsurance == null || src.opexInsurance === '') d.opexInsurance = 3600;
      if (src.opexUtilities == null || src.opexUtilities === '') d.opexUtilities = 4064.40;
    }
    d.utilitiesMode = 'owner'; /* payer selector removed (owner 19:37); electricity is an owner expense */
    if (uwv < 7 && (src.factoryTotal == null || src.factoryTotal === '')) d.factoryTotal = 270000; /* owner 19:53 one-time */
    if (uwv < 8) { d.land = 18000; d.landClose = 540; d.rent = 2451; } /* owner Nov 8 07:45 one-time: land $18,000 total, closing 3% = $540; later edits kept */
    if (uwv < 9) d.permLoanRate = 8; /* owner Nov 8 07:51 one-time: Lender B 8%; later edits kept */
    if (uwv < 10) d.bLtvPct = 80; /* owner Nov 8 07:52 one-time; later edits kept */
    if (uwv < 11) d.finRateB = 12; /* owner Nov 8 11:13 one-time: construction rate 12%; later edits kept */
    if (uwv < 12) d.finRateB = 10; /* owner Nov 9 08:30 one-time: construction rate 10%; later edits kept */
    if (uwv < 13) { /* owner Nov 11 14:05 one-time (schema 13, Loan A 60% factory progress + Loan B restructure): saved financing/structure/cost values from earlier sessions
       (e.g. a stale Lender A or B LTV, deposit-era keys, land/cost overrides) reset to the new defaults so the default case shows; address and size/units kept. Later edits are kept (marker saved). */
      var KEEP13 = { addr: 1, units: 1, houseW: 1, houseL: 1, area: 1, boxes: 1, wallH: 1, split: 1, strip: 1, miles: 1, milesBasis: 1, milesUser: 1, driveSetback: 1, rentBasis: 1, marMode: 1 };
      Object.keys(DEFAULTS).forEach(function (k) { if (!KEEP13[k]) d[k] = DEFAULTS[k]; });
      d.exitCapPct = 5; d.yocHurdle = 8; /* the shipped default case (example-deal seed): exit cap 5%, IRR hurdle 8%; unchanged by this reset */
      if (d.units == null) d.units = 2; if (!d.rentBasis) d.rentBasis = 'dwelling';
    }
    if (uwv < 14 && n(d.rent) === 2451) d.rent = 3750; /* owner Nov 11 14:56 one-time: old $2,451 default rent -> $3,750; any other user-entered rent kept */
    if (uwv >= 2) d.uwDefaultsVer = 14;
    if (uwv < 2) { /* one-time migration of pre-18:00 saved state */
      var oldOpex = n(src.opexAnnual);
      if (src.vacancyPct == null || src.vacancyPct === '') d.vacancyPct = 5;
      if (src.opexPct == null || src.opexPct === '') d.opexPct = 10;
      d.opexMode = (oldOpex != null && isFinite(oldOpex)) ? 'dollar' : 'pct'; /* keep manual dollars, incl. 0 */
      d.uwDefaultsVer = 14;
    }
    if (d.opexMode !== 'dollar') d.opexMode = 'pct';
    return d;
  }

  var _casesMigrated = false;
  function migrateRemovedCases() {
    if (_casesMigrated) return; _casesMigrated = true;
    try { if (typeof localStorage !== 'undefined') REMOVED_CASE_KEYS.forEach(function (k) { if (localStorage.getItem(k) != null) { localStorage.removeItem(k); try { console.info('[bespoke-core] migration removed', k); } catch (e) {} } }); } catch (e) {}
  }
  function sampleInputs() {
    /* Same shipped demo case as example-deal-seed.js. Used only when nothing valid is in storage
       (including private mode / blocked storage). Saved user inputs are never passed through here. */
    var d = clone(DEFAULTS);
    d.units = 2; d.rentBasis = 'dwelling'; d.exitCapPct = 5; d.yocHurdle = 8;
    return d;
  }
  function loadInputs() {
    migrateRemovedCases();
    var raw = loadRaw();
    if (!raw) {
      var seeded = sampleInputs();
      saveInputs(seeded);
      return seeded;
    }
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== STORAGE_VER || !parsed.inputs) {
        var seeded2 = sampleInputs();
        saveInputs(seeded2);
        return seeded2;
      }
      var norm = normalizeInputs(parsed.inputs);
      if ((+parsed.inputs.uwDefaultsVer || 0) < 14) { try { saveInputs(norm); } catch (e) {} } /* persist schema-13/14 migrations once so later edits are kept */
      return norm;
    } catch (e) {
      var seeded3 = sampleInputs();
      saveInputs(seeded3);
      return seeded3;
    }
  }

  function saveInputs(inputs) {
    var payload = {
      v: STORAGE_VER,
      savedAt: new Date().toISOString(),
      inputs: normalizeInputs(inputs)
    };
    saveRaw(JSON.stringify(payload));
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bespoke-core-inputs', { detail: payload }));
      }
    } catch (e) {}
    return payload;
  }

  function n(v) {
    if (v === null || v === undefined || v === '') return null;
    var x = +v;
    return isFinite(x) ? x : null;
  }

  function money(num) {
    if (num == null || !isFinite(num)) return '—';
    return '$' + Math.round(num).toLocaleString('en-US');
  }

  function moneyExact(num) {
    if (num == null || !isFinite(num)) return '—';
    var r = Math.round(num * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 1e-9) return '$' + Math.round(r).toLocaleString('en-US');
    return '$' + r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function haversineMi(a, b) {
    var R = 3959,
      dLat = ((b[0] - a[0]) * Math.PI) / 180,
      dLon = ((b[1] - a[1]) * Math.PI) / 180;
    var la1 = (a[0] * Math.PI) / 180,
      la2 = (b[0] * Math.PI) / 180;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function deriveBoxes(W, L, boxes, split) {
    boxes = Math.max(1, boxes | 0);
    var longIsL = L >= W,
      alongLong = split !== 'short';
    var boxW, boxL;
    if (alongLong) {
      if (longIsL) {
        boxL = L;
        boxW = W / boxes;
      } else {
        boxL = W;
        boxW = L / boxes;
      }
    } else {
      if (longIsL) {
        boxL = W;
        boxW = L / boxes;
      } else {
        boxL = L;
        boxW = W / boxes;
      }
    }
    return { boxes: boxes, boxW: boxW, boxL: boxL, seamL: boxL, seams: Math.max(0, boxes - 1) };
  }

  function compute(rawInputs) {
    var inp = normalizeInputs(rawInputs || {});
    var W = n(inp.houseW);
    if (W == null) W = DEFAULTS.houseW;
    var L = n(inp.houseL);
    if (L == null) L = DEFAULTS.houseL;
    var area = n(inp.area);
    if (area == null) area = Math.round(W * L * 1000) / 1000;
    var boxes = n(inp.boxes);
    if (boxes == null) boxes = 2;
    boxes = Math.max(1, Math.round(boxes));
    var split = inp.split || 'long';
    var H = n(inp.wallH);
    if (H == null) H = 12;
    var strip = 2;
    var g = deriveBoxes(W, L, boxes, split);

    var setback = n(inp.driveSetback);
    var driveRun = setback == null ? null : setback + 15;

    var F = FACTORY;
    /* factory = $95 x total factory floor area = units x square feet per unit (sum of module floor areas; not x module count); units blank => factory cost missing, totals partial */
    var unitsN = (function (v) { v = n(v); return v != null && v > 0 ? v : null; })(inp.units), modFloorPerHouse = (area != null && area > 0) ? area : g.boxes * g.boxW * g.boxL; /* modules tile the house: sum of module floor areas = square feet per unit */
    var factoryFloorArea = (unitsN != null && isFinite(modFloorPerHouse) && modFloorPerHouse > 0) ? modFloorPerHouse * Math.round(unitsN) : null; /* owner 15:22: blank units = missing (no assumed 1) */
    var factoryOverride = null; /* owner Nov 11: factoryTotal override retired (was owner 19:53); factory cost = factoryRatePsf x total sf */
    var factoryRate = (function (v) { v = n(v); return v != null && isFinite(v) && v > 0 ? v : 90; })(inp.factoryRatePsf);
    var factoryCost = factoryOverride != null ? Math.round(factoryOverride * 100) / 100 : (factoryFloorArea == null ? null : Math.round(factoryRate * factoryFloorArea * 100) / 100);
    var hav = SITE_LL ? haversineMi(F.ll, SITE_LL) : null;
    var estRoad = hav == null ? null : Math.round(hav * 1.3);
    var basis = inp.milesBasis || 'estimate';
    var miles = n(inp.miles);
    if (!inp.milesUser) {
      if (basis === 'estimate') miles = estRoad;
      else if (basis === 'haversine') miles = hav == null ? null : Math.round(hav);
    }

    var craneDays = Math.ceil(boxes / 2);
    var CRANE_CREW_FLAT = 10000;
    var roof = g.seamL * strip,
      ceil = g.seamL * strip,
      floor = g.seamL * strip;
    var ends = 2 * (H * strip);
    var stripTotal = roof + ceil + floor + ends;
    var cpsf = n(inp.cpsf);
    var marAuto = cpsf == null ? null : cpsf * stripTotal;
    var marOverride = n(inp.marriageOverride);
    var marUse = marOverride != null ? marOverride : marAuto;
    /* Seam-bid mode: marriage geometry only (does not touch global W/L/module/driveway/transport). */
    var seam = null;
    if (inp.marMode !== 'legacy') {
      var pos = function (v) { v = n(v); return v != null && isFinite(v) && v > 0 ? v : null; };
      var sW = pos(inp.marStripFt), outerH = pos(H), innerH = pos(inp.marInnerWallH), minW = pos(inp.marMinHouseWidthFt) || 28;
      /* owner Nov 8 11:11: seam length from the footprint (house length/width + split via deriveBoxes), not area / assumed width */
      var widthUsed = g.boxes > 0 && isFinite(g.boxW) ? g.boxW * g.boxes : null, widthBasis = 'footprint ' + W + ' x ' + L + ' ft, ' + (split === 'short' ? 'short-axis' : 'lengthwise') + ' split';
      var seamsN = Math.max(0, boxes - 1); /* modules - 1 (shared footprint; not x dwelling units) */
      var seamL = isFinite(g.seamL) && g.seamL > 0 ? g.seamL : null;
      var cpsfManual = cpsf != null && cpsf > 0 && cpsf !== 95 ? cpsf : null, marRegionUse = Object.prototype.hasOwnProperty.call(MAR_REGION_PSF, inp.marRegion) ? inp.marRegion : MAR_REGION, regRate = MAR_REGION_PSF[marRegionUse];
      cpsf = cpsfManual != null ? cpsfManual : regRate;
      var q = null, seamSf = null;
      if (seamL != null && sW != null && outerH != null && innerH != null) {
        q = { roof: seamL * sW, ceiling: seamL * sW, floor: seamL * sW, outerEnds: outerH * sW * 2, innerEnds: innerH * sW * 2 };
        seamSf = q.roof + q.ceiling + q.floor + q.outerEnds + q.innerEnds;
      }
      var mnSeam = pos(inp.marJobMinimum), rawSeam = seamSf == null || cpsf == null ? null : Math.round(seamSf * cpsf * 100) / 100;
      var perSeam = rawSeam == null ? null : Math.max(mnSeam == null ? 0 : mnSeam, rawSeam); /* owner 14:12: $10,000/seam minimum kept as a pricing floor */
      var marEst = seamsN === 0 ? 0 : perSeam == null ? null : Math.round(perSeam * seamsN * 100) / 100;
      seam = { mode: 'surfaceEst', seams: seamsN, houseWidthUsed: widthUsed, widthBasis: widthBasis, seamLengthFt: seamL, stripFt: sW,
        outerWallH: outerH, innerWallH: innerH, quantities: q, seamSfEach: seamSf, seamSfTotal: seamSf == null ? null : seamSf * seamsN,
        ratePerSurfaceSf: cpsf, rateBasis: cpsfManual != null ? 'manual' : 'regional', region: marRegionUse, regionRates: MAR_REGION_PSF, rateSource: cpsfManual != null ? 'Manual marriage rate entered by user ($/surface sf)' : marRegionUse + ' regional whole-building construction cost $' + regRate + '/floor sf applied 1:1 to seam work sf (proxy; not a surface-finishing rate or contractor bid)',
        hourlyRate: pos(inp.marHourlyRate), hourlyApplied: false, minimumPerSeam: mnSeam, estimateBeforeMinimum: rawSeam, minimumApplied: rawSeam != null && mnSeam != null && mnSeam > rawSeam,
        perSeam: perSeam, total: marEst, overridden: marOverride != null,
        status: marOverride != null ? 'override' : marEst == null ? 'missing: geometry or rate' : 'estimated' };
      if (marOverride == null) marUse = marEst;
    }

    /* 14 cost lines — blanks stay null (not $0); engineering and siding removed (owner 2026-11-07) */
    var costLines = [
      { key: 'land', label: 'Land', value: n(inp.land), section: 'land' },
      { key: 'landClose', label: 'Land closing', value: n(inp.landClose), section: 'land' },
      { key: 'permit', label: 'Permitting', value: n(inp.permit), section: 'site' },
      { key: 'clear', label: 'Clearing/grading', value: n(inp.clear), section: 'site' },
      /* owner Nov 8 07:53: septic line and draw removed from the active case (saved septic value ignored) */
      { key: 'water', label: 'Water hookup', value: n(inp.water), section: 'site' },
      { key: 'power', label: 'Power hookup (incl. trench)', value: n(inp.power), section: 'site' },
      { key: 'landscape', label: 'Landscaping', value: n(inp.landscape), section: 'site' },
      { key: 'foundation', label: 'Foundation', value: n(inp.foundation), section: 'site' },
      { key: 'drive', label: 'Driveway cost', value: n(inp.drive), section: 'site' },
      { key: 'factory', label: 'Modular factory purchase', value: factoryCost, section: 'modular' },
      { key: 'transport', label: 'Transport', value: n(inp.transport), section: 'modular' },
      { key: 'crane', label: 'Crane and crew', value: CRANE_CREW_FLAT, section: 'modular' } /* owner Nov 11 12:39: flat $10,000 always (no day rates, no separate crew) */,
      { key: 'marriage', label: 'Marriage line', value: marUse, section: 'modular' }
    ];

    var sum = 0,
      entered = 0,
      missing = 0;
    costLines.forEach(function (row) {
      if (row.value == null) missing++;
      else {
        entered++;
        sum += row.value;
      }
    });

    function sectionSum(sec) {
      var s = 0,
        miss = 0,
        lines = [];
      costLines.forEach(function (row) {
        if (row.section !== sec) return;
        lines.push(row);
        if (row.value == null) miss++;
        else s += row.value;
      });
      return { id: sec, lines: lines, subtotal: s, missing: miss, complete: miss === 0 };
    }

    var sections = [
      { id: 'land', title: 'Land and Closing', note: null, data: sectionSum('land') },
      { id: 'site', title: 'Permitting And Site Costs', note: null, data: sectionSum('site') },
      { id: 'modular', title: 'Modular Specific Costs', note: null, data: sectionSum('modular') }
    ];

    var rent = n(inp.rent);
    var mgmt = n(inp.maintenanceManagementPct);
    if (mgmt == null) mgmt = 10;
    var pv = propertyValueFromInputs(inp), arv = pv.value; /* owner 19:18: derived NOI / cap rate; saved manual inp.arv kept but unused */
    var collectedMonthly = rent == null || n(inp.vacancyPct) == null ? null : rent * (1 - n(inp.vacancyPct) / 100);
    var mgmtFee = collectedMonthly == null ? null : collectedMonthly * (mgmt / 100);
    var netRent = collectedMonthly == null || mgmtFee == null ? null : collectedMonthly - mgmtFee;
    var arvGap = arv != null && missing === 0 ? arv - sum : null;

    return {
      inputs: inp,
      factory: F,
      factoryCalc: { override: factoryOverride, ratePsf: factoryRate, moduleFloorPerHouse: modFloorPerHouse, units: unitsN, unitsMissing: unitsN == null, floorArea: factoryFloorArea, cost: factoryCost },
      geo: {
        W: W,
        L: L,
        area: area,
        boxes: boxes,
        split: split,
        H: H,
        strip: strip,
        boxW: g.boxW,
        boxL: g.boxL,
        seams: g.seams,
        seamL: g.seamL
      },
      driveRun: driveRun,
      hav: hav,
      estRoad: estRoad,
      miles: miles,
      craneDays: craneDays,
      marriage: {
        roof: roof,
        ceil: ceil,
        floor: floor,
        ends: ends,
        stripTotal: stripTotal,
        cpsf: cpsf,
        formula: marAuto,
        override: marOverride,
        used: marUse,
        seam: seam
      },
      costLines: costLines,
      sections: sections,
      total: sum,
      entered: entered,
      missing: missing,
      complete: missing === 0,
      metrics: {
        arv: arv,
        arvDerived: true, capRatePct: pv.capRatePct, valueNoi: pv.noi, valueMissing: pv.missing,
        rent: rent,
        mgmtPct: mgmt,
        mgmtFee: mgmtFee,
        netRent: netRent,
        arvGap: arvGap
      }
    };
  }


  /* Construction draw + refinance schedule. Actual/365 simple interest, paid at each period end (not capitalized).
     Day 0 engineering; day 30/60 factory draws 1-2 (Lender A); delivery day; Lender B closes delivery+lag days,
     pays off A principal and funds factory draw 3 + transport, crane, marriage and site lines due at B close (model assumption). */
  function computeFinancingLegacy(rawInputs) {
    var r = compute(rawInputs);
    var inp = r.inputs;
    function num(v, d) { var x = n(v); return x == null ? d : x; }
    function line(k) { for (var i = 0; i < r.costLines.length; i++) if (r.costLines[i].key === k) return r.costLines[i]; return null; }
    function val(k) { var l = line(k); return l && l.value != null && isFinite(l.value) ? l.value : 0; }
    var rA = num(inp.finRateA, 12) / 100, rB = num(inp.finRateB, 8) / 100;
    var p1 = num(inp.finDraw1Pct, 30) / 100, p2 = num(inp.finDraw2Pct, 30) / 100, p3 = Math.max(0, 1 - p1 - p2);
    var dDel = Math.max(61, Math.round(num(inp.finDeliveryDay, 90)));
    var lag = Math.max(0, Math.round(num(inp.finRefiLagDays, 3)));
    var dRefi = dDel + lag;
    var post = Math.max(1, Math.min(36, Math.round(num(inp.finPostMonths, 6))));
    var F = val('factory');
    var aDraws = [
      { day: 30, month: 2, label: 'Factory production draw 1 (' + Math.round(p1 * 100) + '%)', amount: F * p1, keys: ['factory'] },
      { day: 60, month: 3, label: 'Factory production draw 2 (' + Math.round(p2 * 100) + '%)', amount: F * p2, keys: ['factory'] }
    ];
    var bKeys = ['transport', 'crane', 'marriage', 'clear', 'water', 'power', 'landscape', 'foundation', 'drive'];
    var bNew = [{ label: 'Factory final draw 3 (' + Math.round(p3 * 100) + '%)', key: 'factory', amount: F * p3 }];
    bKeys.forEach(function (k) { var l = line(k); bNew.push({ label: l ? l.label : k, key: k, amount: val(k) }); });
    var unassigned = ['land', 'landClose', 'permit'].map(function (k) { var l = line(k); return { key: k, label: l ? l.label : k, amount: val(k) }; });
    var aPrincipal = aDraws.reduce(function (s, d) { return s + d.amount; }, 0);
    var bNewTotal = bNew.reduce(function (s, d) { return s + d.amount; }, 0);
    var bBalance = aPrincipal + bNewTotal;
    var periods = [], bal = 0, cumInt = 0, ends = [];
    for (var e = 30; e <= dRefi + post * 30; e += 30) ends.push(e);
    if (ends.indexOf(dRefi) < 0) ends.push(dRefi);
    if (ends.indexOf(dRefi + post * 30) < 0) ends.push(dRefi + post * 30);
    ends.sort(function (a, b) { return a - b; });
    var start = 0, aBal = 0;
    for (var i = 0; i < ends.length; i++) {
      var end = ends[i];
      if (end > dRefi + post * 30) break;
      var adv = 0;
      aDraws.forEach(function (d) { if (d.day === start) { aBal += d.amount; adv += d.amount; } });
      var isA = start < dRefi;
      var lender = isA ? 'Lender A' : 'Lender B';
      var balUsed = isA ? aBal : bBalance;
      var rate = isA ? rA : rB;
      var days = end - start;
      var interest = balUsed * rate * days / 365;
      cumInt += interest;
      periods.push({ start: start, end: end, days: days, lender: lender, advance: adv, balance: balUsed, rate: rate, interest: interest, cumInterest: cumInt, paidAt: end === dRefi ? 'B close (borrower cash)' : 'Period end' });
      start = end;
    }
    var aInterest = periods.filter(function (p) { return p.lender === 'Lender A'; }).reduce(function (s, p) { return s + p.interest; }, 0);
    var bInterest = cumInt - aInterest;
    var accruedAtClose = periods.filter(function (p) { return p.end === dRefi && p.lender === 'Lender A'; }).reduce(function (s, p) { return s + p.interest; }, 0);
    var scheduled = aPrincipal + bNewTotal;
    var unTot = unassigned.reduce(function (s, u) { return s + u.amount; }, 0);
    return {
      convention: 'Actual/365 simple interest; interest paid each period end, not capitalized; interest-only after B close.',
      days: { delivery: dDel, refi: dRefi, lag: lag, horizonEnd: dRefi + post * 30 },
      rates: { a: rA, b: rB }, pct: { d1: p1, d2: p2, d3: p3 },
      aDraws: aDraws, aPeak: aPrincipal, aPayoff: aPrincipal, accruedAtClose: accruedAtClose,
      bNew: bNew, bNewTotal: bNewTotal, bBalance: bBalance,
      sourcesUses: { uses: [{ label: 'Pay off Lender A principal', amount: aPrincipal }, { label: 'New project costs due at B close', amount: bNewTotal }, { label: 'Lender A accrued interest (borrower cash)', amount: accruedAtClose }], sources: [{ label: 'Lender B loan', amount: bBalance }, { label: 'Borrower cash', amount: accruedAtClose }] },
      fundingGap: 0,
      unassigned: unassigned, unassignedTotal: unTot,
      scheduledProjectCost: scheduled, worksheetTotal: r.total, reconciles: Math.abs(scheduled + unTot - r.total) < 0.005,
      periods: periods, aInterest: aInterest, bInterest: bInterest, totalInterest: cumInt
    };
  }

  /* Weekly construction-to-permanent draw plan. PLANNING timing; amounts from cost lines.
     owner Nov 9 08:47: ALL draws fire on each bar's START day (not end). */
  /* permits 0-27 with 4 equal weekly start draws 0/7/14/21; clear 28; foundation 35; water+power parallel 42;
     transport/crane/marriage/drive/landscape all start Day 60 (drive+landscape moved from 63). */
  var WEEKLY_PLAN = [
    { key: 'permit', label: 'Permits', lender: 'B', start: 0, dur: 28, split: 'weekly-start-4' },
    { key: 'clear', label: 'Clearing/grading', lender: 'B', start: 28, dur: 7 },
    { key: 'foundation', label: 'Foundation', lender: 'B', start: 35, dur: 7 },
    { key: 'water', label: 'Water hookup', lender: 'B', start: 42, dur: 1 },
    { key: 'power', label: 'Power hookup (incl. trench)', lender: 'B', start: 42, dur: 1 },
    { key: 'transport', label: 'Transport', lender: 'B', rel: 'delivery', start: 0, dur: 1 },
    { key: 'crane', label: 'Crane and crew', lender: 'B', rel: 'delivery', start: 0, dur: 1 },
    { key: 'marriage', label: 'Marriage line', lender: 'B', rel: 'delivery', at: 50, dur: 34, split: 'weekly-start' },
    { key: 'drive', label: 'Driveway cost', lender: 'B', rel: 'delivery', at: 84, dur: 7 },
    { key: 'landscape', label: 'Landscaping', lender: 'B', rel: 'delivery', at: 91, dur: 7 }
  ];
  /* owner Nov 9 09:30: gaps closed. Transport + setting/crane Day 49 (day after factory production ends), marriage line 50-83,
     driveway 84-90, landscaping 91-97, CO Day 98. Continuous work, no idle stretch. */
  /* owner Nov 9 08:47: factory production bar weeks 2-7 (days 7-48); Loan A six equal draws $45k on days 7,14,21,28,35,42 (supersedes 4x Day0-21 plan). */
  var FACTORY_PRODUCTION = { start: 7, dur: 42 };
  /* owner Nov 9 09:30: NO Lender A factory loan. Factory 10% deposit paid in borrower cash at order (production start, Day 7);
     90% balance paid on delivery (Day 49) by a Lender B draw at the construction rate until CO Day 98, then permanent. */
  var DELIVERY_DAY = 49, FACTORY_DEPOSIT_PCT = 0.10, FACTORY_DEPOSIT_DAY = 7;
  /* owner Nov 11 13:50 (Michael authorized): Loan A funds 60% of factory cost as six weekly progress payments before delivery (replaces the 10% cash deposit), repaid in full by Loan B at delivery. */
  var FACTORY_A_SHARE = 0.60, FACTORY_A_DRAW_DAYS = [7, 14, 21, 28, 35, 42];
  var CO_DAY = 98; /* Certificate of occupancy = end of week 14 / Day 98 */
  function computeFinancingWeekly(rawInputs) {
    var r = compute(rawInputs);
    var inp = r.inputs;
    function num(v, d) { var x = n(v); return x == null ? d : x; }
    function line(k) { for (var i = 0; i < r.costLines.length; i++) if (r.costLines[i].key === k) return r.costLines[i]; return null; }
    function val(k) { var l = line(k); return l && l.value != null && isFinite(l.value) ? l.value : 0; }
    /* owner 18:46: Lender A = factory loan, A LTV % of factory cost (default 100), rate finRateA (default 12); funds all factory draws.
       Lender B = 7%/30-yr loan (permLoanRate) that pays Lender A in full at the refi day (day 240, owner 11:21) + 80% of B-eligible site/installation lines. Land and factory are NOT in the 80% basis.
       Unfinanced shares are borrower cash draws. finRateB (old 8%) is no longer used in weekly mode. */
    var aLtvRaw = n(inp.aLtvPct), aLtv = aLtvRaw != null && isFinite(aLtvRaw) && aLtvRaw >= 0 && aLtvRaw <= 100 ? aLtvRaw / 100 : 0;
    var rA = (n(inp.finRateA) != null && isFinite(n(inp.finRateA)) ? n(inp.finRateA) : 0) / 100, rB = (n(inp.permLoanRate) != null && isFinite(n(inp.permLoanRate)) ? n(inp.permLoanRate) : 0) / 100;
    var bLtvRaw = n(inp.bLtvPct), B_LTV = bLtvRaw != null && isFinite(bLtvRaw) && bLtvRaw >= 0 && bLtvRaw <= 100 ? bLtvRaw / 100 : 0.8; /* owner Nov 8 07:52/07:53: Lender B % of eligible site/install basis, default 80 */
    // Owner Nov 9 08:47: Loan A six weekly factory draws on FACTORY_DRAW_DAYS; CO Day 98 = A principal buyout + B permanent (finPostMonths ignored).
    // Engineering has no separate priced line; do not invent or double-count a cost.
    var p1=1,p2=0,p3=0,dDel=DELIVERY_DAY,dRefi=CO_DAY,horizon=CO_DAY,aPayoffDay=DELIVERY_DAY; /* Loan A repaid by Loan B at module delivery/set */
    var F=val('factory'),isMiss=function(k){var l=line(k);return !l||l.value==null||!isFinite(l.value);};
    var wk=function(d){return Math.floor(d/7)+1;};
    // Six equal factory draws matching production bar weeks 2-7 (owner 8:47 supersedes earlier 4x Day0-21 plan).
    /* owner Nov 11 13:50: Loan A = 60% of factory cost in six equal progress payments (days 7-42) x A LTV; any unfinanced A share is borrower cash.
       Loan B funds the 40% factory balance at delivery (x B LTV) and pays off Loan A principal at delivery. */
    var B_LTV_LBL = String(Math.round(B_LTV * 10000) / 100), B_CASH_LBL = String(Math.round((1 - B_LTV) * 10000) / 100); /* label text: actual Lender B share and unfinanced share */
    var A_LTV_LBL = String(Math.round(aLtv * 10000) / 100), A_SHARE_LBL = String(Math.round(FACTORY_A_SHARE * 100)), BAL_LBL = String(Math.round((1 - FACTORY_A_SHARE) * 100));
    var fA = Math.round(F * FACTORY_A_SHARE * 100) / 100, fBal = Math.round((F - fA) * 100) / 100, fDep = 0;
    var nA = FACTORY_A_DRAW_DAYS.length, eachA = Math.round(fA / nA * 100) / 100;
    var aDraws = [], cashDraws = [], factoryPayments = [];
    FACTORY_A_DRAW_DAYS.forEach(function (dd, q) {
      var pay = q === nA - 1 ? Math.round((fA - eachA * (nA - 1)) * 100) / 100 : eachA, amt = Math.round(pay * aLtv * 100) / 100, c = Math.round((pay - amt) * 100) / 100;
      var lab = 'Factory progress payment ' + (q + 1) + ' of ' + nA + ' (Loan A)';
      factoryPayments.push({ day: dd, week: wk(dd), label: lab, amount: pay, source: 'Lender A', key: 'factory', missing: isMiss('factory') });
      if (amt > 0) aDraws.push({ day: dd, week: wk(dd), label: lab, amount: amt, cost: pay, key: 'factory', missing: isMiss('factory') });
      if (c > 0) cashDraws.push({ day: dd, week: wk(dd), label: lab + ' — ' + String(Math.round((1 - aLtv) * 10000) / 100) + '% not financed', amount: c, key: 'factory', missing: isMiss('factory') });
    });
    factoryPayments.push({ day: DELIVERY_DAY, week: wk(DELIVERY_DAY), label: 'Factory balance ' + BAL_LBL + '% on delivery (Lender B)', amount: fBal, source: 'Lender B', key: 'factory', missing: isMiss('factory') });
    var tasks = WEEKLY_PLAN.map(function (t) {
      var s = t.at != null ? t.at : (t.rel === 'delivery' ? dDel : 0) + t.start, e = s + t.dur - 1;
      return { key: t.key, label: t.label, lender: t.lender, rel: t.rel || null, split: t.split || null, startDay: s, endDay: e, day: s, week: wk(s), amount: val(t.key), missing: isMiss(t.key) };
    });
    var bNew = [];
    function pushEqualSplits(t, days) {
      var nW = days.length, each = Math.round(t.amount / nW * 100) / 100, last = Math.round((t.amount - each * (nW - 1)) * 100) / 100;
      days.forEach(function (dd, q) { bNew.push({ label: t.label + ' (week ' + wk(dd) + ')', key: t.key, amount: q === nW - 1 ? last : each, day: dd, week: wk(dd), missing: t.missing }); });
    }
    tasks.forEach(function (t) {
      if (t.split === 'weekly-start-4') {
        /* Permits: four equal weekly draws on start days 0,7,14,21 */
        pushEqualSplits(t, [t.startDay, t.startDay + 7, t.startDay + 14, t.startDay + 21]);
      } else if (t.split === 'weekly-start' || t.split === 'weekly') {
        /* Marriage (and any weekly-start): draws at START of each weekly bucket */
        var nW = Math.max(1, wk(t.endDay) - wk(t.startDay) + 1), days = [];
        for (var q = 0; q < nW; q++) days.push(Math.min(t.endDay, t.startDay + q * 7));
        pushEqualSplits(t, days);
      } else {
        /* Single draw on bar start day */
        bNew.push({ label: t.label, key: t.key, amount: t.amount, day: t.startDay, week: wk(t.startDay), missing: t.missing });
      }
    });
    /* land and land closing are now in the Loan B basis, drawn at project start (Day 0) */
    ['land', 'landClose'].forEach(function (k) { var l = line(k); if (val(k) > 0 || isMiss(k)) bNew.push({ label: l ? l.label : k, key: k, amount: val(k), day: 0, week: wk(0), missing: isMiss(k) }); });
    bNew.push({label:factoryPayments[factoryPayments.length-1].label,key:'factory',amount:fBal,day:DELIVERY_DAY,week:wk(DELIVERY_DAY),missing:isMiss('factory'),factoryBalance:true});
    bNew.forEach(function (d) { d.cost = d.amount; d.amount = Math.round(d.cost * B_LTV * 100) / 100; var c = Math.round((d.cost - d.amount) * 100) / 100; if (c > 0) cashDraws.push({ day: d.day, week: d.week, label: d.label + ' — ' + B_CASH_LBL + '% not financed', amount: c, key: d.key, missing: d.missing }); });
    /* every Loan B line above (site/install, land, closing, 40% factory balance) is funded at B LTV; the rest is borrower cash */
    bNew.sort(function (a, b) { return a.day - b.day; }); cashDraws.sort(function (a, b) { return a.day - b.day; });
    var bEligibleCost = bNew.reduce(function (s, d) { return s + d.cost; }, 0), cashTotal = cashDraws.reduce(function (s, d) { return s + d.amount; }, 0);
    var unassigned = []; /* land and closing now funded through Loan B (x LTV) + cash */
    var aPrincipal = aDraws.reduce(function (s, d) { return s + d.amount; }, 0);
    var bNewTotal = bNew.reduce(function (s, d) { return s + d.amount; }, 0);
    var bBalance = aPrincipal + bNewTotal;
    /* owner Nov 9: construction-interest horizon = CO day (98). finPostMonths stored but ignored.
       Lender A at finRateA until CO; Lender B at finRateB on outstanding balance from each draw through CO; permanent permLoanRate from CO. */
    var cEnd = horizon, cEndDay = horizon;
    var rBc = (n(inp.finRateB) != null && isFinite(n(inp.finRateB)) ? n(inp.finRateB) : rB * 100) / 100;
    var cuts=[0,1,aPayoffDay,horizon];
    for(var w=7;w<horizon;w+=7)cuts.push(w);
    aDraws.forEach(function(d){cuts.push(d.day);});bNew.forEach(function(d){cuts.push(d.day);});
    cuts=cuts.filter(function(d,i,a){return d>=0&&d<=horizon&&a.indexOf(d)===i;}).sort(function(a,b){return a-b;});
    var periods=[],cumInt=0,aBal=0,bBal=0,pendingA=0,pendingB=0,cashPayments=[];
    for(var i=0;i+1<cuts.length;i++){
      var st=cuts[i],en=cuts[i+1],days=en-st,advA=0,advB=0;
      aDraws.forEach(function(d){if(d.day===st){aBal+=d.amount;advA+=d.amount;}});
      if(st===aPayoffDay){bBal+=aBal;advB+=aBal;aBal=0;}
      bNew.forEach(function(d){if(d.day===st){bBal+=d.amount;advB+=d.amount;}});
      [['Lender A',aBal,rA,advA],['Lender B',bBal,rBc,advB]].forEach(function(z){
        if(!(z[1]>0))return;
        var it=z[1]*z[2]*days/365,isA=z[0]==='Lender A';
        if(isA)pendingA+=it;else pendingB+=it;
        var due=en%28===0||(isA?en===aPayoffDay:en===horizon),paid=due?(isA?pendingA:pendingB):0;
        if(due){cashPayments.push({day:en,lender:z[0],amount:paid,stub:en%28!==0});if(isA)pendingA=0;else pendingB=0;}
        cumInt+=it;periods.push({start:st,end:en,days:days,lender:z[0],phase:'construction',advance:z[3],balance:z[1],rate:z[2],interest:it,interestPaid:paid,unpaidInterest:isA?pendingA:pendingB,cumInterest:cumInt,paidAt:due?'Cash payment at Day '+en:'Accrued; not yet paid'});
      });
    }
    var aInterest=periods.filter(function(p){return p.lender==='Lender A';}).reduce(function(s,p){return s+p.interest;},0);
    var accruedAtClose=cashPayments.filter(function(p){return p.lender==='Lender A'&&p.day===aPayoffDay;}).reduce(function(s,p){return s+p.amount;},0);
    var bConInt=cumInt-aInterest;
    var construction={endDay:horizon,endWeek:wk(horizon),rateA:rA,rateB:rBc,permanentRateB:rB,aInterest:Math.round(aInterest*100)/100,bInterest:Math.round(bConInt*100)/100,total:Math.round(cumInt*100)/100,paid:'Cash every fourth week (Days 28,56,...); Loan A interest stub settled in cash at delivery Day '+aPayoffDay+' when Loan B repays A principal; Loan B stub at CO Day '+horizon+' (B converts to permanent). Actual/365; not capitalized or financed.'};
    var scheduled = aPrincipal + bNewTotal + cashTotal;
    var unTot = unassigned.reduce(function (s, u) { return s + u.amount; }, 0);
    return {
      schedule: 'weekly',
      convention: 'Actual/365 weekly accrual; cash interest every fourth week and terminal stub. No capitalization.',
      cashPayments:cashPayments, aPayoffDay:aPayoffDay, permanentStartDay:horizon, factoryPayments:factoryPayments, lenderAUsed:aDraws.length>0, phases:[{label:"Permits",start:0,end:27},{label:"Site work",start:28,end:42},{label:"Production",start:7,end:48},{label:"Delivery / set",start:DELIVERY_DAY,end:DELIVERY_DAY},{label:"Certificate of occupancy",start:CO_DAY,end:CO_DAY}], days: { delivery: dDel, refi: dRefi, takeover:aPayoffDay, co: CO_DAY, permanentStart:horizon, lag: 0, horizonEnd: horizon },
      rates: { a: rA, b: rB }, pct: { d1: p1, d2: p2, d3: p3 }, aLtv: aLtv, aLtvMissing: !(aLtvRaw != null && isFinite(aLtvRaw) && aLtvRaw >= 0 && aLtvRaw <= 100), bLtv: B_LTV,
      bEligibleCost: bEligibleCost, bEligibleKeys: WEEKLY_PLAN.map(function (t) { return t.key; }), cashDraws: cashDraws, cashTotal: cashTotal,
      tasks: tasks, plan: WEEKLY_PLAN,
      production: { startDay: FACTORY_PRODUCTION.start, endDay: Math.min(FACTORY_PRODUCTION.start + FACTORY_PRODUCTION.dur, dDel) - 1, days: Math.min(FACTORY_PRODUCTION.dur, dDel - FACTORY_PRODUCTION.start) },
      provisional: { pending: 'Marriage line is an automatic planning estimate (seam work sf from footprint x regional whole-building $/floor sf proxy, South $100), not a contractor bid', recorded: 'Draws on bar start days; permits 4 weekly starts; factory 60% Loan A progress payments Days 7-42, repaid by Loan B at delivery Day 49; 40% balance Loan B Day 49; land and closing Loan B Day 0; engineering and siding removed' },
      aDraws: aDraws, aPeak: aPrincipal, aPayoff: aPrincipal, accruedAtClose: accruedAtClose,
      bNew: bNew, bNewTotal: bNewTotal, bBalance: bBalance,
      sourcesUses: { uses: [{ label: 'Loan A factory progress payments (' + A_SHARE_LBL + '% of factory, ' + A_LTV_LBL + '% financed)', amount: aPrincipal }, { label: 'Lender B advances (' + B_LTV_LBL + '% of site, installation, land, closing and ' + BAL_LBL + '% factory balance)', amount: bNewTotal }, { label: 'Borrower cash (' + B_CASH_LBL + '% not financed)', amount: cashTotal }], sources: [{ label: 'Lender B loan (incl. Loan A payoff at delivery)', amount: bBalance }, { label: 'Borrower cash', amount: cashTotal }] },
      fundingGap: 0,
      unassigned: unassigned, unassignedTotal: unTot,
      scheduledProjectCost: scheduled, worksheetTotal: r.total, reconciles: Math.abs(scheduled + unTot - r.total) < 0.005,
      periods: periods, aInterest: aInterest, bInterest: cumInt - aInterest, totalInterest: cumInt, construction: construction,
      missingKeys: r.costLines.filter(function (l) { return l.value == null || !isFinite(l.value); }).map(function (l) { return l.key; }),
      partial: r.costLines.some(function (l) { return l.value == null || !isFinite(l.value); })
    };
  }
  function computeFinancing(rawInputs) {
    var inp = normalizeInputs(rawInputs || {});
    /* owner 18:53: one consistent loan structure everywhere (A factory loan paid in full by B at the refi day 240; B 80% eligible, 7%/30 yr).
       The old monthly schedule had no UI control; it is retired and kept only as unused reference code. */
    void inp; return computeFinancingWeekly(rawInputs);
  }


  /* owner 17:01: returns from saved inputs + the existing cost result. Pure; no cost/draw/construction-loan changes.
     grossAnnualRent = rent x 12 (whole project) or rent x units x 12 (per dwelling); EGI = gross x (1 - vacancy%);
     NOI = EGI - annual opex (opex includes management); YOC = NOI / total project cost (only when every cost line is present);
     monthly payment = L*i/(1-(1+i)^-n), i = rate/12, n = years*12 (rate 0: L/n; loan 0: 0); annual debt service = 12 x payment;
     after-debt cash flow = NOI - debt service; CoC = cash flow / cash invested; simple payback = cash invested / cash flow (cash flow > 0 only). */
  /* owner 19:18: pure income helper (no cost/compute dependency) shared by compute() value and computeReturns NOI.
     gross = rent x 12 (whole project) or rent x units x 12 (per dwelling); EGI = gross x (1 - vacancy) ONCE; opex = % of EGI (incl. management) or $; NOI = EGI - opex. */
  function incomeFromInputs(inp) {
    var miss = [];
    function nn(v) { v = n(v); return v != null && isFinite(v) ? v : null; }
    var L = null, rate = null, yrs = null, cash = null;
    var rent = nn(inp.rent), basis = inp.rentBasis === 'dwelling' || inp.rentBasis === 'project' ? inp.rentBasis : '', units = nn(inp.units);
    var vac = nn(inp.vacancyPct), opex = nn(inp.opexAnnual), L = nn(inp.permLoanAmt), rate = nn(inp.permLoanRate), yrs = nn(inp.permLoanYears), cash = nn(inp.cashInvested);
    var gross = null;
    if (rent == null || rent < 0) miss.push('rent');
    if (!basis) miss.push('rent basis');
    if (basis === 'dwelling' && !(units != null && units >= 1)) miss.push('number of units');
    if (rent != null && rent >= 0 && basis === 'project') gross = rent * 12;
    if (rent != null && rent >= 0 && basis === 'dwelling' && units != null && units >= 1) gross = rent * Math.round(units) * 12;
    if (vac == null || vac < 0 || vac > 100) miss.push('vacancy %');
    var egi = gross != null && vac != null && vac >= 0 && vac <= 100 ? gross * (1 - vac / 100) : null;
    // One combined allowance, percentage of effective collected rent; no separate repair deduction.
    var opexMode='pct',opexPct=nn(inp.maintenanceManagementPct);
    if(opexPct==null && inp.maintenanceManagementPct===undefined)opexPct=10;
    opex=null;if(opexPct==null||opexPct<0||opexPct>100)miss.push('maintenance and management %');else if(egi!=null)opex=egi*opexPct/100;
    var tax = nn(inp.opexTaxes), ins = nn(inp.opexInsurance), utilMode = inp.utilitiesMode === 'tenant' ? 'tenant' : 'owner' /* owner 19:37: no payer selector; blank = owner expense */, utilAmt = nn(inp.opexUtilities);
    var rmPct=0,resPer=0,provisional=[];
    /* owner 19:29-19:31: provisional address benchmarks (btr-tax-insurance-utilities.md), used ONLY when the input is blank; user entries always win.
       Whole property, 2-dwelling basis, not per unit, not tied to NOI/cap value (no circularity). Any benchmark in use => provisional. */
    var BM_TAX = 4575, BM_INS = 3600, BM_ELEC = 4064.40;
    [['Property taxes', tax], ['Insurance', ins]].forEach(function (x) { if (x[1] != null && x[1] < 0) miss.push(x[0].toLowerCase() + ' (0 or more)'); });
    var taxBm = tax == null || tax === BM_TAX, insBm = ins == null || ins === BM_INS;
    if (taxBm) { if (tax == null) tax = BM_TAX; provisional.push('property taxes (benchmark, assessment unverified)'); }
    if (insBm) { if (ins == null) ins = BM_INS; provisional.push('insurance (benchmark, not a quote)'); }
    var util = null, utilBm = false;
    if (utilMode === 'tenant') util = 0;
    else if (utilMode === 'owner') { if (utilAmt == null || utilAmt === BM_ELEC) { util = BM_ELEC; utilBm = true; provisional.push('owner-paid electricity (benchmark)'); } else if (utilAmt < 0) miss.push('utilities (0 or more)'); else util = utilAmt; }
    else provisional.push('utilities (tenant-paid or owner-paid)');
    var lines = [
      { key: 'management', label: 'Maintenance and management', value: opex, basis: opexPct+'% of collected rent', source: 'Owner Nov 8: one combined editable allowance; no separate maintenance or reserves' },
      { key: 'taxes', label: 'Property taxes', value: tax != null && tax >= 0 ? tax : null, basis: 'annual $', source: taxBm ? 'PROVISIONAL benchmark, not user input: $375,000 ASSUMED completed assessment (prior model manual value, not assessor-confirmed; verification pending) x 1.22% official Roanoke city rate = $4,575/yr whole property. Current parcel 202-1748 (401 Harrison Ave NW): land assessment $13,700 (third-party), unimproved tax $167.14; not stabilized tax' : 'User entered' },
      { key: 'insurance', label: 'Insurance', value: ins != null && ins >= 0 ? ins : null, basis: 'annual $', source: insBm ? 'PROVISIONAL benchmark, not user input or a quote: 2 x $1,800/yr national SFR proxy ($300k dwelling coverage each); not a local quote or prior reviewed template' : 'User entered' },
      { key: 'utilities', label: 'Utilities', value: util, basis: utilMode === 'tenant' ? 'tenant-paid: no owner expense (informational electricity benchmark $4,064.40/yr, 2 homes)' : utilMode === 'owner' ? (utilBm ? 'owner-paid electricity benchmark' : 'owner-paid annual $') : 'not set', source: utilBm ? 'PROVISIONAL benchmark, not user input or a quote: Appalachian Power Nov 1 official bill, 1,000 kWh/mo each before tax = $169.35/mo x 12 x 2 homes = $4,064.40/yr; usage assumed, not measured or size-verified; electricity only (no water/gas/waste)' : utilMode ? 'User entered' : 'Needs tenant/owner choice (payer not assumed)' }
    ];
    var totalOpex = opex != null && opex >= 0 ? lines.reduce(function (a, l) { return a + (l.value || 0); }, 0) : null;
    var noi = egi != null && totalOpex != null ? egi - totalOpex : null;
    var reserves=0; // Owner Nov 8 15:11: reserve policy removed; legacy saved values untouched.
    return { rent: rent, rentBasis: basis, units: units, vacancyPct: vac, grossAnnualRent: gross, vacancyLoss: gross != null && egi != null ? gross - egi : null, egi: egi, opexMode: opexMode, opexPct: opexMode === 'pct' ? opexPct : null, opexAnnual: opex, managementFee: opex,
      opexLines: lines, totalOpex: totalOpex, noi: noi, provisional: provisional, isProvisional: provisional.length > 0,
      reservesPerUnit: resPer, reservesAnnual: reserves, reservesSource: 'Removed by owner',
      cfAfterReservesBeforeDebt: noi != null && reserves != null ? noi - reserves : null, missing: miss };
  }
  /* owner 19:18: Estimated completed property value = NOI / cap rate (whole property). Unavailable (null + reasons) if NOI or cap rate is missing/<= 0. */
  function propertyValueFromInputs(inp) {
    var inc = incomeFromInputs(inp), cap = n(inp.capRatePct), miss = inc.missing.slice();
    if (cap == null || !isFinite(cap) || !(cap > 0)) miss.push('cap rate');
    var v = inc.noi != null && cap != null && isFinite(cap) && cap > 0 ? inc.noi / (cap / 100) : null;
    if (inc.noi != null && inc.noi <= 0 && v != null) { miss.push('positive NOI'); v = null; }
    return { value: v, noi: inc.noi, capRatePct: cap, missing: v == null ? miss : [] };
  }


  /* owner Nov 8 08:02: N-year hold and sale. Rent grows 3%/yr (same as the 5-year rent projection); vacancy, management %, maintenance % scale with rent;
     taxes, insurance, electricity, reserves held flat (no expense growth in the model). Debt service constant (Lender B P&I). Sale at end of final year:
     price = final-year NOI / exit cap; less selling cost %; less Lender B balance after holdYears*12 payments. Year 0 = -cash invested.
     Construction interest excluded (as in returns). */
  // Owner Nov 9: 60 monthly IO payments counted from project month 0 (months 1-60 in this schedule = calendar months 1-60; month 0 seed separate),
  // then 360-payment amortization from month 61. Hold sale at month 60. Permanent 8% applies from CO; schedule assumes full L for IO/P&I math.
  function permanentSchedule(L, ratePct) {
    var rate=ratePct/1200,ioMonths=60,amortMonths=360;
    if(!(L>=0)||!(rate>=0))return {valid:false,rows:[],months:[]};
    var amortPayment=rate===0?L/amortMonths:L*rate/(1-Math.pow(1+rate,-amortMonths)),bal=L,months=[],rows=[],yr;
    for(var k=1;k<=ioMonths+amortMonths;k++){
      var interest=bal*rate,principal=k<=ioMonths?0:Math.min(bal,amortPayment-interest);
      if(k===ioMonths+amortMonths)principal=bal;
      var payment=interest+principal,begin=bal;bal-=principal;if(Math.abs(bal)<1e-7)bal=0;
      var month={month:k,begin:begin,payment:payment,interest:interest,principal:principal,end:bal,phase:k<=ioMonths?'Interest-only':'Principal & interest'};months.push(month);
      var y=Math.ceil(k/12);if(!yr||yr.year!==y){yr={year:y,begin:begin,payments:0,interest:0,principal:0,months:0,phase:month.phase};rows.push(yr);}
      yr.payments+=payment;yr.interest+=interest;yr.principal+=principal;yr.months++;yr.end=bal;
    }
    return {valid:true,loan:L,rate:ratePct,years:35,ioYears:5,amortYears:30,monthlyPayment:L*rate,amortPayment:amortPayment,payments:420,rows:rows,months:months,totalPayments:months.reduce(function(a,x){return a+x.payment;},0),totalInterest:months.reduce(function(a,x){return a+x.interest;},0),totalPrincipal:L};
  }

  function computeHold(inp, result) {
    function nn(v) { v = n(v); return v != null && isFinite(v) ? v : null; }
    var R = computeReturns(inp, result), cap = nn(inp.exitCapPct), sc = nn(inp.sellCostPct), H = nn(inp.holdYears), miss = [];
    if (cap == null || cap <= 0) miss.push('exit cap rate'); if (sc == null || sc < 0) miss.push('selling cost %'); if (H == null || H < 1 || H > 30) miss.push('hold years (1-30)');
    if (R.noi == null || R.annualDebtService == null || R.cashInvested == null || R.lenderB == null) miss.push('NOI, debt service and cash invested');
    if (miss.length) return { missing: miss, years: [] };
    H = Math.round(H);
    var inc = incomeFromInputs(inp), G = 0.03, vacP = nn(inp.vacancyPct) / 100, rmP = 0, gross1 = inc.grossAnnualRent;
    function lv(k) { var l = inc.opexLines.filter(function (x) { return x.key === k; })[0]; return l && l.value != null ? l.value : 0; }
    var mg1 = lv('management'), fixed = inc.totalOpex - mg1 - lv('repairs');
    var mgP = inc.egi ? mg1 / inc.egi : 0, res = R.reservesAnnual || 0, ads = R.annualDebtService, years = [], flows = [-R.cashInvested], debtPlan=permanentSchedule(R.lenderB,R.lenderBRate);
    for (var t = 1; t <= H; t++) { ads=debtPlan.rows[t-1].payments; var g = gross1 * Math.pow(1 + G, t - 1), vac = g * vacP, egi = g - vac, mg = egi * mgP, rm = g * rmP, noi = egi - mg - rm - fixed, cf = noi - ads - res;
      years.push({ year: t, gross: g, vacancy: vac, egi: egi, management: mg, maintenance: rm, fixedOpex: fixed, taxes: lv('taxes'), insurance: lv('insurance'), electricity: lv('utilities'), noi: noi, debtService: ads, reserves: res, cashFlow: cf }); flows.push(cf); }
    var L=R.lenderB,k=H*12,bal=k>0?debtPlan.months[Math.min(k,debtPlan.months.length)-1].end:L;
    var price = years[H - 1].noi / (cap / 100), cost = price * sc / 100, net = price - cost - bal;
    flows[H] += net;
    var ops = years.reduce(function (s, y) { return s + y.cashFlow; }, 0), dist = ops + net;
    /* owner Nov 9: hold anchored to project month 0 (IO window from month 0). Equity at t=0; operating Year y at t=y; sale at end of Year 5 = month 60.
       Construction interest still in Year-0 cash invested; CO (~Day 98) falls inside Year 1. Report constructionDays for reference. */
    var fin0 = computeFinancing(inp), conDays = fin0 && fin0.days ? fin0.days.horizonEnd : 0, conYrs = 0;
    var times = flows.map(function (c, j) { return j; });
    function npvT(x, tm) { return flows.reduce(function (s, c, j) { return s + c / Math.pow(1 + x, tm[j]); }, 0); }
    var tOp = flows.map(function (c, j) { return j; });
    function solve(tm) { if (!(R.cashInvested > 0 && npvT(-0.99, tm) > 0 && npvT(10, tm) < 0)) return null; var lo = -0.99, hi = 10; for (var q = 0; q < 200; q++) { var mid = (lo + hi) / 2; if (npvT(mid, tm) > 0) lo = mid; else hi = mid; } return (lo + hi) / 2; }
    var irr = solve(times), irrOperating = solve(tOp);
    var npv10 = npvT(0.10, times), cum = 0, dcum = 0, hp = null, dp = null, hpOp = null;
    for (var y = 1; y < flows.length; y++) { var dc = flows[y] / Math.pow(1.1, times[y]); cum += flows[y]; dcum += dc;
      if (hp == null && cum >= R.cashInvested) { hp = times[y]; hpOp = y; }
      if (dp == null && dcum >= R.cashInvested) dp = times[y]; }
    /* owner Nov 8 08:44: paybacks are discrete year-ends (same end-of-year convention as IRR); no pro-rata, sale received only at end of final year */
    return { npv10: npv10, holdPayback: hp, discountedPayback10: dp, missing: [], holdYears: H, exitCapPct: cap, sellCostPct: sc, rentGrowth: G, years: years, salePrice: price, sellingCost: cost, loanBalance: bal, netSale: net,
      operatingCashTotal: ops, totalDistributions: dist, equity: R.cashInvested, profit: dist - R.cashInvested, equityMultiple: R.cashInvested > 0 ? dist / R.cashInvested : null, irr: irr, irrOperating: irrOperating, holdPaybackOperating: hpOp, constructionDays: conDays, constructionYears: conYrs, flowTimes: times, flows: flows };
  }
  function computeReturns(rawInputs, costResult) {
    var inp = normalizeInputs(rawInputs || {}), r = costResult || compute(inp), miss = [];
    function nn(v) { v = n(v); return v != null && isFinite(v) ? v : null; }
    var inc = incomeFromInputs(inp); miss = inc.missing.slice();
    var rent = inc.rent, basis = inc.rentBasis, units = inc.units, vac = inc.vacancyPct, gross = inc.grossAnnualRent, egi = inc.egi, opexMode = inc.opexMode, opexPct = inc.opexPct, opex = inc.opexAnnual, noi = inc.noi;
    var L = nn(inp.permLoanAmt), rate = nn(inp.permLoanRate), yrs = nn(inp.permLoanYears), cash = nn(inp.cashInvested);
    var cost = r && isFinite(r.total) ? r.total : null, costComplete = !!(r && r.missing === 0 && cost != null && cost > 0);
    var yoc = null; /* owner Nov 8 11:17: YOC on all-in cost incl. construction interest (set below) */
    if (!costComplete) miss.push('complete project cost (cost lines missing)');
    /* owner 18:46/Nov 9: ongoing debt = Lender B only (Lender A paid in full by B at CO). Lender B = A payoff principal + 80% of eligible lines;
       30-yr amortization at permLoanRate. Cash invested = total project cost - Lender B. One-time construction interest IS added once to cash invested (owner Nov 8 11:13). */
    var fin = computeFinancing(inp), AMORT = 30, ads = null, pmt = null, aRate = nn(inp.finRateA), aLtvP = nn(inp.aLtvPct);
    L = null; cash = null;
    if (aLtvP == null || aLtvP < 0 || aLtvP > 100) miss.push('Lender A LTV %');
    if (aRate == null || aRate < 0) miss.push('Lender A rate');
    if (rate == null || rate < 0) miss.push('Lender B rate');
    var finOk = costComplete && !fin.partial && miss.indexOf('Lender A LTV %') < 0;
    if (finOk) L = fin.bBalance;
    if (L != null && rate != null && rate >= 0) {
      pmt=L*rate/1200; ads=pmt*12; // First five operating years: monthly interest-only.
    }
    /* owner 19:22/19:24: CoC and payback use cash flow after replacement reserve and after Lender B debt service; NOI (before reserves) feeds YOC, cap value and DSCR. */
    var cfPreReserve = noi != null && ads != null ? noi - ads : null;
    var resAnn = inc.reservesAnnual; if (inc.reservesPerUnit == null || resAnn == null) { if (miss.indexOf('replacement reserve') < 0) miss.push('replacement reserve'); }
    var cf = cfPreReserve != null && resAnn != null ? cfPreReserve - resAnn : null;
    var dscr = noi != null && ads != null && ads > 0 ? noi / ads : null;
    /* owner Nov 8 11:13: one-time construction interest (Lender A + Lender B to construction end), paid in borrower cash, added ONCE to upfront equity / all-in cost.
       Not in NOI, cap value, or annual cash flow; Lender B principal unchanged (not capitalized). */
    var conInt = fin.construction && finOk ? fin.construction.total : null, costAllIn = cost != null && conInt != null ? Math.round((cost + conInt) * 100) / 100 : null;
    if (L != null) cash = conInt != null ? cost + conInt - L : cost - L;
    yoc = noi != null && costComplete ? noi / (costAllIn != null ? costAllIn : cost) : null;
    var equityNonPositive = cash != null && !(cash > 0);
    if (equityNonPositive) miss.push('positive cash invested (Lender B is at or above project cost)');
    var coc = cf != null && cash != null && cash > 0 && miss.indexOf('Lender A rate') < 0 ? cf / cash : null;
    var payback = cf != null && cash != null && cash > 0 && miss.indexOf('Lender A rate') < 0 ? (cf > 0 ? cash / cf : 'none') : null;
    return { provisional: inc.provisional, isProvisional: inc.isProvisional, opexLines: inc.opexLines, totalOpex: inc.totalOpex, vacancyLoss: inc.vacancyLoss, reservesAnnual: resAnn, reservesPerUnit: inc.reservesPerUnit, cfBeforeReserves: cfPreReserve, cfAfterReservesBeforeDebt: inc.cfAfterReservesBeforeDebt, dscr: dscr, dscrReference: 1.2,
      rentBasis: basis, grossAnnualRent: gross, egi: egi, opexMode: opexMode, opexPct: opexMode === 'pct' ? opexPct : null, opexAnnual: opex, noi: noi, totalCost: cost, constructionInterest: conInt, totalCostAllIn: costAllIn, costComplete: costComplete, yoc: yoc,
      lenderB: L, lenderBRate: rate, amortYears: 30, ioYears:5, amortizationPayment:L!=null&&rate!=null?permanentSchedule(L,rate).amortPayment:null, aPayoff: fin.aPayoff, aOutstandingAtDelivery: fin.aPeak, aBalanceAfterPayoff: fin.aPeak != null && fin.aPayoff != null ? Math.round((fin.aPeak - fin.aPayoff) * 100) / 100 : null, aLtvPct: aLtvP, aRate: aRate, bEligibleCost: fin.bEligibleCost, bNewAdvances: fin.bNewTotal, aInterest: fin.aInterest, accruedAtTakeover: fin.accruedAtClose, monthlyPayment: pmt, annualDebtService: ads, equityNonPositive: equityNonPositive, afterDebtCF: cf, cashInvested: cash, coc: coc, payback: payback, missing: miss };
  }

  function readDomInputs() {
    /* owner 15:02: Inputs page shows 5 fields only; start from saved state so fields not on the page keep their saved values */
    var out = clone(loadInputs());
    Object.keys(FIELD_MAP).forEach(function (id) {
      var el = typeof document !== 'undefined' ? document.getElementById(id) : null;
      if (!el) return;
      var key = FIELD_MAP[id];
      var isMoney = el.hasAttribute && el.hasAttribute('data-money'); /* demo Nov 11: $-formatted text fields still parse as numbers */
      if (!isMoney && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.type === 'text')) {
        out[key] = el.value;
      } else {
        var t = String(el.value || '').replace(isMoney ? /[$,\s]/g : /^$/, '').trim();
        out[key] = t === '' ? null : +t;
        if (t !== '' && !isFinite(out[key])) out[key] = t;
      }
    });
    out.strip = 2;
    var milesEl = typeof document !== 'undefined' ? document.getElementById('inpMiles') : null;
    out.milesUser = !!(milesEl && milesEl.dataset && milesEl.dataset.user === '1');
    return out;
  }

  function applyInputsToDom(inputs) {
    var inp = normalizeInputs(inputs);
    Object.keys(FIELD_MAP).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var key = FIELD_MAP[id];
      var v = inp[key];
      if (id === 'inpStrip') {
        el.value = '2';
        el.readOnly = true;
        return;
      }
      if (v == null || v === '') {
        if (el.tagName !== 'SELECT') el.value = '';
        return;
      }
      el.value = String(v);
    });
    var milesEl = document.getElementById('inpMiles');
    if (milesEl) {
      if (inp.milesUser) {
        milesEl.dataset.user = '1';
        milesEl.dataset.auto = '0';
      } else {
        milesEl.dataset.user = '0';
        milesEl.dataset.auto = '1';
      }
    }
  }

  root.BespokeCore = {
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_VER: STORAGE_VER,
    FACTORY: FACTORY,
    DEFAULTS: DEFAULTS,
    FIELD_MAP: FIELD_MAP,
    loadInputs: loadInputs,
    saveInputs: saveInputs,
    computeReturns: computeReturns,
    computeHold: computeHold,
    permanentSchedule: permanentSchedule,
    incomeFromInputs: incomeFromInputs,
    propertyValueFromInputs: propertyValueFromInputs,
    normalizeInputs: normalizeInputs,
    compute: compute,
    computeFinancing: computeFinancing,
    computeFinancingLegacy: computeFinancingLegacy,
    WEEKLY_PLAN: WEEKLY_PLAN,
    FACTORY_PRODUCTION: FACTORY_PRODUCTION,
    CO_DAY: CO_DAY,
    money: money,
    moneyExact: moneyExact,
    readDomInputs: readDomInputs,
    applyInputsToDom: applyInputsToDom,
    deriveBoxes: deriveBoxes,
    haversineMi: haversineMi,
    MAR_REGION_PSF: MAR_REGION_PSF
  };
})(typeof window !== 'undefined' ? window : this);
