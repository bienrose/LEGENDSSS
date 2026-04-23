const map = L.map('map').setView([14.5764, 121.0851], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 19
}).addTo(map);

const filterPanel = document.getElementById('filter-panel');
const savedPanel  = document.getElementById('saved-panel');
const locPanel    = document.getElementById('loc-panel');

function closeAllPanels() {
  filterPanel.classList.remove('open');
  savedPanel.classList.remove('open');
  locPanel.classList.remove('open');
}

document.getElementById('close-saved-panel').addEventListener('click', () => savedPanel.classList.remove('open'));
document.getElementById('close-loc-panel').addEventListener('click',   () => locPanel.classList.remove('open'));
document.getElementById('close-filter-panel').addEventListener('click',() => filterPanel.classList.remove('open'));

document.getElementById('filter-btn').addEventListener('click', function(e) {
  e.stopPropagation();
  const isOpen = filterPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) filterPanel.classList.add('open');
});

document.getElementById('saved-btn').addEventListener('click', function(e) {
  e.stopPropagation();
  const isOpen = savedPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) savedPanel.classList.add('open');
});

let businessMarkers = [];
let clickedMarker = null;
let allowIdeaPins = true;

function clearBusinessMarkers() {
  businessMarkers.forEach(m => map.removeLayer(m));
  businessMarkers = [];
}

function clearClickedMarker() {
  if (clickedMarker) {
    map.removeLayer(clickedMarker);
    clickedMarker = null;
  }
}

function plotLocations(recs) {
  clearBusinessMarkers();

  const bounds = L.latLngBounds();

  recs.forEach((rec, i) => {
    if (!rec.lat || !rec.lon) return;

    const marker = L.marker([parseFloat(rec.lat), parseFloat(rec.lon)])
      .addTo(map)
      .bindPopup(`
        <b>Rank #${i+1} — ${rec.barangay_name || ''}</b><br>
        Score: ${rec.score?.toFixed(2) ?? ''}
      `);

    marker.on('click', () => {
      map.closePopup();
      marker.openPopup();
    });

    businessMarkers.push(marker);
    bounds.extend(marker.getLatLng());
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.2));
  }
}

function getPrefs() {
  const prefs = [];
  if (document.getElementById('p-totalpop')?.checked) prefs.push('totalpop');
  if (document.getElementById('p-popdensity')?.checked) prefs.push('popdensity');
  if (document.getElementById('p-agedist')?.checked) prefs.push('agedist');
  if (document.getElementById('p-gender')?.checked) prefs.push('gender');
  if (document.getElementById('p-income')?.checked) prefs.push('income');
  if (document.getElementById('p-bizcount')?.checked) prefs.push('bizcount');
  if (document.getElementById('p-competitors')?.checked) prefs.push('competitors');
  if (document.getElementById('p-bizdensity')?.checked) prefs.push('bizdensity');
  return prefs;
}

async function fetchIdeas(filters = {}) {
  const params = new URLSearchParams();
  if (filters.barangay) params.append('barangay', filters.barangay);
  if (filters.type)     params.append('category', filters.type);
  if (filters.prefs?.length) params.append('prefs', filters.prefs.join(','));

  const res  = await fetch(`/api/ideas?${params.toString()}`);
  const data = await res.json();
  return data.success ? data.data : [];
}

async function fetchIdeaLocations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.idea)     params.append('idea', filters.idea);
  if (filters.barangay) params.append('barangay', filters.barangay);
  if (filters.top)      params.append('top', filters.top);
  if (filters.prefs?.length) params.append('prefs', filters.prefs.join(','));

  const res  = await fetch(`/api/idea-locations?${params.toString()}`);
  const data = await res.json();
  return data.success ? data.data : [];
}

async function renderIdeasAndPins({ type, barangay, prefs, allowPins }) {
  const ideas = await fetchIdeas({ type, barangay, prefs });
  const listEl = document.getElementById('rec-list');

  if (!ideas.length) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = ideas.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}">
      <span class="rec-item-num">${i+1}.</span>
      <span class="rec-item-name">${escapeHtml(name)}</span>
      <div class="save-row" data-id="loc-${i}" data-name="${escapeHtml(name)}" onclick="toggleLocSave(this)">
        <img src="save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');

  const items = listEl.querySelectorAll('.rec-item');
  items.forEach((el) => {
    el.addEventListener('click', async () => {
      if (!allowPins) return;
      const idea = el.dataset.idea;
      const recs = await fetchIdeaLocations({ idea, barangay, top: 5, prefs });
      plotLocations(recs);
    });
  });
}

