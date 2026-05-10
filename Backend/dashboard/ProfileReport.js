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

// Date filtering variables
let currentDateFrom = null;
let currentDateTo = null;
let allSearchPins = [];
let allRecommendations = [];
let allSaved = [];

function renderList(id, items, renderItem, countId = null){
  const el=document.getElementById(id);
  if(!el) return;

  if(countId) {
    const countEl = document.getElementById(countId);
    if(countEl) countEl.textContent = `(${items.length})`;
  }

  if(!items || !items.length){
    el.innerHTML=`<div class="report-empty">No records yet.</div>`;
    return;
  }

  el.innerHTML = items.map(renderItem).join('');
}

function filterByDate(items, fromDate = null, toDate = null) {
  if (!items || !items.length) return [];
  
  const startDate = fromDate !== undefined ? fromDate : currentDateFrom;
  const endDate = toDate !== undefined ? toDate : currentDateTo;
  
  return items.filter(item => {
    const itemDate = new Date(item.at);
    
    if (startDate && itemDate < startDate) return false;
    if (endDate && itemDate > endDate) return false;
    
    return true;
  });
}

function updateFilterStats() {
  const statsEl = document.getElementById('filter-stats');
  if (!statsEl) return;
  
  const filteredSearch = filterByDate(allSearchPins);
  const filteredRecs = filterByDate(allRecommendations);
  const filteredSaved = filterByDate(allSaved);
  
  const total = filteredSearch.length + filteredRecs.length + filteredSaved.length;
  
  if (currentDateFrom || currentDateTo) {
    let dateText = '';
    if (currentDateFrom && currentDateTo) {
      dateText = `${currentDateFrom.toLocaleDateString()} - ${currentDateTo.toLocaleDateString()}`;
    } else if (currentDateFrom) {
      dateText = `from ${currentDateFrom.toLocaleDateString()}`;
    } else if (currentDateTo) {
      dateText = `until ${currentDateTo.toLocaleDateString()}`;
    }
    statsEl.innerHTML = `📅 ${dateText} • ${total} record${total !== 1 ? 's' : ''} found`;
    statsEl.style.display = 'block';
  } else {
    statsEl.innerHTML = `📊 Total: ${total} record${total !== 1 ? 's' : ''}`;
    statsEl.style.display = 'block';
  }
}

function applyDateFilter() {
  const fromInput = document.getElementById('filter-date-from');
  const toInput = document.getElementById('filter-date-to');
  
  currentDateFrom = fromInput && fromInput.value ? new Date(fromInput.value) : null;
  currentDateTo = toInput && toInput.value ? new Date(toInput.value) : null;
  
  if (currentDateFrom) currentDateFrom.setHours(0, 0, 0, 0);
  if (currentDateTo) currentDateTo.setHours(23, 59, 59, 999);
  
  renderFilteredReports();
}

function clearDateFilter() {
  const fromInput = document.getElementById('filter-date-from');
  const toInput = document.getElementById('filter-date-to');
  
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  
  currentDateFrom = null;
  currentDateTo = null;
  
  renderFilteredReports();
}

// ─── CSV EXPORT FUNCTIONS ────────────────────────────────────────────────────

