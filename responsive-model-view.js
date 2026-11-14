/* Layout-only: all financial cells retained; no model or input-state writes.
   owner Nov 9 09:07: do NOT paint borders/gray fills/shadows on Outputs cards —
   Outputs owns white cards + site shadow; this file only keeps tables/SVGs fitting. */
(function(){'use strict';
var css=
/* fit helpers only — no card chrome */
'.bu-fit-container{overflow:visible!important;min-width:0!important;max-width:100%!important;width:100%!important;box-sizing:border-box!important}'+
':is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:fixed!important}'+
':is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) :is(th,td){white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;font-size:clamp(11px,1.1vw,16px)}'+
':is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) svg[viewBox]{display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important}'+
'#loanLifecycleBottom .monthly .loan-chart{min-height:0;overflow:visible!important}#loanLifecycleBottom .monthly .loan-chart h4{height:24px;line-height:24px;margin:0 0 8px!important}#loanLifecycleBottom .monthly svg{height:310px!important;max-height:310px}'+
':is(#outRoot,#loanLifecycleBottom) :is(.pie-legend,.chart-legend){display:flex;flex-wrap:wrap;gap:12px;white-space:normal}'+
':is(#v-est) :is(input,select){max-width:100%;box-sizing:border-box}'+
'@media(max-width:760px){:is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table.bu-responsive-table thead{display:none!important}:is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table.bu-responsive-table :is(tbody,tfoot,tr,td){display:block!important;width:auto!important}:is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table.bu-responsive-table tr{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.12)}:is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table.bu-responsive-table td{text-align:left!important}:is(#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est) table.bu-responsive-table td[data-column]::before{content:attr(data-column);display:block;font-weight:700;font-size:12px;margin-bottom:4px} .wrap{padding-left:12px!important;padding-right:12px!important}}';
function fit(){var roots=document.querySelectorAll('#outRoot,#postRefinanceSchedule,#loanLifecycleBottom,#v-est');roots.forEach(function(root){
 root.querySelectorAll('table').forEach(function(t){t.classList.add('bu-responsive-table');var headers=Array.from(t.querySelectorAll('thead tr:last-child th')).map(function(h){return h.textContent.trim();});t.querySelectorAll('tbody tr,tfoot tr').forEach(function(row){Array.from(row.children).forEach(function(cell,i){if(cell.tagName==='TD'&&headers[i]&&cell.getAttribute('data-column')!==headers[i])cell.setAttribute('data-column',headers[i]);});});});
 root.querySelectorAll('table,svg[viewBox]').forEach(function(el){var p=el.parentElement;for(var n=0;p&&p!==root&&n<3;n++,p=p.parentElement){if(p.matches('td,th,label,button'))break;p.classList.add('bu-fit-container');}});
 root.querySelectorAll('.chart-card input[type=range],.loan-panel input[type=range],.loan-chart input[type=range]').forEach(function(el){el.remove();});
 });}
function boot(){var st=document.createElement('style');st.id='buResponsiveModelStyle';st.textContent=css;document.head.appendChild(st);fit();var queued=false;new MutationObserver(function(){if(!queued){queued=true;setTimeout(function(){queued=false;fit();},0);}}).observe(document.body,{childList:true,subtree:true});}
window.BespokeResponsiveView={fit:fit};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