const barangayMap = {
  'b-bagong-ilog':       'Bagong Ilog',
  'b-bagong-katipunan':  'Bagong Katipunan',
  'b-bambang':           'Bambang',
  'b-buting':            'Buting',
  'b-caniogan':          'Caniogan',
  'b-dela-paz':          'Dela Paz',
  'b-kalawaan':          'Kalawaan',
  'b-kapasigan':         'Kapasigan',
  'b-kapitolyo':         'Kapitolyo',
  'b-malinao':           'Malinao',
  'b-manggahan':         'Manggahan',
  'b-maybunga':          'Maybunga',
  'b-oranbo':            'Oranbo',
  'b-palatiw':           'Palatiw',
  'b-pinagbuhatan':      'Pinagbuhatan',
  'b-pineda':            'Pineda',
  'b-rosario':           'Rosario',
  'b-sagad':             'Sagad',
  'b-san-antonio':       'San Antonio',
  'b-san-joaquin':       'San Joaquin',
  'b-san-jose':          'San Jose',
  'b-san-miguel':        'San Miguel',
  'b-san-nicolas':       'San Nicolas',
  'b-santa-lucia':       'Santa Lucia',
  'b-santa-rosa':        'Santa Rosa',
  'b-santolan':          'Santolan',
  'b-sumilang':          'Sumilang',
  'b-ugong':             'Ugong',
  'b-vargas':            'F. Vargas',
  'b-wack-wack':         'Wack-Wack'
};

const typeMap = {
  'f-food':     'FOOD',
  'f-retail':   'RETAIL',
  'f-personal': 'PERSONAL',
  'f-tech':     'TECH'
};

function normalizeStr(s) {
  return (s || '').toString().trim().toLowerCase();
}

function matchBarangayName(name) {
  const n = normalizeStr(name);
  const values = Object.values(barangayMap);
  for (const v of values) {
    if (normalizeStr(v) === n) return v;
  }
  return name || null;
}

document.getElementById('done-btn').addEventListener('click', async () => {
  filterPanel.classList.remove('open');
  allowIdeaPins = true;

  const barangayCheckboxes = document.querySelectorAll('[id^="b-"]:checked');
  const typeCheckboxes     = document.querySelectorAll('[id^="f-"]:checked');

  const selectedBarangays = [...barangayCheckboxes].map(cb => barangayMap[cb.id]).filter(Boolean);
  const selectedTypes     = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);

  clearBusinessMarkers();

  const barangay = selectedBarangays[0] || null;
  const type = selectedTypes[0] || null;
  const prefs = getPrefs();

  if (!barangay && !type && !prefs.length) return;

  document.getElementById('loc-panel-title').textContent = barangay
    ? `Recommended Businesses in ${barangay}`
    : `Recommended Businesses`;

  document.getElementById('loc-badge').textContent = barangay ? `📍 ${barangay}` : `📍 All Barangays`;

  locPanel.classList.add('open');

  await renderIdeasAndPins({ type, barangay, prefs, allowPins: true });
});

let currentLocShortName = '';
let currentClickLat = null;
let currentClickLng = null;

