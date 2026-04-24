let activeRequestId = 0;
const map = L.map('map').setView([14.5764, 121.0851], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 19
}).addTo(map);

const PASIG_BOUNDS = {
  minLat: 14.5200,
  maxLat: 14.6400,
  minLon: 121.0400,
  maxLon: 121.1300
};

function isInPasig(lat, lon) {
  return (
    lat >= PASIG_BOUNDS.minLat &&
    lat <= PASIG_BOUNDS.maxLat &&
    lon >= PASIG_BOUNDS.minLon &&
    lon <= PASIG_BOUNDS.maxLon
  );
}

const pinRangeEl = document.getElementById('pin-range');
const pinCountInput = document.getElementById('pin-count');
const pinCountLabel = document.getElementById('pin-count-label');

let lastFilteredIdea = null;
let lastFilteredBarangay = null;
let lastFilteredPrefs = null;

function showPinRange() {
  pinRangeEl?.classList.add('show');
}

function hidePinRange() {
  pinRangeEl?.classList.remove('show');
}

function setPinDefault() {
  if (pinCountInput) pinCountInput.value = '5';
  if (pinCountLabel) pinCountLabel.textContent = '5';
}

function getFilteredPinCount() {
  const v = Number(pinCountInput?.value ?? 5);
  const n = Number.isFinite(v) ? v : 5;
  return Math.min(50, Math.max(1, n));
}

async function replotFilteredPins() {
  if (!isFilterMode || !lastFilteredIdea) return;

  const requestId = ++activeRequestId;

  const top = getFilteredPinCount();
  const recs = await fetchIdeaLocations({
    idea: lastFilteredIdea,
    barangay: lastFilteredBarangay,
    top,
    prefs: lastFilteredPrefs
  });

  if (!isFilterMode || requestId !== activeRequestId) return;

  plotLocations(recs);
}

if (pinCountInput && pinCountLabel) {
  setPinDefault();

  pinCountInput.addEventListener('input', () => {
    if (!isFilterMode) return;
    pinCountLabel.textContent = String(getFilteredPinCount());
  });

  pinCountInput.addEventListener('change', async () => {
    if (!isFilterMode) return;
    await replotFilteredPins();
  });

  pinCountInput.addEventListener('mouseup', async () => {
    if (!isFilterMode) return;
    await replotFilteredPins();
  });

  pinCountInput.addEventListener('touchend', async () => {
    if (!isFilterMode) return;
    await replotFilteredPins();
  });
}

hidePinRange();

const filterPanel = document.getElementById('filter-panel');
const savedPanel = document.getElementById('saved-panel');
const locPanel = document.getElementById('loc-panel');

function closeAllPanels() {
  filterPanel.classList.remove('open');
  savedPanel.classList.remove('open');
  locPanel.classList.remove('open');
}

document.getElementById('close-saved-panel')?.addEventListener('click', () => savedPanel.classList.remove('open'));
document.getElementById('close-loc-panel')?.addEventListener('click', () => locPanel.classList.remove('open'));
document.getElementById('close-filter-panel')?.addEventListener('click', () => {
  filterPanel.classList.remove('open');

  activeRequestId++;

  isFilterMode = false;
  allowIdeaPins = false;

  lastFilteredIdea = null;
  lastFilteredBarangay = null;
  lastFilteredPrefs = null;

  clearBusinessMarkers();
  clearClickedMarker();

  hidePinRange();
  setPinDefault();

  const listEl = document.getElementById('rec-list');
  if (listEl) listEl.innerHTML = '';
});

document.getElementById('filter-btn')?.addEventListener('click', function (e) {
  e.stopPropagation();
  const isOpen = filterPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) filterPanel.classList.add('open');
});

document.getElementById('saved-btn')?.addEventListener('click', function (e) {
  e.stopPropagation();
  const isOpen = savedPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) {
    savedPanel.classList.add('open');
    fetchSavedRecommendations();
  }
});

let businessMarkers = [];
let clickedMarker = null;
let allowIdeaPins = true;
let isFilterMode = false;

function clearBusinessMarkers() {
  businessMarkers.forEach(m => map.removeLayer(m));
  businessMarkers = [];
}

function clearClickedMarker() {
  if (clickedMarker) {
    clickedMarker.off();
    map.removeLayer(clickedMarker);
    clickedMarker = null;
  }
}