function updateExportPreview() {
  const exportSearch = document.getElementById('export-search')?.checked || false;
  const exportRecs = document.getElementById('export-recommendations')?.checked || false;
  const exportSaved = document.getElementById('export-saved')?.checked || false;
  const selectAll = document.getElementById('export-all')?.checked || false;
  
  // Handle "Select All" logic
  if (selectAll) {
    if (document.getElementById('export-search')) document.getElementById('export-search').checked = true;
    if (document.getElementById('export-recommendations')) document.getElementById('export-recommendations').checked = true;
    if (document.getElementById('export-saved')) document.getElementById('export-saved').checked = true;
  }
  
  const fromDate = document.getElementById('export-date-from')?.value;
  const toDate = document.getElementById('export-date-to')?.value;
  
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : null;
  
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  
  let totalCount = 0;
  let details = [];
  let breakdown = {};
  
  if (exportSearch) {
    const filtered = filterByDate(allSearchPins, from, to);
    totalCount += filtered.length;
    breakdown.search = filtered.length;
    if (filtered.length > 0) details.push(`🔍 Search/Pin: ${filtered.length} records`);
  }
  
  if (exportRecs) {
    const filtered = filterByDate(allRecommendations, from, to);
    totalCount += filtered.length;
    breakdown.recs = filtered.length;
    if (filtered.length > 0) details.push(`💡 Recommendations: ${filtered.length} records`);
  }
  
  if (exportSaved) {
    const filtered = filterByDate(allSaved, from, to);
    totalCount += filtered.length;
    breakdown.saved = filtered.length;
    if (filtered.length > 0) details.push(`💾 Saved: ${filtered.length} records`);
  }
  
  const previewCount = document.getElementById('preview-count');
  const previewDetails = document.getElementById('preview-details');
  const noDataWarning = document.getElementById('no-data-warning');
  
  if (previewCount) {
    previewCount.textContent = totalCount;
    if (totalCount === 0) {
      previewCount.style.color = '#e74c3c';
    } else {
      previewCount.style.color = '#1a3a5c';
    }
  }
  
  if (previewDetails) {
    if (details.length > 0) {
      previewDetails.innerHTML = details.join('<br>');
      previewDetails.style.display = 'block';
      if (noDataWarning) noDataWarning.style.display = 'none';
    } else {
      previewDetails.innerHTML = 'No records match the selected criteria';
      previewDetails.style.color = '#e74c3c';
      previewDetails.style.display = 'block';
      if (noDataWarning) noDataWarning.style.display = 'block';
    }
  }
  
  // Enable/disable export button based on selection
  const confirmBtn = document.getElementById('confirm-export');
  if (confirmBtn) {
    if (totalCount === 0 || (!exportSearch && !exportRecs && !exportSaved)) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    } else {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    }
  }
  
  return breakdown;
}

function selectAllHistory() {
  const searchCheckbox = document.getElementById('export-search');
  const recsCheckbox = document.getElementById('export-recommendations');
  const savedCheckbox = document.getElementById('export-saved');
  const selectAllCheckbox = document.getElementById('export-all');
  
  if (selectAllCheckbox && selectAllCheckbox.checked) {
    if (searchCheckbox) searchCheckbox.checked = true;
    if (recsCheckbox) recsCheckbox.checked = true;
    if (savedCheckbox) savedCheckbox.checked = true;
  } else {
    if (searchCheckbox) searchCheckbox.checked = false;
    if (recsCheckbox) recsCheckbox.checked = false;
    if (savedCheckbox) savedCheckbox.checked = false;
  }
  
  updateExportPreview();
}