async function handleLocationSelect(lat, lon) {
  currentClickLat = Number(lat).toFixed(6);
  currentClickLng = Number(lon).toFixed(6);

  allowIdeaPins = false;
  clearBusinessMarkers();

  clearClickedMarker();
  clickedMarker = L.marker([parseFloat(currentClickLat), parseFloat(currentClickLng)])
    .addTo(map)
    .bindPopup(`Selected location<br>${currentClickLat}, ${currentClickLng}`)
    .openPopup();

  clickedMarker.on('popupclose', () => {
    clearClickedMarker();
  });

  const svDiv = document.getElementById('street-view');
  svDiv.innerHTML = `<iframe src="https://www.mapillary.com/embed?map_style=Mapillary%20light&lat=${currentClickLat}&lng=${currentClickLng}&z=17" style="width:100%;height:100%;border:none;"></iframe>`;
  svDiv.style.display = 'block';
  document.getElementById('closeSV').style.display = 'block';

  filterPanel.classList.remove('open');
  savedPanel.classList.remove('open');
  locPanel.classList.add('open');

  document.querySelectorAll('#loc-panel .save-row').forEach(row => {
    row.classList.remove('saved');
    row.querySelector('span').textContent = 'Save';
  });
  locSavedItems.clear();

  const badge   = document.getElementById('loc-badge');
  const titleEl = document.getElementById('loc-panel-title');
  badge.textContent = '📍 Locating…';
  currentLocShortName = `${currentClickLat}, ${currentClickLng}`;

  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentClickLat}&lon=${currentClickLng}&format=json`);
    const data = await res.json();
    const addr = data.address || {};
    const area = addr.barangay || addr.suburb || addr.neighbourhood || addr.city_district || addr.village || addr.town || addr.county || '';
    const city = addr.city || addr.municipality || '';
    currentLocShortName = area ? (city ? `${area}, ${city}` : area) : (city || currentLocShortName);
    badge.textContent   = `📍 ${currentLocShortName}`;
    titleEl.textContent = `Recommended Businesses in ${area || city || 'this Area'}`;
  } catch(err) {
    badge.textContent = `📍 ${currentClickLat}, ${currentClickLng}`;
  }

  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');
  const selectedTypes  = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);
  const type = selectedTypes[0] || null;
  const prefs = getPrefs();

  const ideasRes = await fetch(`/api/ideas-by-point?lat=${currentClickLat}&lon=${currentClickLng}&category=${type || ''}&prefs=${prefs.join(',')}`);
  const ideasData = await ideasRes.json();
  const listEl = document.getElementById('rec-list');

  if (!ideasData.success || !ideasData.data.length) {
    listEl.innerHTML = '<div class="rec-item">No recommendations found.</div>';
    return;
  }

  listEl.innerHTML = ideasData.data.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}">
      <span class="rec-item-num">${i+1}.</span>
      <span class="rec-item-name">${escapeHtml(name)}</span>
      <div class="save-row" data-id="loc-${i}" data-name="${escapeHtml(name)}" onclick="toggleLocSave(this)">
        <img src="save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');
}

map.on('click', async function(e) {
  await handleLocationSelect(e.latlng.lat, e.latlng.lng);
});

document.getElementById('closeSV').onclick = () => {
  const svDiv = document.getElementById('street-view');
  svDiv.style.display = 'none';
  svDiv.innerHTML = '';
  document.getElementById('closeSV').style.display = 'none';
};

let searchHistory = [];

function renderHistory() {
  const container = document.getElementById('search-history');
  if (!searchHistory.length) { container.classList.remove('open'); return; }
  container.innerHTML = searchHistory.map((item, i) => `
    <div class="history-item" data-idx="${i}">
      <img src="history.png" alt="history" class="history-icon">
      <span class="history-label">${escapeHtml(item)}</span>
      <img src="x.png" alt="remove" class="history-x" data-remove="${i}">
    </div>
  `).join('');
  container.classList.add('open');

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', function(e) {
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.remove);
        searchHistory.splice(idx, 1);
        renderHistory();
        return;
      }
      const label = this.querySelector('.history-label').textContent;
      document.getElementById('search-input').value = label;
      container.classList.remove('open');
      doSearch(label);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const searchInput = document.getElementById('search-input');

searchInput.addEventListener('focus', () => { if (searchHistory.length) renderHistory(); });
searchInput.addEventListener('input', function() {
  if (!this.value.trim() && searchHistory.length) renderHistory();
  else document.getElementById('search-history').classList.remove('open');
});

document.addEventListener('click', function(e) {
  if (!document.getElementById('search-wrapper').contains(e.target))
    document.getElementById('search-history').classList.remove('open');
});

async function doSearch(query) {
  try {
    const viewbox = "121.0600,14.6200,121.1100,14.5350";
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&bounded=1&viewbox=${viewbox}`
    );
    const data = await res.json();
    if (!data.length) { alert('Location not found in Pasig.'); return; }
    const { lat, lon } = data[0];
    map.setView([parseFloat(lat), parseFloat(lon)], 16);
    await handleLocationSelect(lat, lon);
  } catch(err) {
    console.error(err);
    alert('Something went wrong.');
  }
}

searchInput.addEventListener('keydown', async function(e) {
  if (e.key !== 'Enter') return;
  const query = searchInput.value.trim();
  if (!query) return;
  document.getElementById('search-history').classList.remove('open');
  searchHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
  await doSearch(query);
});

let savedLocations = [];
let unsavePendingCallback = null;