const CODE_LABELS = {
  'RES': 'Restaurant',
  'RET': 'Retail',
  'SER': 'Services',
  'WSR': 'Wholesale',
  'WSE': 'Wholesale',
  'BSM': 'Manufacturing',
  'SSM': 'Manufacturing',
  'EX1': 'Export',
  'EX2': 'Export',
  'EX3': 'Export',
  'FRX': 'Foreign Exchange',
  'SBR': 'Stockbroker',
  'PWN': 'Pawnshop',
  'BNK': 'Bank',
  'IN6': 'Insurance',
  'PRT': 'Retail',
  'APT': 'Apartment Rental',
  'EDU': 'Educational Institution',
  'HOS': 'Hospital',
  'DEN': 'Dental Clinic',
  'DRG': 'Drug Store',
  'MED': 'Medical Clinic',
  'MOT': 'Motel',
  'SCA': 'Security Agency',
  'AMD': 'Amusement',
  'AMN': 'Amusement',
  'TA':  'Travel Agency',
  'PRN': 'Printing Services',
  'FTX': 'Franchise',
  'CAT': 'Catering',
  'ADM': 'Admin',
  'LAB': 'Laboratory',
};

const KEYWORD_LABELS = [
  ['SARI SARI',       'Sari-Sari Store'],
  ['GROCERY',         'Grocery'],
  ['BAKERY',          'Bakery'],
  ['BAKESHOP',        'Bakeshop'],
  ['RESTAURANT',      'Restaurant'],
  ['FAST FOOD',       'Fast Food'],
  ['COFFEE SHOP',     'Coffee Shop'],
  ['CANTEEN',         'Canteen'],
  ['EATERY',          'Eatery'],
  ['PANCITERIA',      'Panciteria'],
  ['CATERING',        'Catering'],
  ['PHARMACY',        'Pharmacy'],
  ['DRUG STORE',      'Drug Store'],
  ['CLINIC',          'Clinic'],
  ['DENTAL',          'Dental Clinic'],
  ['HOSPITAL',        'Hospital'],
  ['LABORATORY',      'Laboratory'],
  ['PAWNSHOP',        'Pawnshop'],
  ['BANK',            'Bank'],
  ['INSURANCE',       'Insurance'],
  ['LENDING',         'Lending'],
  ['HARDWARE',        'Hardware Store'],
  ['CELLPHONE',       'Cellphone Store'],
  ['APPLIANCES',      'Appliance Store'],
  ['OPTICAL',         'Optical Shop'],
  ['SALON',           'Salon'],
  ['BARBER',          'Barbershop'],
  ['SPA',             'Spa'],
  ['MASSAGE',         'Massage'],
  ['LAUNDRY',         'Laundry Shop'],
  ['CAR WASH',        'Car Wash'],
  ['GYM',             'Gym'],
  ['SCHOOL',          'School'],
  ['TUTORIAL',        'Tutorial Center'],
  ['TRAINING',        'Training Center'],
  ['TRAVEL',          'Travel Agency'],
  ['HOTEL',           'Hotel'],
  ['MOTEL',           'Motel'],
  ['FUNERAL',         'Funeral Services'],
  ['PRINTING',        'Printing Services'],
  ['ADVERTISING',     'Advertising'],
  ['CONSTRUCTION',    'Construction'],
  ['TRUCKING',        'Trucking'],
  ['LOGISTICS',       'Logistics'],
  ['SECURITY',        'Security Agency'],
  ['CONSULTANCY',     'Consultancy'],
  ['CONSULTING',      'Consulting'],
  ['ACCOUNTING',      'Accounting'],
  ['LAW',             'Law Firm'],
  ['REAL ESTATE',     'Real Estate'],
  ['TRADING',         'Trading'],
  ['RETAILER',        'Retail'],
  ['WHOLESALER',      'Wholesale'],
  ['MANUFACTURER',    'Manufacturing'],
  ['WAREHOUSE',       'Warehouse'],
  ['WATER REFILLING', 'Water Refilling Station'],
  ['GAS STATION',     'Gas Station'],
  ['LPG',             'LPG Dealer'],
  ['INTERNET',        'Internet Services'],
  ['SOFTWARE',        'Software Company'],
  ['BPO',             'BPO'],
  ['CALL CENTER',     'Call Center'],
  ['REMITTANCE',      'Money Remittance'],
  ['COOPERATIVE',     'Cooperative'],
  ['FOUNDATION',      'Foundation'],
];