function exportToCSV() {
  const exportSearch = document.getElementById('export-search')?.checked || false;
  const exportRecs = document.getElementById('export-recommendations')?.checked || false;
  const exportSaved = document.getElementById('export-saved')?.checked || false;
  
  const fromDate = document.getElementById('export-date-from')?.value;
  const toDate = document.getElementById('export-date-to')?.value;
  
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : null;
  
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  
  if (!exportSearch && !exportRecs && !exportSaved) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'warning',
        title: 'No Selection',
        text: 'Please select at least one history type to export.',
        confirmButtonColor: '#1a3a5c'
      });
    } else {
      alert('Please select at least one history type to export.');
    }
    return;
  }
  
  const csvRows = [];
  
  // CSV Headers with better formatting
  csvRows.push(['Type', 'Timestamp', 'Location/Name', 'Latitude', 'Longitude', 'Details', 'Additional Info'].join(','));
  
  let totalExported = 0;
  
  // Add Search/Pin Records
  if (exportSearch) {
    const filtered = filterByDate(allSearchPins, from, to);
    filtered.forEach(item => {
      csvRows.push([
        'Search/Pin',
        item.at,
        `"${(item.locationName || '').replace(/"/g, '""')}"`,
        item.lat || '',
        item.lon || '',
        `"Source: ${item.source || 'map'}"`,
        `"Query: ${(item.query || '').replace(/"/g, '""')}"`
      ].join(','));
      totalExported++;
    });
  }
  
  // Add Recommendation Records
  if (exportRecs) {
    const filtered = filterByDate(allRecommendations, from, to);
    filtered.forEach(item => {
      csvRows.push([
        'Recommendation',
        item.at,
        `"${(item.idea || '').replace(/"/g, '""')}"`,
        item.lat || '',
        item.lon || '',
        `"Area: ${(item.area || '').replace(/"/g, '""')}"`,
        `"Source: ${item.source || 'ai'}"`
      ].join(','));
      totalExported++;
    });
  }
  
  // Add Saved Records
  if (exportSaved) {
    const filtered = filterByDate(allSaved, from, to);
    filtered.forEach(item => {
      csvRows.push([
        'Saved',
        item.at,
        `"${(item.business_type || '').replace(/"/g, '""')}"`,
        item.lat || '',
        item.lon || '',
        `"Barangay: ${(item.barangay || '').replace(/"/g, '""')}"`,
        `"Action: ${item.action || 'saved'}"`
      ].join(','));
      totalExported++;
    });
  }
  
  if (csvRows.length <= 1) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'warning',
        title: 'No Data',
        text: 'No records match the selected criteria.',
        confirmButtonColor: '#1a3a5c'
      });
    } else {
      alert('No records match the selected criteria.');
    }
    return;
  }
  
  // Create CSV content with BOM for UTF-8
  const csvContent = csvRows.join('\n');
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  let filename = `spot_report_${timestamp}`;
  
  // Add type indicators to filename
  const types = [];
  if (exportSearch) types.push('search');
  if (exportRecs) types.push('recommendations');
  if (exportSaved) types.push('saved');
  
  if (types.length === 3) {
    filename += '_all';
  } else if (types.length === 1) {
    filename += `_${types[0]}`;
  } else {
    filename += `_${types.join('-')}`;
  }
  
  if (fromDate || toDate) {
    if (fromDate) filename += `_from-${fromDate}`;
    if (toDate) filename += `_to-${toDate}`;
  }
  
  filename += '.csv';
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: 'Export Successful!',
      html: `Exported <strong>${totalExported}</strong> records to<br><strong>${filename}</strong>`,
      timer: 2500,
      showConfirmButton: false,
      background: 'white',
      allowOutsideClick: false
    });
  }
  
  // Close modal after successful export
  setTimeout(() => {
    const modal = document.getElementById('export-modal');
    if (modal) modal.classList.remove('open');
  }, 500);
}

function openExportModal() {
  const modal = document.getElementById('export-modal');
  if (!modal) return;
  
  // Reset selections
  const selectAllCheckbox = document.getElementById('export-all');
  const searchCheckbox = document.getElementById('export-search');
  const recsCheckbox = document.getElementById('export-recommendations');
  const savedCheckbox = document.getElementById('export-saved');
  const fromInput = document.getElementById('export-date-from');
  const toInput = document.getElementById('export-date-to');
  
  if (selectAllCheckbox) selectAllCheckbox.checked = true;
  if (searchCheckbox) searchCheckbox.checked = true;
  if (recsCheckbox) recsCheckbox.checked = true;
  if (savedCheckbox) savedCheckbox.checked = true;
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  
  updateExportPreview();
  modal.classList.add('open');
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.classList.remove('open');
}

function renderFilteredReports() {
  const filteredSearch = filterByDate(allSearchPins);
  const filteredRecs = filterByDate(allRecommendations);
  const filteredSaved = filterByDate(allSaved);
  
  renderList('report-searchpins', filteredSearch, (x) => {
    const lat = x.lat;
    const lon = x.lon;
    const label = x.locationName || '';

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
  }, 'search-count');

  renderList('report-recs', filteredRecs, (x) => {
    const lat = x.lat;
    const lon = x.lon;
    const label = (x.area||'') + ' - ' + (x.idea||'');

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
  }, 'rec-count');

  renderList('report-saved', filteredSaved, (x) => {
    const lat = x.lat;
    const lon = x.lon;
    const label = (x.barangay ? `${x.business_type} - ${x.barangay}` : x.business_type);

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
  }, 'saved-count');
  
  updateFilterStats();
  attachRowClicks();
}

