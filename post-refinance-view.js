/* Read-only presentation of existing Core Lender B periods. No loan or storage writes. */
(function(w){'use strict';
function build(f){
 if(!f||!Number.isFinite(f.bBalance)||f.bBalance<0||!f.rates||!Number.isFinite(f.rates.b)||f.rates.b<0)return {valid:false,error:'Invalid existing Lender B amount or rate.'};
 var periods=(f.periods||[]).filter(function(p){return p.lender==='Lender B'&&p.start>=f.days.refi;});
 if(!periods.length)return {valid:false,error:'No existing Lender B periods available.'};
 var exactTotal=0;
 for(var j=0;j<periods.length;j++){var p=periods[j];if(!Number.isFinite(p.interest)||p.interest<0||!Number.isFinite(p.balance)||p.balance<0||!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.end<=p.start)return {valid:false,error:'Invalid existing Lender B period.'};exactTotal+=p.interest;}
 var totalCents=Math.round(exactTotal*100),used=0,cumulative=0;if(!Number.isSafeInteger(totalCents))return {valid:false,error:'Existing total interest exceeds safe display precision.'};
 var rows=periods.map(function(p,i){var independentlyRounded=Math.round(p.interest*100);cumulative+=p.interest;var cents=Math.round(cumulative*100)-used;used+=cents;return {period:i+1,start:p.start,payDay:p.end,days:p.days,beginning:p.balance,paymentCents:cents,interestCents:cents,principalCents:0,ending:p.balance,roundingCents:cents-independentlyRounded};});
 return {valid:true,rows:rows,totalPaymentCents:used,totalInterestCents:totalCents,totalPrincipalCents:0,endingBalance:f.bBalance,openingBalance:f.bBalance,rate:f.rates.b,closeDay:f.days.refi,horizonEnd:f.days.horizonEnd,reconciles:used===totalCents&&rows.every(function(r){return r.paymentCents===r.interestCents+r.principalCents;})};
}
function money(n){return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
/* owner Nov 8 09:22: Lender B annual amortization summary from monthly P&I (same loan, rate, payment and term as the returns engine). */
function buildAnnual(L,ratePct,years,pmt){return w.BespokeCore.permanentSchedule(L,ratePct);}
function render(){
 var B=w.BespokeCore,out=document.getElementById('outRoot');if(!B||!out)return;
 var el=document.getElementById('postRefinanceSchedule');if(!el){el=document.createElement('section');el.id='postRefinanceSchedule';el.className='sec';out.parentNode.appendChild(el);}
 // Owner: hide the complete permanent annual schedule, without removing its calculations.
 el.hidden=true;el.setAttribute('aria-hidden','true');el.style.setProperty('display','none','important');
 try{
 var inp=B.loadInputs(),r=B.compute(inp),R=B.computeReturns(inp,r);
 var s=buildAnnual(R.lenderB,R.lenderBRate,R.amortYears,R.monthlyPayment);w.__BU_amortAnnual=s;
 /* owner Nov 8 13:55: separate Lender A and Lender B schedules (presentation only; engine periods from computeFinancing, no calc changes) */
 var F=B.computeFinancing(inp), html='';
 function grp(ln){ var out=[]; (F.periods||[]).filter(function(p){return p.lender===ln;}).forEach(function(p){ var l=out[out.length-1];
   if(l&&l.balance===p.balance&&l.rate===p.rate&&!(p.advance>0)){ l.end=p.end; l.days+=p.days; l.interest+=p.interest; } else out.push({start:p.start,end:p.end,days:p.days,advance:p.advance||0,balance:p.balance,rate:p.rate,interest:p.interest}); }); return out; }
 function sched(ln,id,title,sub,payoffLabel,payoffAmt){ var g=grp(ln), ti=0, h='<h2>'+title+'</h2><p class="amort-sum">'+sub+'</p>';
   if(!g.length) return h+'<div role="status">No '+ln+' balance in this case.</div>';
   h+='<div style="overflow:visible"><table class="out-table" id="'+id+'"><thead><tr><th>Days</th><th class="num">Days in Period</th><th class="num">Draw</th><th class="num">Outstanding Balance</th><th class="num">Rate</th><th class="num">Interest Paid</th><th class="num">Principal Paid</th><th class="num">Remaining Principal</th></tr></thead><tbody>';
   g.forEach(function(x){ ti+=x.interest; h+='<tr><td>Day '+x.start+' – '+x.end+'</td><td class="num">'+x.days+'</td><td class="num">'+(x.advance>0?money(x.advance):'—')+'</td><td class="num">'+money(x.balance)+'</td><td class="num">'+(Math.round(x.rate*10000)/100)+'%</td><td class="num">'+money(x.interest)+'</td><td class="num">—</td><td class="num">'+money(x.balance)+'</td></tr>'; });
   var last=g[g.length-1].balance;
   if(payoffLabel) h+='<tr><td>Day '+F.days.refi+' · '+payoffLabel+'</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num">—</td><td class="num">'+money(payoffAmt)+'</td><td class="num">'+money(Math.max(0,last-payoffAmt))+'</td></tr>';
   h+='</tbody><tfoot><tr><td>Total interest · paid in cash, not financed</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num">'+money(ti)+'</td><td class="num">'+(payoffLabel?money(payoffAmt):'—')+'</td><td class="num"></td></tr></tfoot></table></div>'; return h; }
 var c=F.construction||{}, rA=Math.round((c.rateA||0)*10000)/100, rBc=Math.round((c.rateB||0)*10000)/100;
 html+='<h2>Loan B — Five Years Interest-Only + 30-Year Amortization</h2>';
 if(!s.valid){el.innerHTML=html+'<div role="status">'+s.error+'</div>';return;}
 html+='<div style="overflow:visible"><table class="out-table" id="amortAnnualTable"><thead><tr><th>Operating Year / Phase</th><th class="num">Beginning Balance</th><th class="num">Payments</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Ending Balance</th></tr></thead><tbody>';
 s.rows.forEach(function(x){html+='<tr><td>Year '+x.year+(x.months<12?' · '+x.months+' mo':'')+' · '+x.phase+'</td><td class="num">'+money(x.begin)+'</td><td class="num">'+money(x.payments)+'</td><td class="num">'+money(x.interest)+'</td><td class="num">'+money(x.principal)+'</td><td class="num">'+money(x.end)+'</td></tr>';});
 html+='</tbody><tfoot><tr><td>Total</td><td class="num"></td><td class="num">'+money(s.totalPayments)+'</td><td class="num">'+money(s.totalInterest)+'</td><td class="num">'+money(s.totalPrincipal)+'</td><td class="num"></td></tr></tfoot></table></div>';
 el.innerHTML=html;
 }catch(e){el.textContent='Amortization schedule unavailable: '+e.message;}
}
w.BespokePostRefinanceView={build:build,buildAnnual:buildAnnual,render:render};
function boot(){render();w.addEventListener('focus',render);w.addEventListener('storage',function(e){if(!e.key||e.key===w.BespokeCore.STORAGE_KEY)render();});w.addEventListener('bespoke-core-inputs',render);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')render();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