function formatBizName(s) {
  const raw = (s || '').toString().trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();

  for (const [code, label] of Object.entries(CODE_LABELS)) {
    const pattern = new RegExp(`^${code}[\\s\\-\\.]+`, 'i');
    if (pattern.test(raw)) {
      const remainder = raw.replace(pattern, '').trim();
      const remainderUpper = remainder.toUpperCase();

      for (const [kw, kwLabel] of KEYWORD_LABELS) {
        if (remainderUpper.includes(kw)) return kwLabel;
      }

      if (!remainder) return label;
      const titled = remainder
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return `${label} - ${titled}`;
    }
  }

  for (const [kw, kwLabel] of KEYWORD_LABELS) {
    if (upper.includes(kw)) return kwLabel;
  }

  return raw
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function escapeHtml(str) {
  return (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plotLocations(recs) {
  if (!isFilterMode && !allowIdeaPins) return;

  clearBusinessMarkers();

  const bounds = L.latLngBounds();

  recs.forEach((rec) => {
    if (!rec.lat || !rec.lon) return;

    const lat = Number(rec.lat);
    const lon = Number(rec.lon);
    const brgy = rec.barangay_name || '';

    const marker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`<b>${escapeHtml(brgy)}</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}`);

    businessMarkers.push(marker);
    bounds.extend(marker.getLatLng());
  });

  if (bounds.isValid()) map.fitBounds(bounds.pad(0.2));
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
  if (filters.type) params.append('category', filters.type);
  if (filters.prefs?.length) params.append('prefs', filters.prefs.join(','));
  const res = await fetch(`/api/ideas?${params.toString()}`);
  const data = await res.json();
  return data.success ? data.data : [];
}

async function fetchIdeaLocations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.idea) params.append('idea', filters.idea);
  if (filters.barangay) params.append('barangay', filters.barangay);
  if (filters.top) params.append('top', filters.top);
  if (filters.prefs?.length) params.append('prefs', filters.prefs.join(','));
  const res = await fetch(`/api/idea-locations?${params.toString()}`);
  const data = await res.json();
  return data.success ? data.data : [];
}

let savedLocations = [];
let unsavePendingCallback = null;

async function fetchSavedRecommendations() {
  try {
    const res = await fetch('/api/saved-recommendations');
    const data = await res.json();
    if (data.success) {
      savedLocations = data.data.map((item) => ({
        dbId: item.id,
        id: `saved-${item.id}`,
        locationName: item.barangay || 'Unknown Area',
        businesses: [item.business_type],
        lat: item.lat,
        lon: item.lon
      }));
      renderSavedPanel();
      markSavedInCurrentList();
    }
  } catch (err) {
    console.error('Error fetching saved recommendations:', err);
  }
}

async function saveRecommendationToDB(business_type, barangay, lat, lon) {
  try {
    const res = await fetch('/api/saved-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_type,
        barangay: barangay || null,
        suitability_score: null,
        lat: lat ? parseFloat(lat) : null,
        lon: lon ? parseFloat(lon) : null
      })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error saving recommendation:', err);
    return { success: false, message: err.message };
  }
}

async function deleteSavedRecommendationFromDB(dbId) {
  try {
    const res = await fetch(`/api/saved-recommendations/${dbId}`, { method: 'DELETE' });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error deleting recommendation:', err);
    return { success: false };
  }
}

function markSavedInCurrentList() {
  document.querySelectorAll('#rec-list .save-row').forEach(row => {
    const name = row.dataset.name;
    const barangay = row.dataset.barangay || '';
    const isSaved = savedLocations.some(l => l.businesses[0] === name && l.locationName === barangay);
    const span = row.querySelector('span');
    if (isSaved) {
      row.classList.add('saved');
      if (span) span.textContent = 'Saved';
    } else {
      row.classList.remove('saved');
      if (span) span.textContent = 'Save';
    }
  });
}

function attachSaveRowListeners() {
  document.querySelectorAll('#rec-list .save-row').forEach(row => {
    row.removeEventListener('click', saveRowClickHandler);
    row.addEventListener('click', saveRowClickHandler);
  });
}

let currentLocShortName = '';
let currentClickLat = null;
let currentClickLng = null;
let currentBarangayName = '';
const locSavedItems = new Set();

