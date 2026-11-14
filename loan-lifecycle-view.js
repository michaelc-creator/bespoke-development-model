/* Loan lifecycle presentation. Reads shared engine only; never writes Inputs. */
(function(w){'use strict';
function m(v){var n=Number(v||0),neg=n<0;n=Math.abs(n);var s='$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return neg?'-'+s:s;}
function chart(rows,kind,id,color){
 var area=kind==='area',key=area?'balance':kind==='interest'?'paid':kind==='draw'?'draw':'balance';
 var title=area?'Outstanding Principal':kind==='interest'?'Interest Paid':kind==='draw'?'Advances and transfer in':'Outstanding Principal';
 var series=rows.map(function(r){return [r.label, +r[key]||0];});
 var monthly=rows[0]&&rows[0].label&&rows[0].label.charAt(0)==='M';
 var drawKind=(kind==='interest'&&!monthly)?'vBars':'areaLine';
 return '<div class="chart-slot" id="'+id+'" data-core-chart="loan" data-kind="'+drawKind+'" data-title="'+title+'" data-rows="'+String(JSON.stringify(series)).replace(/"/g,'&quot;')+'" style="min-height:240px;height:240px"></div>';
}
function table(rows,quarter,id){var aWeekly=id==='loanAWeeklyTable';var keys=quarter?['label','day','balance']:['label','range','draw','accrued','paid','unpaid','principalPaid','balance'];if(aWeekly)keys=keys.filter(function(k){return k!=='range';});var heads=quarter?['Quarter','Relative day','Ending principal']:['Week','Relative days','Draw / transfer in','Interest accrued','Interest paid','Unpaid interest','Principal paid / transferred out','Ending principal'];if(aWeekly)heads=heads.filter(function(h){return h!=='Relative days';});return '<div class="loan-table-wrap" style="overflow:visible;margin:0;padding:0;border:0;background:transparent;box-shadow:none"><table class="out-table" id="'+id+'"><thead><tr>'+heads.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+keys.map(function(k){return '<td'+(k==='label'||k==='range'||k==='day'?'':' class="num"')+'>'+(k==='label'||k==='range'||k==='day'?r[k]:m(r[k]))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
/* owner Nov 11 14:05: Loan A interest accrues every week on the six $27k draws but is paid in cash only every 28 days and at payoff (W4, W7),
   so an "Interest Paid" chart looked empty. Show interest accrued each week; weeks with a cash payment are darker and named in the title. */
function aPaidWeeks(rows){return rows.filter(function(r){return (+r.paid||0)>0;});}
function aIntTitle(rows){var pw=aPaidWeeks(rows);return 'Interest Accrued Weekly'+(pw.length?' · paid '+pw.map(function(r){return r.label;}).join(', '):'');}
function aIntChart(rows){var series=rows.map(function(r){var p=+r.paid||0;return [r.label,+r.accrued||0,r.label+' · accrued '+m(r.accrued)+(p>0?' · paid '+m(p):''),p>0?'#359BC5':'#A9DCEF'];});
 return '<div class="chart-slot" id="loanAWeeklyInterestChart" data-core-chart="loan" data-kind="vBars" data-title="Interest Accrued Weekly" data-rows="'+String(JSON.stringify(series)).replace(/"/g,'&quot;')+'" style="min-height:240px;height:240px"></div>'+
 '<div class="loan-a-int-key" style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#A9DCEF;margin:8px 0 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#A9DCEF;margin-right:6px"></i>Accrued</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#359BC5;margin-right:6px"></i>Accrued · paid in cash that week</span></div>';}
function data(B,inp){var f=B.computeFinancing(inp),R=B.computeReturns(inp,B.compute(inp));
 function bal(day,isA){if(isA){if(day>=f.aPayoffDay)return 0;return f.aDraws.reduce(function(s,d){return s+(d.day<=day?d.amount:0);},0);}var v=f.bNew.reduce(function(s,d){return s+(d.day<=day?d.amount:0);},0)+(day>=f.aPayoffDay?f.aPayoff:0);if(day>=f.permanentStartDay){var n=Math.max(0,Math.floor(day/(365/12)));var plan=B.permanentSchedule(R.lenderB,R.lenderBRate);if(n>=1)v=plan.months[Math.min(n,plan.months.length)-1].end;else v=R.lenderB;}return Math.max(0,v);}
 function weekly(isA){var ln=isA?'Lender A':'Lender B',end=isA?f.aPayoffDay:f.permanentStartDay,rows=[],unpaid=0;
 for(var s=0,k=1;s<end;s+=7,k++){var e=Math.min(s+7,end),ps=f.periods.filter(function(p){return p.lender===ln&&p.start>=s&&p.end<=e;}),ac=ps.reduce(function(v,p){return v+p.interest;},0),paid=f.cashPayments.filter(function(p){return p.lender===ln&&p.day>s&&p.day<=e;}).reduce(function(v,p){return v+p.amount;},0),ds=(isA?f.aDraws:f.bNew).filter(function(d){return (d.day>s||s===0&&d.day===0)&&d.day<=e;}).reduce(function(v,d){return v+d.amount;},0);
 if(!isA&&f.aPayoffDay>s&&f.aPayoffDay<=e)ds+=f.aPayoff;unpaid+=ac-paid;
 rows.push({label:'W'+k,range:s+'–'+e,draw:ds,accrued:ac,paid:paid,unpaid:Math.abs(unpaid)<1e-7?0:unpaid,principalPaid:isA&&e===end?f.aPayoff:0,balance:bal(e,isA)});}
 return rows;}
 var permanent=B.permanentSchedule(R.lenderB,R.lenderBRate),bm=[];
 // Project-relative months; M0 = Day 0. IO window months 0-60 from project start; permanent 8% IO/P&I applied after CO using schedule month index = project month.
 for(var q=0;q<=60;q++){
   var end=q*365/12,start=q===0?0:(q-1)*365/12;
   var inPeriod=function(day){return q===0?day===0:day>start&&day<=end;};
   var draw=f.bNew.filter(function(x){return inPeriod(x.day);}).reduce(function(v,x){return v+x.amount;},0);
   if(inPeriod(f.aPayoffDay))draw+=f.aPayoff;
   var paid=0,principalPaid=0;
   if(end<f.permanentStartDay){
     paid=f.cashPayments.filter(function(x){return x.lender==='Lender B'&&inPeriod(x.day);}).reduce(function(v,x){return v+x.amount;},0);
   } else if(q>=1 && permanent.months[q-1]){
     var pm=permanent.months[q-1]; paid=pm.interest; principalPaid=pm.principal;
   }
   var endBal=bal(end,false);
   var phase=end===0?'Initial funding':end<f.permanentStartDay?'Construction (B 10%)':'Interest-only 8%';
   if(q===60){ /* sale at month 60: pay off remaining principal */
     principalPaid=endBal; endBal=0; phase='Sale / principal payoff';
   }
   bm.push({label:'M'+q,day:end,phase:phase,draw:draw,paid:paid,principalPaid:principalPaid,balance:endBal});
 }
 return {f:f,R:R,a:weekly(true),b:weekly(false),bm:bm};
}
function monthlyTable(rows){return '<div class="loan-table-box" id="loanBMonthlyTableContainer" hidden aria-hidden="true" style="display:none!important;overflow:visible;border:0;margin:0;padding:0;box-shadow:none;background:transparent"><table class="out-table" id="loanBMonthlyTable"><thead><tr><th>Month</th><th>Project day</th><th>Phase</th><th>Advances / transfer in</th><th>Interest paid</th><th>Principal paid</th><th>Ending principal</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td>'+x.label+'</td><td>'+Number(x.day.toFixed(2))+'</td><td>'+x.phase+'</td><td class="num">'+m(x.draw)+'</td><td class="num">'+m(x.paid)+'</td><td class="num">'+m(x.principalPaid)+'</td><td class="num">'+m(x.balance)+'</td></tr>';}).join('')+'</tbody></table></div>';}
function render(){var B=w.BespokeCore,out=document.getElementById('outRoot');if(!B||!out)return;var el=document.getElementById('loanLifecycleBottom');if(!el){el=document.createElement('section');el.id='loanLifecycleBottom';el.className='sec';}var d=data(B,B.loadInputs());w.__BU_lifecycle=d;
 var colors={A:'#359BC5',B:'#4FB3DC'};
 var h='<style>'+
'#loanLifecycleBottom{background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;padding:0!important;margin:24px 0!important}'+
'#loanLifecycleBottom .loan-card{background:#171918!important;border:0!important;outline:0!important;border-radius:12px!important;box-shadow:0 10px 28px rgba(0,0,0,.28)!important;padding:16px!important;margin:0 0 24px;box-sizing:border-box}'+
'#loanLifecycleBottom .loan-card>h3{margin:0 0 12px;padding:0;border:0;color:#ffffff;font:700 15px/1.3 "Switzer",sans-serif}'+
'#loanLifecycleBottom .loan-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:0 0 16px;padding:0;border:0;background:transparent;box-shadow:none}'+
'#loanLifecycleBottom .loan-chart{min-width:0;margin:0;padding:0;border:0;outline:0;background:transparent;box-shadow:none;border-radius:0}'+
'#loanLifecycleBottom .loan-chart h4{margin:0 0 8px;padding:0;border:0;color:#ffffff;font:700 13px/1.3 "Switzer",sans-serif}'+
'#loanLifecycleBottom .loan-table-wrap{margin:0;padding:0;border:0;background:transparent;box-shadow:none}'+
'#loanLifecycleBottom .loan-card .out-table{margin:0}'+
'#loanLifecycleBottom .loan-group th{background:#171918;color:#9aa0a0}'+
'#loanLifecycleBottom table{table-layout:fixed;min-width:0}'+
'#loanLifecycleBottom .monthly .loan-chart{display:block;width:100%;overflow:visible}'+
'#loanLifecycleBottom .monthly .loan-chart svg{display:block;width:100%;min-width:0;height:310px;max-height:310px}'+
'#loanLifecycleBottom .loan-charts-stack{display:flex;flex-direction:column;gap:16px;margin:0;padding:0;border:0;background:transparent;box-shadow:none}'+'#loanLifecycleBottom .loan-card .loan-pair{margin:0 0 16px}'+'#loanLifecycleBottom .loan-card.monthly .loan-charts-stack{margin:0}'+
'@media(max-width:760px){#loanLifecycleBottom .loan-pair{grid-template-columns:minmax(0,1fr)}}'+
'</style><h2>Loan Schedules</h2>';
 /* owner Nov 11 13:50: Loan A funds 60% of factory progress payments, repaid by Loan B at delivery. Card hidden only if A has no draws. */
 var aOff=!(d.f.aPeak>0);
 h+='<section class="loan-group loan-card" data-loan="A"'+(aOff?' hidden aria-hidden="true" data-not-used="1" style="display:none!important"':'')+'><h3>Loan A — Weeks 1–'+Math.ceil(d.f.aPayoffDay/7)+' · factory progress payments (60% of factory) · repaid by Loan B at delivery, Day '+d.f.aPayoffDay+'</h3><div class="loan-pair"><div class="loan-chart"><h4>Outstanding Principal</h4>'+chart(d.a,'principal','loanAWeeklyPrincipalChart',colors.A)+'</div><div class="loan-chart"><h4>'+aIntTitle(d.a)+'</h4>'+aIntChart(d.a)+'</div></div>'+table(d.a,false,'loanAWeeklyTable')+'</section>';
 h+='<section class="loan-group loan-card monthly" data-loan="B" id="loanBMonthlySection"><h3>Loan B — M0–M60 · Project Start · IO through month 60 · sale payoff at M60</h3><div class="loan-charts-stack">';
 [['principal','Outstanding Principal','loanBMonthlyPrincipalChart'],['interest','Interest Paid','loanBMonthlyInterestChart']].forEach(function(z){h+='<div class="loan-chart"><h4>'+z[1]+'</h4>'+chart(d.bm,z[0],z[2],colors.B)+'</div>';});
 h+='</div>'+monthlyTable(d.bm)+'</section>';
 el.innerHTML=h;if(!el.parentNode)out.parentNode.appendChild(el); /* owner Nov 11 15:05: re-render in place; re-appending pulled the schedules out of Step 5 into the hidden stage (void under Download) */if(w.BUMountLoanCharts)try{w.BUMountLoanCharts();}catch(e){}
}
function boot(){render();['focus','storage','bespoke-core-inputs'].forEach(function(e){w.addEventListener(e,function(){setTimeout(render,0);});});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')setTimeout(render,0);});var out=document.getElementById('outRoot');if(out)new MutationObserver(function(){setTimeout(render,0);}).observe(out,{childList:true});}
w.BespokeLoanLifecycle={data:data,render:render};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