function renderSavedPanel() {
  const body = document.getElementById('saved-panel-body');
  if (!savedLocations.length) {
    body.innerHTML = '<p style="font-size:13px;color:#aaa;margin-top:10px;">No saved locations yet.</p>';
    return;
  }
  body.innerHTML = savedLocations.map(loc => `
    <div class="saved-location-card" id="saved-card-${loc.id}">
      <div class="saved-card-header">
        <div class="saved-card-title" onclick="focusSavedLocation('${loc.id}')">Recommended Businesses in ${escapeHtml(loc.locationName)}</div>
        <div class="saved-card-actions">
          <button class="card-icon-btn" title="Unsave" onclick="promptUnsaveLocation('${loc.id}')">
            <img src="save.png" alt="unsave">
          </button>
          <button class="card-icon-btn" title="Toggle details" onclick="toggleSavedCard('${loc.id}', this)">
            <img src="down.png" alt="expand" class="collapsible-arrow">
          </button>
        </div>
      </div>
      <div class="saved-card-body" id="saved-body-${loc.id}">
        <ul class="saved-biz-list">
          ${loc.businesses.map((b, i) => `<li>${i+1}. ${escapeHtml(b)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');
}

function focusSavedLocation(id) {
  const loc = savedLocations.find(l => l.id === id);
  if (!loc || !loc.lat || !loc.lon) return;

  clearClickedMarker();
  clickedMarker = L.marker([parseFloat(loc.lat), parseFloat(loc.lon)])
    .addTo(map)
    .bindPopup(`${escapeHtml(loc.locationName)}<br>${loc.lat}, ${loc.lon}`)
    .openPopup();

  clickedMarker.on('popupclose', () => {
    clearClickedMarker();
  });

  map.setView([parseFloat(loc.lat), parseFloat(loc.lon)], 16);
}

function toggleSavedCard(id, btn) {
  const body  = document.getElementById('saved-body-' + id);
  const arrow = btn.querySelector('.collapsible-arrow');
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('rotated', !isOpen);
}

function promptUnsaveLocation(id) {
  const loc = savedLocations.find(l => l.id === id);
  if (!loc) return;
  document.getElementById('unsave-msg').textContent = `Remove "${loc.locationName}" from saved?`;
  unsavePendingCallback = () => {
    savedLocations = savedLocations.filter(l => l.id !== id);
    renderSavedPanel();
  };
  document.getElementById('unsave-modal').classList.add('open');
}

const locSavedItems = new Set();

function toggleLocSave(row) {
  const id      = row.dataset.id;
  const bizName = row.dataset.name;
  const label   = row.querySelector('span');

  if (locSavedItems.has(id)) {
    document.getElementById('unsave-msg').textContent = `Remove "${bizName}" from saved?`;
    unsavePendingCallback = () => {
      locSavedItems.delete(id);
      row.classList.remove('saved');
      label.textContent = 'Save';
      savedLocations = savedLocations.filter(l => l.id !== id);
      renderSavedPanel();
    };
    document.getElementById('unsave-modal').classList.add('open');
  } else {
    locSavedItems.add(id);
    row.classList.add('saved');
    label.textContent = 'Saved';
    const locName = currentLocShortName || 'Unknown Area';
    const lat = currentClickLat;
    const lon = currentClickLng;
    if (!savedLocations.find(l => l.id === id)) {
      savedLocations.push({ id, locationName: locName, businesses: [bizName], lat, lon });
    }
    renderSavedPanel();
  }
}

document.getElementById('cancel-unsave').addEventListener('click', () => {
  unsavePendingCallback = null;
  document.getElementById('unsave-modal').classList.remove('open');
});
document.getElementById('confirm-unsave').addEventListener('click', () => {
  if (unsavePendingCallback) { unsavePendingCallback(); unsavePendingCallback = null; }
  document.getElementById('unsave-modal').classList.remove('open');
});

function toggleCollapse(key) {
  const body  = document.getElementById(key + '-body');
  const arrow = document.getElementById(key + '-arrow');
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('rotated', !isOpen);
}

const profileBtn   = document.getElementById('profile-btn');
const profilePopup = document.getElementById('profile-popup');
const profileModal = document.getElementById('profile-modal');

profileBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  profilePopup.classList.toggle('open');
});

document.addEventListener('click', function(e) {
  if (!profilePopup.contains(e.target) && e.target !== profileBtn)
    profilePopup.classList.remove('open');
});

document.getElementById('logout-btn').addEventListener('click', () => {
  profilePopup.classList.remove('open');
  window.location.href = '/logout';
});

document.getElementById('profile-link-btn').addEventListener('click', () => {
  profilePopup.classList.remove('open');
  profileModal.classList.add('open');
});

document.getElementById('cancel-profile').addEventListener('click', () => {
  profileModal.classList.remove('open');
});

document.getElementById('confirm-profile').addEventListener('click', () => {
  profileModal.classList.remove('open');
  window.location.href = '/dashboard/Profile.html';
});

profileModal.addEventListener('click', (e) => {
  if (e.target === profileModal) {
    profileModal.classList.remove('open');
  }
});