async function saveRowClickHandler(e) {
  e.stopPropagation();
  e.preventDefault();
  const row = e.currentTarget;

  const bizName = row.dataset.name;
  const barangay = row.dataset.barangay || currentBarangayName || '';
  const label = row.querySelector('span');
  const saveKey = `${bizName}:${barangay}`;

  const isCurrentlySaved = row.classList.contains('saved');

  if (isCurrentlySaved) {
    const msg = document.getElementById('unsave-msg');
    if (msg) msg.textContent = `Remove "${formatBizName(bizName)}" from saved?`;

    unsavePendingCallback = async () => {
      const savedLoc = savedLocations.find(l => l.businesses[0] === bizName && l.locationName === barangay);
      if (savedLoc && savedLoc.dbId) {
        await deleteSavedRecommendationFromDB(savedLoc.dbId);
      }
      row.classList.remove('saved');
      if (label) label.textContent = 'Save';
      await fetchSavedRecommendations();
      locSavedItems.delete(saveKey);
    };
    document.getElementById('unsave-modal')?.classList.add('open');
    return;
  }

  const lat = currentClickLat;
  const lon = currentClickLng;
  const result = await saveRecommendationToDB(bizName, barangay, lat, lon);

  if (result.success || result.message === 'Already saved') {
    row.classList.add('saved');
    if (label) label.textContent = 'Saved';
    locSavedItems.add(saveKey);
    await fetchSavedRecommendations();
  }
}

async function renderIdeasAndPins({ type, barangay, prefs, allowPins }) {
  const ideas = await fetchIdeas({ type, barangay, prefs });
  const listEl = document.getElementById('rec-list');
  if (!listEl) return;

  if (!ideas.length) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = ideas.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}">
      <span class="rec-item-num">${i + 1}.</span>
      <span class="rec-item-name">${escapeHtml(formatBizName(name))}</span>
      <div class="save-row" data-name="${escapeHtml(name)}" data-barangay="${escapeHtml(barangay || '')}">
        <img src="/dashboard/save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');

  attachSaveRowListeners();

  listEl.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', async () => {
      if (!allowPins) return;
      const idea = el.dataset.idea;
      loadAreaDemographics(barangay || currentBarangayName, idea);
      const top = isFilterMode ? getFilteredPinCount() : 5;
      if (isFilterMode) {
        lastFilteredIdea = idea;
        lastFilteredBarangay = barangay || null;
        lastFilteredPrefs = prefs || [];
        showPinRange();
      } else {
        hidePinRange();
      }
      const recs = await fetchIdeaLocations({ idea, barangay, top, prefs });
      plotLocations(recs);
    });
  });

  markSavedInCurrentList();
}

const barangayMap = {
  'b-bagong-ilog': 'Bagong Ilog',
  'b-bagong-katipunan': 'Bagong Katipunan',
  'b-bambang': 'Bambang',
  'b-buting': 'Buting',
  'b-caniogan': 'Caniogan',
  'b-dela-paz': 'Dela Paz',
  'b-kalawaan': 'Kalawaan',
  'b-kapasigan': 'Kapasigan',
  'b-kapitolyo': 'Kapitolyo',
  'b-malinao': 'Malinao',
  'b-manggahan': 'Manggahan',
  'b-maybunga': 'Maybunga',
  'b-oranbo': 'Oranbo',
  'b-palatiw': 'Palatiw',
  'b-pinagbuhatan': 'Pinagbuhatan',
  'b-pineda': 'Pineda',
  'b-rosario': 'Rosario',
  'b-sagad': 'Sagad',
  'b-san-antonio': 'San Antonio',
  'b-san-joaquin': 'San Joaquin',
  'b-san-jose': 'San Jose',
  'b-san-miguel': 'San Miguel',
  'b-san-nicolas': 'San Nicolas',
  'b-santa-lucia': 'Santa Lucia',
  'b-santa-rosa': 'Santa Rosa',
  'b-santolan': 'Santolan',
  'b-sumilang': 'Sumilang',
  'b-ugong': 'Ugong',
  'b-vargas': 'F. Vargas',
  'b-wack-wack': 'Wack-Wack'
};

const typeMap = {
  'f-food': 'FOOD',
  'f-retail': 'RETAIL',
  'f-personal': 'PERSONAL',
  'f-tech': 'TECH'
};

