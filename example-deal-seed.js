/* LOCAL hero seed: example-deal share inputs -> bespoke.core.inputs.v1 if empty / incomplete.
   Source: https://bespoke-deal-share-roanoke.netlify.app/share-snapshot.js (2026-11-09T09:07:00-05:00)
   Does not change model calculations. */
(function(){
  var KEY='bespoke.core.inputs.v1';

  function scrubStored(){
    try{
      var raw = localStorage.getItem(KEY);
      if(!raw) return;
      var p = JSON.parse(raw);
      var changed = false;
      if(p && p.inputs && typeof p.inputs.addr === 'string' && /roanoke|harrison avenue|24016|sample modular deal/i.test(p.inputs.addr)){
        p.inputs.addr = ''; changed = true;
      }
      if(p && typeof p.label === 'string' && /roanoke/i.test(p.label)){
        p.label = 'Sample Modular Deal'; changed = true;
      }
      if(changed) localStorage.setItem(KEY, JSON.stringify(p));
    }catch(e){}
  }
  scrubStored();

  var PAYLOAD={"v":1,"savedAt":"2026-11-09T09:07:00-05:00","source":"bespoke-deal-share-roanoke.netlify.app share-snapshot","label":"Sample Modular Deal","inputs":{"addr":"","units":2,"houseW":28,"houseL":53.571,"area":1500,"boxes":2,"wallH":12,"strip":2,"split":"long","driveSetback":25,"milesBasis":"estimate","miles":null,"milesUser":false,"transport":11500,"craneDay":1600,"crane":10000,"cpsf":null,"cpsfSrc":"ILLUSTRATIVE construction $/sf for marriage strips only — NOT Zillow sale/new-construction price.","marriageOverride":null,"marMode":"surfaceEst","marStripFt":2,"marInnerWallH":8,"marMinHouseWidthFt":28,"marHourlyRate":400,"marJobMinimum":10000,"land":18000,"landClose":540,"permit":15000,"clear":8000,"septic":12000,"water":3500,"power":6500,"landscape":7500,"foundation":18000,"drive":8000,"factory":180000,"arv":375000,"opexTaxes":4575,"opexInsurance":3600,"utilitiesMode":"owner","opexUtilities":4064.4,"opexRepairsPct":5,"reservesPerUnit":250,"capRatePct":5,"rent":3750,"exitCapPct":5,"sellCostPct":6,"holdYears":5,"mgmt":10,"finRateA":12,"bLtvPct":80,"aLtvPct":100,"finRateB":10,"finDraw1Pct":30,"finDraw2Pct":30,"finDeliveryDay":90,"finRefiLagDays":3,"finPostMonths":6,"rentBasis":"dwelling","vacancyPct":5,"opexMode":"pct","maintenanceManagementPct":10,"opexPct":10,"factoryTotal":270000,"uwDefaultsVer":12,"opexAnnual":null,"permLoanAmt":280000,"permLoanRate":8,"permLoanYears":30,"cashInvested":100000,"yocHurdle":8,"finSchedule":"weekly"}};
  function needsSeed(raw){
    if(!raw) return true;
    try{
      var p=JSON.parse(raw);
      if(!p||p.v!==1||!p.inputs) return true;
      var rb=p.inputs.rentBasis;
      if(rb!=='dwelling'&&rb!=='project') return true; /* DEFAULTS leave rentBasis blank -> Unavailable tiles */
      return false;
    }catch(e){ return true; }
  }
  try{
    if(typeof localStorage==='undefined') return;
    if(needsSeed(localStorage.getItem(KEY))){
      localStorage.setItem(KEY, JSON.stringify(PAYLOAD));
      try{ console.info('[bespoke-core] seeded', KEY, 'from example-deal share snapshot', PAYLOAD.label); }catch(e){}
    }
  }catch(e){ try{ console.warn('[bespoke-core] seed failed', e); }catch(e2){} }
})();
