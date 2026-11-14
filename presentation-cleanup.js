/* Presentation only: no persistence, model, input-value, or calculation writes. */
(function(){'use strict';
var busy=false;
function clean(){if(busy)return;busy=true;try{
 document.querySelectorAll('p,.fin-note,div.note,div.hint,.lhintro').forEach(function(el){
  if(el.id==='addrStepHint'||el.id==='coreIntro'||(el.classList&&(el.classList.contains('addr-step-hint')||el.classList.contains('core-intro')||el.classList.contains('kicker')||el.classList.contains('story-lead')))||el.closest('#addrStep,.addr-step,#coreIntro,.core-intro'))return;
  if(el.id==='outMeta'){if(el.textContent)el.textContent='';el.hidden=true;return;}
  if(el.closest('table,svg,script,style,textarea'))return;
  var functional=el.querySelector('input,select,textarea,button,a,label,[role="alert"],[role="status"],.miss')||el.matches('[role="alert"],[role="status"],.miss');
  if(functional){if(el.tagName==='P'){var div=document.createElement('div');Array.from(el.attributes).forEach(function(a){div.setAttribute(a.name,a.value);});while(el.firstChild)div.appendChild(el.firstChild);el.replaceWith(div);}return;}
  el.remove();
 });
 // Leaf prose notes only; preserve forms, financial tables, SVG labels and validation.
 document.querySelectorAll('div.meta,div.help,div.description,div.intro,div.subtext').forEach(function(el){if(el.closest('table,svg')||el.querySelector('input,select,textarea,button,a,label,table,svg,.metric,.val,.miss,[role="alert"],[role="status"]'))return;el.remove();});
}finally{busy=false;}}
function boot(){clean();var queued=false;new MutationObserver(function(){if(!queued){queued=true;setTimeout(function(){queued=false;clean();},0);}}).observe(document.body,{childList:true,subtree:true});}
window.BespokePresentationCleanup={clean:clean};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