document.getElementById('done-btn')?.addEventListener('click', async () => {
  filterPanel.classList.remove('open');
  allowIdeaPins = true;
  isFilterMode = true;
  lastFilteredIdea = null;
  lastFilteredBarangay = null;
  lastFilteredPrefs = null;
  setPinDefault();
  hidePinRange();

  const barangayCheckboxes = document.querySelectorAll('[id^="b-"]:checked');
  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');

  const selectedBarangays = [...barangayCheckboxes].map(cb => barangayMap[cb.id]).filter(Boolean);
  const selectedTypes = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);

  clearBusinessMarkers();

  const barangay = selectedBarangays[0] || null;
  const type = selectedTypes[0] || null;
  const prefs = getPrefs();

  if (!barangay && !type && !prefs.length) return;

  if (barangay) {
    loadAreaDemographics(barangay);
  }

  const titleEl = document.getElementById('loc-panel-title');
  const badgeEl = document.getElementById('loc-badge');
  if (titleEl) titleEl.textContent = barangay ? `Recommended Businesses in ${barangay}` : `Recommended Businesses`;
  if (badgeEl) badgeEl.textContent = barangay ? `📍 ${barangay}` : `📍 All Barangays`;

  locPanel.classList.add('open');
  await renderIdeasAndPins({ type, barangay, prefs, allowPins: true });
});

function showPasigToast(msg) {
  const el = document.getElementById('pasig-toast');
  if (!el) return;
  el.textContent = msg || 'Location not found in Pasig.';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

async function handleLocationSelect(lat, lon) {
  hidePinRange();
  isFilterMode = false;
  lastFilteredIdea = null;
  lastFilteredBarangay = null;
  lastFilteredPrefs = null;

  const latN = Number(lat);
  const lonN = Number(lon);

  if (!Number.isFinite(latN) || !Number.isFinite(lonN) || !isInPasig(latN, lonN)) {
    showPasigToast('Location not found in Pasig.');
    return;
  }

  currentClickLat = latN.toFixed(6);
  currentClickLng = lonN.toFixed(6);

  allowIdeaPins = false;
  clearBusinessMarkers();

  clearClickedMarker();
  clickedMarker = L.marker([latN, lonN], { draggable: true })
    .addTo(map)
    .bindPopup(`Selected location<br>${currentClickLat}, ${currentClickLng}`)
    .openPopup();

  clickedMarker.on('popupclose', () => clearClickedMarker());

  clickedMarker.on('drag', (ev) => {
    const p = ev.target.getLatLng();
    ev.target.setPopupContent(`Selected location<br>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
  });

  clickedMarker.on('dragend', async (ev) => {
    const p = ev.target.getLatLng();
    await handleLocationSelect(p.lat, p.lng);
  });

  const svDiv = document.getElementById('street-view');
  if (svDiv) {
    svDiv.innerHTML = `<iframe src="https://www.mapillary.com/embed?map_style=Mapillary%20light&lat=${currentClickLat}&lng=${currentClickLng}&z=17" style="width:100%;height:100%;border:none;"></iframe>`;
    svDiv.style.display = 'block';
  }
  const closeSV = document.getElementById('closeSV');
  if (closeSV) closeSV.style.display = 'block';

  filterPanel.classList.remove('open');
  savedPanel.classList.remove('open');
  locPanel.classList.add('open');

  locSavedItems.clear();

  const badge = document.getElementById('loc-badge');
  const titleEl = document.getElementById('loc-panel-title');
  if (badge) badge.textContent = '📍 Locating…';
  currentLocShortName = `${currentClickLat}, ${currentClickLng}`;
  currentBarangayName = '';

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentClickLat}&lon=${currentClickLng}&format=json`);
    const data = await res.json();
    const addr = data.address || {};
    const area = addr.barangay || addr.suburb || addr.neighbourhood || addr.city_district || addr.village || addr.town || addr.county || '';
    const city = addr.city || addr.municipality || addr.town || addr.county || '';
    currentLocShortName = area ? (city ? `${area}, ${city}` : area) : (city || currentLocShortName);
    currentBarangayName = area || '';
    if (badge) badge.textContent = `📍 ${currentLocShortName}`;
    if (titleEl) titleEl.textContent = `Recommended Businesses in ${area || city || 'this Area'}`;
  } catch (err) {
    if (badge) badge.textContent = `📍 ${currentClickLat}, ${currentClickLng}`;
  }

  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');
  const selectedTypes = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);
  const type = selectedTypes[0] || null;
  const prefs = getPrefs();

  const ideasRes = await fetch(`/api/ideas-by-point?lat=${currentClickLat}&lon=${currentClickLng}&category=${type || ''}&prefs=${prefs.join(',')}`);
  const ideasData = await ideasRes.json();
  const listEl = document.getElementById('rec-list');

  if (!listEl) return;

  loadAreaDemographics(currentBarangayName);

  if (!ideasData.success || !ideasData.data.length) {
    listEl.innerHTML = '<div class="rec-item">No recommendations found.</div>';
    return;
  }

  listEl.innerHTML = ideasData.data.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}">
      <span class="rec-item-num">${i + 1}.</span>
      <span class="rec-item-name">${escapeHtml(formatBizName(name))}</span>
      <div class="save-row" data-name="${escapeHtml(name)}" data-barangay="${escapeHtml(currentBarangayName)}">
        <img src="/dashboard/save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');

  attachSaveRowListeners();
  markSavedInCurrentList();
}