function readLocalLogs(){
  const keys = Object.keys(localStorage).filter(k => k.startsWith('reportLogs_'));
  
  if (keys.length > 0) {
    try {
      const v = JSON.parse(localStorage.getItem(keys[0]) || '{"searchPins":[],"recommendations":[],"saved":[]}');
      return v || {searchPins:[], recommendations:[], saved:[]};
    } catch {
      return {searchPins:[], recommendations:[], saved:[]};
    }
  }
  
  try {
    const v = JSON.parse(localStorage.getItem('reportLogs') || '{"searchPins":[],"recommendations":[],"saved":[]}');
    return v || {searchPins:[], recommendations:[], saved:[]};
  } catch {
    return {searchPins:[], recommendations:[], saved:[]};
  }
}

function setJumpTarget(payload){
  localStorage.setItem('mapJumpTarget', JSON.stringify(payload));
  window.location.href='/dashboard/dashboard.html';
}

function attachRowClicks(){
  const containers = ['report-searchpins', 'report-recs', 'report-saved'];
  
  containers.forEach(containerId => {
    const el = document.getElementById(containerId);
    if(!el) return;

    el.querySelectorAll('[data-jump="1"]').forEach(row => {
      row.removeEventListener('click', row._clickHandler);
      
      const handler = () => {
        const lat = row.dataset.lat;
        const lon = row.dataset.lon;
        if(!lat || !lon) return;
        setJumpTarget({
          lat:Number(lat),
          lon:Number(lon),
          label:row.dataset.label||'',
          source:row.dataset.source||'history'
        });
      };
      
      row._clickHandler = handler;
      row.addEventListener('click', handler);
    });
  });
}

async function renderReports(){
  const local = readLocalLogs();
  allSearchPins = local.searchPins || [];
  allRecommendations = local.recommendations || [];
  allSaved = local.saved || [];
  
  allSearchPins.sort((a, b) => new Date(b.at) - new Date(a.at));
  allRecommendations.sort((a, b) => new Date(b.at) - new Date(a.at));
  allSaved.sort((a, b) => new Date(b.at) - new Date(a.at));
  
  renderFilteredReports();
}

window.renderReports = renderReports;

// CLEAR BUTTON
const clearBtn = document.getElementById('clear-reports-btn');
clearBtn?.addEventListener('click', async () => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('reportLogs'));
  keys.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('reportLogs');
  
  allSearchPins = [];
  allRecommendations = [];
  allSaved = [];
  clearDateFilter();
  await renderReports();
  
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: 'Cleared!',
      text: 'All report history has been cleared.',
      timer: 1500,
      showConfirmButton: false
    });
  }
});

// Date filter event listeners
document.addEventListener('DOMContentLoaded', () => {
  const fromInput = document.getElementById('filter-date-from');
  const toInput = document.getElementById('filter-date-to');
  const clearFilterBtn = document.getElementById('clear-date-filter');
  const exportBtn = document.getElementById('export-all-btn');
  const closeModalBtn = document.getElementById('close-export-modal');
  const cancelExportBtn = document.getElementById('cancel-export');
  const confirmExportBtn = document.getElementById('confirm-export');
  
  if (fromInput) fromInput.addEventListener('change', applyDateFilter);
  if (toInput) toInput.addEventListener('change', applyDateFilter);
  if (clearFilterBtn) clearFilterBtn.addEventListener('click', clearDateFilter);
  if (exportBtn) exportBtn.addEventListener('click', openExportModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeExportModal);
  if (cancelExportBtn) cancelExportBtn.addEventListener('click', closeExportModal);
  if (confirmExportBtn) confirmExportBtn.addEventListener('click', exportToCSV);
  
  // Export modal checkbox listeners
  const exportSearch = document.getElementById('export-search');
  const exportRecs = document.getElementById('export-recommendations');
  const exportSaved = document.getElementById('export-saved');
  const exportAll = document.getElementById('export-all');
  const exportFrom = document.getElementById('export-date-from');
  const exportTo = document.getElementById('export-date-to');
  
  if (exportSearch) exportSearch.addEventListener('change', updateExportPreview);
  if (exportRecs) exportRecs.addEventListener('change', updateExportPreview);
  if (exportSaved) exportSaved.addEventListener('change', updateExportPreview);
  if (exportAll) exportAll.addEventListener('change', selectAllHistory);
  if (exportFrom) exportFrom.addEventListener('change', updateExportPreview);
  if (exportTo) exportTo.addEventListener('change', updateExportPreview);
  
  // Close modal on overlay click
  const modal = document.getElementById('export-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeExportModal();
    });
  }
});