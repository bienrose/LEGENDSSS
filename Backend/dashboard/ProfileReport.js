function esc(s){return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function readLogs(){try{const v=JSON.parse(localStorage.getItem('reportLogs')||'{"searchPins":[],"recommendations":[],"saved":[]}');return v||{searchPins:[],recommendations:[],saved:[]}}catch{return{searchPins:[],recommendations:[],saved:[]}}}
function fmtTime(iso){try{return new Date(iso).toLocaleString()}catch{return iso||''}}
function renderList(id,items,renderItem){const el=document.getElementById(id);if(!el)return;if(!items||!items.length){el.innerHTML=`<div class="report-empty">No records yet.</div>`;return;}el.innerHTML=items.slice(0,50).map(renderItem).join('')}
function renderReports(){
  const logs=readLogs();
  renderList('report-searchpins',logs.searchPins,(x)=>`
    <div class="report-row">
      <div class="report-topline"><strong>${esc(fmtTime(x.at))}</strong> <span class="report-chip">${esc(x.source||'')}</span></div>
      <div>${esc(x.locationName||'')}</div>
      <div class="report-small">${esc(x.lat||'')}, ${esc(x.lon||'')}</div>
      <div class="report-small">Type: ${esc(x.filters?.type||'')} • Barangay: ${esc(x.filters?.barangay||'')} • Pins: ${esc(x.filters?.pinCount??'')}</div>
      <div class="report-small">Prefs: ${esc((x.filters?.prefs||[]).join(', '))}</div>
    </div>
  `);
  renderList('report-recs',logs.recommendations,(x)=>`
    <div class="report-row">
      <div class="report-topline"><strong>${esc(fmtTime(x.at))}</strong></div>
      <div>Business: ${esc(x.idea||'')}</div>
      <div class="report-small">Area: ${esc(x.area||'')}</div>
      <div class="report-small">Pins: ${esc(x.pinCount??'')}</div>
      <div class="report-small">Type: ${esc(x.filters?.type||'')} • Barangay: ${esc(x.filters?.barangay||'')}</div>
    </div>
  `);
  renderList('report-saved',logs.saved,(x)=>`
    <div class="report-row">
      <div class="report-topline"><strong>${esc(fmtTime(x.at))}</strong> <span class="report-chip">${esc(x.action||'')}</span></div>
      <div>${esc(x.business_type||'')}</div>
      <div class="report-small">${esc(x.barangay||'')}</div>
      <div class="report-small">${esc(x.lat||'')}, ${esc(x.lon||'')}</div>
    </div>
  `);
}
window.renderReports=renderReports;

const clearBtn=document.getElementById('clear-reports-btn');
clearBtn?.addEventListener('click',()=>{
  localStorage.setItem('reportLogs','{"searchPins":[],"recommendations":[],"saved":[]}');
  renderReports();
});