map.on('click', async function (e) {
  hidePinRange();
  isFilterMode = false;

  const lat = Number(e.latlng.lat);
  const lon = Number(e.latlng.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInPasig(lat, lon)) {
    showPasigToast('Location not found in Pasig.');
    return;
  }
  await handleLocationSelect(lat, lon);
});

document.getElementById('closeSV')?.addEventListener('click', () => {
  const svDiv = document.getElementById('street-view');
  if (svDiv) {
    svDiv.style.display = 'none';
    svDiv.innerHTML = '';
  }
  const closeSV = document.getElementById('closeSV');
  if (closeSV) closeSV.style.display = 'none';
  hidePinRange();
  clearBusinessMarkers();
  clearClickedMarker();
  lastFilteredIdea = null;
  lastFilteredBarangay = null;
  lastFilteredPrefs = null;
  isFilterMode = false;
  setPinDefault();
});

let searchHistory = [];

function renderHistory() {
  const container = document.getElementById('search-history');
  if (!container) return;

  if (!searchHistory.length) {
    container.classList.remove('open');
    return;
  }

  container.innerHTML = searchHistory.map((item, i) => `
    <div class="history-item" data-idx="${i}">
      <img src="history.png" alt="history" class="history-icon">
      <span class="history-label">${escapeHtml(item)}</span>
      <img src="x.png" alt="remove" class="history-x" data-remove="${i}">
    </div>
  `).join('');
  container.classList.add('open');

  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', function (e) {
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.remove);
        searchHistory.splice(idx, 1);
        renderHistory();
        return;
      }
      const label = this.querySelector('.history-label')?.textContent || '';
      const input = document.getElementById('search-input');
      if (input) input.value = label;
      container.classList.remove('open');
      doSearch(label);
    });
  });
}

const searchInput = document.getElementById('search-input');

searchInput?.addEventListener('focus', () => { if (searchHistory.length) renderHistory(); });
searchInput?.addEventListener('input', function () {
  if (!this.value.trim() && searchHistory.length) renderHistory();
  else document.getElementById('search-history')?.classList.remove('open');
});

document.addEventListener('click', function (e) {
  const wrapper = document.getElementById('search-wrapper');
  if (wrapper && !wrapper.contains(e.target)) document.getElementById('search-history')?.classList.remove('open');
});

async function doSearch(query) {
  try {
    hidePinRange();
    isFilterMode = false;
    lastFilteredIdea = null;
    lastFilteredBarangay = null;
    lastFilteredPrefs = null;

    const viewbox = `${PASIG_BOUNDS.minLon},${PASIG_BOUNDS.maxLat},${PASIG_BOUNDS.maxLon},${PASIG_BOUNDS.minLat}`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&bounded=1&viewbox=${viewbox}`
    );
    const data = await res.json();
    if (!data.length) {
      showPasigToast('Location not found in Pasig.');
      return;
    }

    const latNum = Number(data[0].lat);
    const lonNum = Number(data[0].lon);

    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !isInPasig(latNum, lonNum)) {
      showPasigToast('Location not found in Pasig.');
      return;
    }

    const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lonNum}&format=json`);
    const revData = await rev.json();
    const addr = revData.address || {};
    const city = (addr.city || addr.municipality || addr.town || addr.county || '').toLowerCase();

    if (!city.includes('pasig')) {
      showPasigToast('Location not found in Pasig.');
      return;
    }

    map.setView([latNum, lonNum], 16);
    await handleLocationSelect(latNum, lonNum);
  } catch (err) {
    console.error(err);
    showPasigToast('Something went wrong.');
  }
}

searchInput?.addEventListener('keydown', async function (e) {
  if (e.key !== 'Enter') return;
  const query = searchInput.value.trim();
  if (!query) return;
  document.getElementById('search-history')?.classList.remove('open');
  searchHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
  await doSearch(query);
});

