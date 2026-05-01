function esc(s){
  return (s||'').toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
}

function fmtTime(iso){
  try{
    return new Date(iso).toLocaleString()
  }catch{
    return iso||''
  }
}

function renderList(id,items,renderItem){
  const el=document.getElementById(id);
  if(!el) return;

  if(!items || !items.length){
    el.innerHTML=`<div class="report-empty">No records yet.</div>`;
    return;
  }

  // ✅ removed slice(0,3) so all items show
  el.innerHTML = items.map(renderItem).join('');
}

function readLocalLogs(){
  try{
    const v=JSON.parse(localStorage.getItem('reportLogs')||'{"searchPins":[],"recommendations":[],"saved":[]}');
    return v||{searchPins:[],recommendations:[],saved:[]};
  }catch{
    return {searchPins:[],recommendations:[],saved:[]};
  }
}

function setJumpTarget(payload){
  localStorage.setItem('mapJumpTarget', JSON.stringify(payload));
  window.location.href='/dashboard/dashboard.html';
}

function attachRowClicks(containerId){
  const el=document.getElementById(containerId);
  if(!el) return;

  el.querySelectorAll('[data-jump="1"]').forEach(row=>{
    row.addEventListener('click',()=>{
      const lat=row.dataset.lat;
      const lon=row.dataset.lon;

      if(!lat || !lon) return;

      setJumpTarget({
        lat:Number(lat),
        lon:Number(lon),
        label:row.dataset.label||'',
        source:row.dataset.source||'history'
      });
    });
  });
}

async function renderReports(){
  const local=readLocalLogs();

  const searchPins=local.searchPins||[];
  const recs=local.recommendations||[];
  const saved=local.saved||[];

  // 🔍 SEARCH PINS
  renderList('report-searchpins',searchPins,(x)=>{
    const lat=x.lat;
    const lon=x.lon;
    const label=x.locationName||'';

    return `
      <div class="report-row report-row-click"
        data-jump="1"
        data-source="${esc(x.source||'search')}"
        data-label="${esc(label)}"
        data-lat="${esc(lat||'')}"
        data-lon="${esc(lon||'')}">

        <div class="report-topline">
          <strong>${esc(fmtTime(x.at))}</strong>
          <span class="report-chip">${esc(x.source||'')}</span>
        </div>

        <div>${esc(label)}</div>
        <div class="report-small">${esc(lat||'')}, ${esc(lon||'')}</div>
      </div>
    `;
  });

  // 💡 RECOMMENDATIONS
  renderList('report-recs',recs,(x)=>{
    const lat=x.lat;
    const lon=x.lon;
    const label=(x.area||'') + ' - ' + (x.idea||'');

    return `
      <div class="report-row report-row-click"
        data-jump="1"
        data-source="recommendation"
        data-label="${esc(label)}"
        data-lat="${esc(lat||'')}"
        data-lon="${esc(lon||'')}">

        <div class="report-topline">
          <strong>${esc(fmtTime(x.at))}</strong>
        </div>

        <div>Business: ${esc(x.idea||'')}</div>
        <div class="report-small">Area: ${esc(x.area||'')}</div>
        <div class="report-small">${esc(lat||'')}, ${esc(lon||'')}</div>
      </div>
    `;
  });

  // 💾 SAVED
  renderList('report-saved',saved,(x)=>{
    const lat=x.lat;
    const lon=x.lon;
    const label=(x.barangay ? `${x.business_type} - ${x.barangay}` : x.business_type);

    return `
      <div class="report-row report-row-click"
        data-jump="1"
        data-source="saved"
        data-label="${esc(label)}"
        data-lat="${esc(lat||'')}"
        data-lon="${esc(lon||'')}">

        <div class="report-topline">
          <strong>${esc(fmtTime(x.at))}</strong>
          <span class="report-chip">${esc(x.action||'')}</span>
        </div>

        <div>${esc(x.business_type||'')}</div>
        <div class="report-small">${esc(x.barangay||'')}</div>
        <div class="report-small">${esc(lat||'')}, ${esc(lon||'')}</div>
      </div>
    `;
  });

  attachRowClicks('report-searchpins');
  attachRowClicks('report-recs');
  attachRowClicks('report-saved');
}

window.renderReports=renderReports;

// 🧹 CLEAR BUTTON
const clearBtn=document.getElementById('clear-reports-btn');

clearBtn?.addEventListener('click',async()=>{
  localStorage.setItem('reportLogs','{"searchPins":[],"recommendations":[],"saved":[]}');
  await renderReports();
});