function renderSavedPanel() {
  const body = document.getElementById('saved-panel-body');
  if (!body) return;

  if (!savedLocations.length) {
    body.innerHTML = '<p style="font-size:13px;color:#aaa;margin-top:10px;">No saved locations yet.</p>';
    return;
  }

  body.innerHTML = savedLocations.map(loc => `
    <div class="saved-location-card" id="saved-card-${loc.id}">
      <div class="saved-card-header">
        <div class="saved-card-title" onclick="focusSavedLocation('${loc.id}')">${escapeHtml(loc.locationName)}</div>
        <div class="saved-card-actions">
          <button class="card-icon-btn" title="Unsave" onclick="promptUnsaveLocation('${loc.id}')">
            <img src="/dashboard/save.png" alt="unsave">
          </button>
          <button class="card-icon-btn" title="Toggle details" onclick="toggleSavedCard('${loc.id}', this)">
            <img src="/dashboard/down.png" alt="expand" class="collapsible-arrow">
          </button>
        </div>
      </div>
      <div class="saved-card-body" id="saved-body-${loc.id}">
        <ul class="saved-biz-list">
          ${loc.businesses.map((b, i) => `<li>${i + 1}. ${escapeHtml(formatBizName(b))}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');
}

function focusSavedLocation(id) {
  hidePinRange();
  isFilterMode = false;

  const loc = savedLocations.find(l => l.id === id);
  if (!loc || !loc.lat || !loc.lon) return;

  const lat = Number(loc.lat);
  const lon = Number(loc.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  clearClickedMarker();
  clickedMarker = L.marker([lat, lon]).addTo(map).bindPopup(`${escapeHtml(loc.locationName)}<br>${loc.lat}, ${loc.lon}`).openPopup();
  clickedMarker.on('popupclose', () => clearClickedMarker());
  map.setView([lat, lon], 16);
}

function toggleSavedCard(id, btn) {
  const body = document.getElementById('saved-body-' + id);
  const arrow = btn.querySelector('.collapsible-arrow');
  if (!body || !arrow) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('rotated', !isOpen);
}

function promptUnsaveLocation(id) {
  const loc = savedLocations.find(l => l.id === id);
  if (!loc) return;
  const msg = document.getElementById('unsave-msg');
  if (msg) msg.textContent = `Remove "${escapeHtml(loc.locationName)}" from saved?`;
  unsavePendingCallback = async () => {
    if (loc.dbId) await deleteSavedRecommendationFromDB(loc.dbId);
    savedLocations = savedLocations.filter(l => l.id !== id);
    renderSavedPanel();
  };
  document.getElementById('unsave-modal')?.classList.add('open');
}

document.getElementById('cancel-unsave')?.addEventListener('click', () => {
  unsavePendingCallback = null;
  document.getElementById('unsave-modal')?.classList.remove('open');
});

document.getElementById('confirm-unsave')?.addEventListener('click', async () => {
  if (unsavePendingCallback) {
    await unsavePendingCallback();
    unsavePendingCallback = null;
  }
  document.getElementById('unsave-modal')?.classList.remove('open');
});

const profileBtn = document.getElementById('profile-btn');
const profilePopup = document.getElementById('profile-popup');
const profileModal = document.getElementById('profile-modal');

profileBtn?.addEventListener('click', function (e) {
  e.stopPropagation();
  profilePopup?.classList.toggle('open');
});

document.addEventListener('click', function (e) {
  if (profilePopup && profileBtn && !profilePopup.contains(e.target) && e.target !== profileBtn) profilePopup.classList.remove('open');
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
  profilePopup?.classList.remove('open');
  window.location.href = '/logout';
});

document.getElementById('profile-link-btn')?.addEventListener('click', () => {
  profilePopup?.classList.remove('open');
  profileModal?.classList.add('open');
});

document.getElementById('cancel-profile')?.addEventListener('click', () => {
  profileModal?.classList.remove('open');
});

document.getElementById('confirm-profile')?.addEventListener('click', () => {
  profileModal?.classList.remove('open');
  window.location.href = '/dashboard/Profile.html';
});

profileModal?.addEventListener('click', (e) => {
  if (e.target === profileModal) profileModal.classList.remove('open');
});

async function loadAreaDemographics(barangay, businessLine) {
  if (!barangay) return;

  try {
    const params = new URLSearchParams();
    params.append('barangay', barangay);
    if (businessLine) params.append('line_of_business', businessLine);
    
    const res = await fetch(`/api/area-demographics?${params.toString()}`);
    const data = await res.json();
    
    if (!data.success) return;

    const demo = data.data.demographic;
    const totalBiz = data.data.totalBusinesses;
    const sameLineCount = data.data.sameLineCount;

    // --- Populate Demographic Data ---
    const demoBody = document.getElementById('demo-body');
    if (demoBody) {
      let demoHTML = '<ul>';
      
      if (demo) {
        demoHTML += `<li><strong>Population:</strong> ${demo.population ? demo.population.toLocaleString() : 'N/A'}</li>`;
        demoHTML += `<li><strong>Population Density:</strong> ${demo.population_density ? demo.population_density.toLocaleString() + ' per km²' : 'N/A'}</li>`;
        demoHTML += `<li><strong>Dominant Age Group:</strong> ${demo.highest_age_group || 'N/A'}</li>`;
        
        const incomeMin = demo.avg_income_min ? '₱' + demo.avg_income_min.toLocaleString() : 'N/A';
        const incomeMax = demo.avg_income_max ? '₱' + demo.avg_income_max.toLocaleString() : 'N/A';
        const incomeRange = (demo.avg_income_min || demo.avg_income_max) ? `${incomeMin} – ${incomeMax}` : 'N/A';
        demoHTML += `<li><strong>Average Income Range:</strong> ${incomeRange}</li>`;
        demoHTML += `<li><strong>Gender Distribution:</strong> ${demo.gender_distribution || 'N/A'}</li>`;
        demoHTML += `<li><strong>Total Businesses in Area:</strong> ${totalBiz.toLocaleString()}</li>`;
        
        if (businessLine) {
          demoHTML += `<li><strong>Same Line of Business Count:</strong> ${sameLineCount.toLocaleString()}</li>`;
        }
      } else {
        demoHTML += '<li>No demographic data available for this area.</li>';
      }
      
      demoHTML += '</ul>';
      demoBody.innerHTML = demoHTML;
    }

    // --- Populate Area Summary ---
    const summaryBody = document.getElementById('summary-body');
    if (summaryBody) {
      let summary = '';
      
      if (!demo) {
        summary = `<p>No demographic data available for <strong>${escapeHtml(barangay)}</strong>. A detailed area summary cannot be generated at this time.</p>`;
      } else {
        const densityLabel = demo.population && demo.population_density
          ? (demo.population_density > 30000 ? 'densely populated' : demo.population_density > 15000 ? 'moderately populated' : 'sparsely populated')
          : 'populated';

        const ageLabel = demo.highest_age_group || 'all ages';

        let incomeLabel = 'with varied income levels';
        if (demo.avg_income_max) {
          if (demo.avg_income_max > 50000) incomeLabel = 'with high purchasing power';
          else if (demo.avg_income_max > 25000) incomeLabel = 'with moderate-to-high purchasing power';
          else incomeLabel = 'with modest income levels';
        }

        const genderLabel = demo.gender_distribution ? `a predominantly ${demo.gender_distribution.toLowerCase()} population` : 'a balanced gender distribution';

        summary = `<p>
          <strong>${escapeHtml(demo.barangay_name || barangay)}</strong> is a ${densityLabel} barangay in Pasig 
          with a total population of <strong>${demo.population ? demo.population.toLocaleString() : 'N/A'}</strong> 
          and a population density of <strong>${demo.population_density ? demo.population_density.toLocaleString() : 'N/A'} per km²</strong>.
          The dominant age group is <strong>${ageLabel}</strong>, and the area has ${genderLabel}.
          Households in this barangay have an average income range of 
          <strong>${demo.avg_income_min ? '₱' + demo.avg_income_min.toLocaleString() : 'N/A'} – ${demo.avg_income_max ? '₱' + demo.avg_income_max.toLocaleString() : 'N/A'}</strong>,
          making it an area ${incomeLabel}.
          There are <strong>${totalBiz.toLocaleString()}</strong> registered businesses operating in the area${businessLine ? `, <strong>${sameLineCount.toLocaleString()}</strong> of which are in the same line of business` : ''}.
          This barangay is well-suited for businesses targeting the <strong>${ageLabel}</strong> age group with offerings that match the local income profile.
        </p>`;
      }

      summaryBody.innerHTML = summary;
    }
  } catch (err) {
    console.error('Error loading area demographics:', err);
  }
}

function toggleCollapse(key) {
  const body  = document.getElementById(key + '-body');
  const arrow = document.getElementById(key + '-arrow');
  if (!body || !arrow) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('rotated', !isOpen);
}


document.addEventListener('DOMContentLoaded', () => {
  fetchSavedRecommendations();
});