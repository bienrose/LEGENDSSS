let activeRequestId = 0;
let isFilterMode = false;
let allowIdeaPins = true;
let businessMarkers = [];
let clickedMarker = null;
let savedLocations = [];
let unsavePendingCallback = null;
let currentLocShortName = '';
let currentClickLat = null;
let currentClickLng = null;
let currentBarangayName = '';
let lastFilteredIdea = null;
let lastFilteredBarangay = null;
let lastFilteredPrefs = null;
let searchHistory = [];
const locSavedItems = new Set();

// ─── ACTIVE IDEA STATE ────────────────────────────────────────────────────────
let activeIdeaIdx = -1;
let activeIdeaName = null;
let activeIdeaBarangay = null;
let activeIdeaPrefs = [];

// Populated on DOMContentLoaded from /api/me
let userIndustry = '';
let userIndustrySpecific = '';

// ─── INDUSTRY → FILTER CHECKBOX MAP ─────────────────────────────────────────
const INDUSTRY_FILTER_MAP = {
  'food and beverages': 'f-food',
  'food & beverages': 'f-food',
  'food and beverage': 'f-food',
  'food & beverage': 'f-food',
  'food': 'f-food',
  'restaurant': 'f-food',
  'retail': 'f-retail',
  'retail & trading': 'f-retail',
  'retail and trading': 'f-retail',
  'personal care': 'f-personal',
  'personal services': 'f-personal',
  'personal care and services': 'f-personal',
  'beauty & wellness': 'f-personal',
  'beauty and wellness': 'f-personal',
  'technology': 'f-tech',
  'technology digital service': 'f-tech',
  'digital services': 'f-tech',
  'wholesale': 'f-wholesale',
  'wholesale & import': 'f-wholesale',
  'wholesale and import': 'f-wholesale',
  'manufacturing': 'f-manufacturing',
  'it': 'f-it',
  'it & software': 'f-it',
  'it and software': 'f-it',
  'information technology': 'f-it',
  'software': 'f-it',
  'bpo': 'f-bpo',
  'bpo & call center': 'f-bpo',
  'bpo and call center': 'f-bpo',
  'call center': 'f-bpo',
  'construction': 'f-construction',
  'finance': 'f-finance',
  'finance & banking': 'f-finance',
  'finance and banking': 'f-finance',
  'banking': 'f-finance',
  'education': 'f-education',
  'healthcare': 'f-healthcare',
  'health': 'f-healthcare',
  'energy': 'f-energy',
  'energy and fuel': 'f-energy',
  'energy & fuel': 'f-energy',
  'logistics': 'f-logistics',
  'logistics & transport': 'f-logistics',
  'logistics and transport': 'f-logistics',
  'transport': 'f-logistics',
  'hospitality': 'f-hospitality',
  'hotel': 'f-hospitality',
  'security': 'f-security',
  'security services': 'f-security',
  'legal': 'f-legal',
  'legal & consulting': 'f-legal',
  'legal and consulting': 'f-legal',
  'consulting': 'f-legal',
  'consultancy': 'f-legal',
  'marketing': 'f-marketing',
  'marketing & advertising': 'f-marketing',
  'marketing and advertising': 'f-marketing',
  'advertising': 'f-marketing',
  'admin': 'f-admin',
  'admin & management': 'f-admin',
  'admin and management': 'f-admin',
  'hr & manpower': 'f-admin',
  'hr and manpower': 'f-admin',
  'general services': 'f-general',
  'general': 'f-general'
};

// ─── REPORT LOGGING ───────────────────────────────────────────────────────────
function reportLogRead() {
  try {
    return JSON.parse(localStorage.getItem('reportLogs') || '{"searchPins":[],"recommendations":[],"saved":[]}') || {
      searchPins: [], recommendations: [], saved: []
    };
  } catch {
    return { searchPins: [], recommendations: [], saved: [] };
  }
}

function reportLogWrite(logs) {
  localStorage.setItem('reportLogs', JSON.stringify(logs));
}

function reportNow() {
  return new Date().toISOString();
}

function reportPush(kind, payload) {
  const logs = reportLogRead();
  if (!logs[kind]) logs[kind] = [];
  if (kind === 'searchPins') {
    const key = `${payload.source || ''}::${(payload.locationName || '').trim().toLowerCase()}`;
    logs[kind] = logs[kind].filter(x => {
      const k2 = `${x.source || ''}::${(x.locationName || '').trim().toLowerCase()}`;
      return k2 !== key;
    });
  }
  logs[kind].unshift(payload);
  logs[kind] = logs[kind].slice(0, 200);
  reportLogWrite(logs);
}

function reportCurrentFiltersSnapshot() {
  const barangayCheckboxes = document.querySelectorAll('[id^="b-"]:checked');
  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');
  const selectedBarangays = [...barangayCheckboxes].map(cb => barangayMap[cb.id]).filter(Boolean);
  const selectedTypes = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);
  const prefs = getPrefs();
  return {
    barangay: selectedBarangays[0] || null,
    type: selectedTypes[0] || null,
    prefs,
    pinCount: isFilterMode ? getFilteredPinCount() : null
  };
}

async function reportLogSearchOrPin({ source, locationName, lat, lon }) {
  const f = reportCurrentFiltersSnapshot();
  reportPush('searchPins', {
    at: reportNow(), source,
    locationName: locationName || null,
    lat: lat ?? null, lon: lon ?? null, filters: f
  });
  try {
    await fetch('/api/report/search-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: locationName || null, source: source || 'map', lat: lat ?? null, lon: lon ?? null })
    });
  } catch (e) { console.warn('DB report search-pin failed:', e); }
}

async function reportLogRecommendation({ idea, area, pinCount, lat, lon }) {
  const f = reportCurrentFiltersSnapshot();
  reportPush('recommendations', {
    at: reportNow(), idea, area: area || null,
    pinCount: pinCount ?? null, lat: lat ?? null, lon: lon ?? null, filters: f
  });
  try {
    await fetch('/api/report/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: idea || null, area: area || null, lat: lat ?? null, lon: lon ?? null })
    });
  } catch (e) { console.warn('DB report recommendation failed:', e); }
}

async function reportLogSaved({ action, business_type, barangay, lat, lon }) {
  reportPush('saved', {
    at: reportNow(), action, business_type,
    barangay: barangay || null, lat: lat ?? null, lon: lon ?? null
  });
  try {
    await fetch('/api/report/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action || 'saved', business_type: business_type || null,
        barangay: barangay || null, lat: lat ?? null, lon: lon ?? null
      })
    });
  } catch (e) { console.warn('DB report saved failed:', e); }
}

// ─── MAP SETUP ───────────────────────────────────────────────────────────────
const map = L.map('map').setView([14.5764, 121.0851], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 19
}).addTo(map);

const PASIG_BOUNDS = {
  minLat: 14.5200, maxLat: 14.6400, minLon: 121.0400, maxLon: 121.1300
};

function isInPasig(lat, lon) {
  return lat >= PASIG_BOUNDS.minLat && lat <= PASIG_BOUNDS.maxLat &&
    lon >= PASIG_BOUNDS.minLon && lon <= PASIG_BOUNDS.maxLon;
}

const pinRangeEl = document.getElementById('pin-range');
const pinCountInput = document.getElementById('pin-count');
const pinCountLabel = document.getElementById('pin-count-label');

function showPinRange() { pinRangeEl?.classList.add('show'); }
function hidePinRange() { pinRangeEl?.classList.remove('show'); }
function setPinDefault() { if (pinCountInput) pinCountInput.value = '5'; if (pinCountLabel) pinCountLabel.textContent = '5'; }

function getFilteredPinCount() {
  const v = Number(pinCountInput?.value ?? 5);
  const n = Number.isFinite(v) ? v : 5;
  return Math.min(50, Math.max(1, n));
}

async function fetchIdeaLocations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.idea) params.append('idea', filters.idea.trim());
  if (filters.barangay) params.append('barangay', filters.barangay);
  if (filters.top) params.append('top', filters.top);
  if (filters.prefs?.length) params.append('prefs', filters.prefs.join(','));
  if (filters._t) params.append('_t', filters._t);
  const res = await fetch(`/api/idea-locations?${params.toString()}`);
  const data = await res.json();
  return data.success ? data.data : [];
}

// ─── REPLOT: replots the currently active idea across ALL selected barangays ──
async function replotFilteredPins() {
  if (!isFilterMode) return;
  if (activeIdeaIdx === -1 || !activeIdeaName) return;

  const requestId = ++activeRequestId;
  const top = getFilteredPinCount();

  clearBusinessMarkers();

  const barangays = activeIdeaBarangay && activeIdeaBarangay.length ? activeIdeaBarangay : [null];

  const allRecs = (await Promise.all(
    barangays.map(b => fetchIdeaLocations({
      idea: activeIdeaName,
      barangay: b,
      top,
      prefs: activeIdeaPrefs
    }))
  )).flat();

  if (requestId !== activeRequestId) return;

  plotLocations(allRecs);
}

if (pinCountInput && pinCountLabel) {
  setPinDefault();
  pinCountInput.addEventListener('input', () => {
    if (!isFilterMode) return;
    pinCountLabel.textContent = String(getFilteredPinCount());
  });

  const fireSlider = async () => {
    if (!isFilterMode) return;
    pinCountLabel.textContent = String(getFilteredPinCount());
    await replotFilteredPins();
  };

  pinCountInput.addEventListener('change', fireSlider);
  pinCountInput.addEventListener('pointerup', fireSlider);
  pinCountInput.addEventListener('mouseup', fireSlider);
  pinCountInput.addEventListener('touchend', fireSlider);
}

hidePinRange();

const filterPanel = document.getElementById('filter-panel');
const savedPanel = document.getElementById('saved-panel');
const locPanel = document.getElementById('loc-panel');

function closeAllPanels() {
  filterPanel?.classList.remove('open');
  savedPanel?.classList.remove('open');
  locPanel?.classList.remove('open');
}

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
  activeIdeaIdx = -1;
  activeIdeaName = null;
  activeIdeaBarangay = null;
  activeIdeaPrefs = [];
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

const CODE_LABELS = {
  'RES': 'Restaurant', 'RET': 'Retail', 'SER': 'Services', 'WSR': 'Wholesale', 'WSE': 'Wholesale',
  'BSM': 'Manufacturing', 'SSM': 'Manufacturing', 'EX1': 'Export', 'EX2': 'Export', 'EX3': 'Export',
  'FRX': 'Foreign Exchange', 'SBR': 'Stockbroker', 'PWN': 'Pawnshop', 'BNK': 'Bank', 'IN6': 'Insurance',
  'PRT': 'Retail', 'APT': 'Apartment Rental', 'EDU': 'Educational Institution', 'HOS': 'Hospital', 'DEN': 'Dental Clinic',
  'DRG': 'Drug Store', 'MED': 'Medical Clinic', 'MOT': 'Motel', 'SCA': 'Security Agency', 'AMD': 'Amusement', 'AMN': 'Amusement',
  'TA': 'Travel Agency', 'PRN': 'Printing Services', 'FTX': 'Franchise', 'CAT': 'Catering', 'ADM': 'Admin', 'LAB': 'Laboratory'
};

const KEYWORD_LABELS = [
  ['SARI SARI', 'Sari-Sari Store'], ['GROCERY', 'Grocery'], ['BAKERY', 'Bakery'], ['BAKESHOP', 'Bakeshop'],
  ['RESTAURANT', 'Restaurant'], ['FAST FOOD', 'Fast Food'], ['COFFEE SHOP', 'Coffee Shop'], ['CANTEEN', 'Canteen'],
  ['EATERY', 'Eatery'], ['PANCITERIA', 'Panciteria'], ['CATERING', 'Catering'], ['PHARMACY', 'Pharmacy'],
  ['DRUG STORE', 'Drug Store'], ['CLINIC', 'Clinic'], ['DENTAL', 'Dental Clinic'], ['HOSPITAL', 'Hospital'],
  ['LABORATORY', 'Laboratory'], ['PAWNSHOP', 'Pawnshop'], ['BANK', 'Bank'], ['INSURANCE', 'Insurance'],
  ['LENDING', 'Lending'], ['HARDWARE', 'Hardware Store'], ['CELLPHONE', 'Cellphone Store'], ['APPLIANCES', 'Appliance Store'],
  ['OPTICAL', 'Optical Shop'], ['SALON', 'Salon'], ['BARBER', 'Barbershop'], ['SPA', 'Spa'], ['MASSAGE', 'Massage'],
  ['LAUNDRY', 'Laundry Shop'], ['CAR WASH', 'Car Wash'], ['GYM', 'Gym'], ['SCHOOL', 'School'], ['TUTORIAL', 'Tutorial Center'],
  ['TRAINING', 'Training Center'], ['TRAVEL', 'Travel Agency'], ['HOTEL', 'Hotel'], ['MOTEL', 'Motel'], ['FUNERAL', 'Funeral Services'],
  ['PRINTING', 'Printing Services'], ['ADVERTISING', 'Advertising'], ['CONSTRUCTION', 'Construction'], ['TRUCKING', 'Trucking'],
  ['LOGISTICS', 'Logistics'], ['SECURITY', 'Security Agency'], ['CONSULTANCY', 'Consultancy'], ['CONSULTING', 'Consulting'],
  ['ACCOUNTING', 'Accounting'], ['LAW', 'Law Firm'], ['REAL ESTATE', 'Real Estate'], ['TRADING', 'Trading'], ['RETAILER', 'Retail'],
  ['WHOLESALER', 'Wholesale'], ['MANUFACTURER', 'Manufacturing'], ['WAREHOUSE', 'Warehouse'], ['WATER REFILLING', 'Water Refilling Station'],
  ['GAS STATION', 'Gas Station'], ['LPG', 'LPG Dealer'], ['INTERNET', 'Internet Services'], ['SOFTWARE', 'Software Company'],
  ['BPO', 'BPO'], ['CALL CENTER', 'Call Center'], ['REMITTANCE', 'Money Remittance'], ['COOPERATIVE', 'Cooperative'], ['FOUNDATION', 'Foundation']
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
      const titled = remainder.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${label} - ${titled}`;
    }
  }
  for (const [kw, kwLabel] of KEYWORD_LABELS) {
    if (upper.includes(kw)) return kwLabel;
  }
  return raw.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const GENERIC_CHIP_MAP = [
  [/coffee|cafe|kape|brew/i, 'Coffee Shop'],
  [/milk\s*tea|boba|bubble\s*tea|chatime|coco\s*fresh|gong\s*cha|macao|tealive/i, 'Milk Tea Shop'],
  [/juice|smoothie|shake|jamba/i, 'Juice Bar'],
  [/tea\s*house|tea\s*room/i, 'Tea House'],
  [/pizza|pizzeria/i, 'Pizza Shop'],
  [/burger|hamburger|jollibee|mcdo|mcdonald|wendy|five\s*guys/i, 'Burger Restaurant'],
  [/sushi|japanese|ramen|udon|maki|katsu/i, 'Japanese Restaurant'],
  [/korean|kbbq|samgyup/i, 'Korean Restaurant'],
  [/chinese|dimsum|dim\s*sum|mami|noodle/i, 'Chinese Restaurant'],
  [/chicken|fried\s*chicken|bonchon|crispy/i, 'Fried Chicken Restaurant'],
  [/bbq|barbecue|ihaw/i, 'BBQ Restaurant'],
  [/shawarma|arabic|middle\s*east|halal/i, 'Halal/Shawarma Shop'],
  [/seafood|isda|dampa/i, 'Seafood Restaurant'],
  [/steak|grill|steakhouse/i, 'Steakhouse'],
  [/pasta|italian|spaghetti/i, 'Italian Restaurant'],
  [/vegetarian|vegan|healthy\s*food/i, 'Healthy Food Restaurant'],
  [/snack|merienda|street\s*food|kwek|fishball/i, 'Street Food / Snack Shop'],
  [/panciteria|pansit|mami\s*house/i, 'Panciteria'],
  [/canteen|carinderia|turo.turo/i, 'Canteen / Carinderia'],
  [/bakery|bakeshop|panadeya|tinapay/i, 'Bakery'],
  [/cake|pastry|dessert|sweets|candy|chocolate/i, 'Pastry & Dessert Shop'],
  [/ice\s*cream|gelato|frozen|creamery/i, 'Ice Cream Shop'],
  [/donut|doughnut|dunkin/i, 'Donut Shop'],
  [/fast\s*food/i, 'Fast Food Restaurant'],
  [/catering/i, 'Catering Services'],
  [/restaurant|eatery|diner|grill|kainan/i, 'Restaurant'],
  [/sari.sari|tindera/i, 'Sari-Sari Store'],
  [/grocery|supermarket|palengke|market/i, 'Grocery / Supermarket'],
  [/convenience\s*store|7.eleven|minimart/i, 'Convenience Store'],
  [/appliance|electronics|gadget/i, 'Appliance / Electronics Store'],
  [/cellphone|mobile\s*phone|smartphone/i, 'Cellphone Shop'],
  [/clothing|fashion|apparel|boutique|ukay/i, 'Clothing Store'],
  [/shoe|footwear|sneaker/i, 'Shoe Store'],
  [/hardware|construction\s*supply/i, 'Hardware Store'],
  [/bookstore|school\s*supply|national\s*book/i, 'Bookstore'],
  [/toy|games\s*shop/i, 'Toy Store'],
  [/pet\s*shop|veterinary|vet\s*clinic/i, 'Pet Shop'],
  [/flower|florist/i, 'Flower Shop'],
  [/optical|eyewear|glasses/i, 'Optical Shop'],
  [/pharmacy|drug\s*store|botika|rose\s*pharmacy|mercury/i, 'Pharmacy'],
  [/water\s*refilling|purified\s*water/i, 'Water Refilling Station'],
  [/lpg|gas\s*dealer/i, 'LPG / Gas Dealer'],
  [/retail|trading|distributor|supplier/i, 'Retail Store'],
  [/salon|barbershop|barber|hair|gupit/i, 'Salon / Barbershop'],
  [/spa|massage|wellness|relax/i, 'Spa & Massage'],
  [/nail\s*salon|manicure|pedicure/i, 'Nail Salon'],
  [/laundry|dry\s*clean|washing/i, 'Laundry Shop'],
  [/tailoring|alteration|dress\s*maker/i, 'Tailoring Shop'],
  [/photography|photo\s*studio/i, 'Photo Studio'],
  [/gym|fitness|crossfit|pilates|yoga/i, 'Gym / Fitness Center'],
  [/hospital|medical\s*center/i, 'Hospital'],
  [/clinic|medical/i, 'Medical Clinic'],
  [/dental|dentist/i, 'Dental Clinic'],
  [/laboratory|diagnostic/i, 'Medical Laboratory'],
  [/pawnshop|palawagan|cebuana|mlhuillier/i, 'Pawnshop'],
  [/remittance|money\s*transfer|western\s*union|lbc\s*money/i, 'Money Remittance'],
  [/lending|loan|microfinance/i, 'Lending / Microfinance'],
  [/bank|banking|savings/i, 'Bank'],
  [/insurance/i, 'Insurance'],
  [/cooperative|coop/i, 'Cooperative'],
  [/tutorial|review\s*center|kumon/i, 'Tutorial / Review Center'],
  [/school|academy|college|university/i, 'School / Academy'],
  [/training\s*center|driving\s*school/i, 'Training Center'],
  [/daycare|childcare|nursery/i, 'Daycare Center'],
  [/hotel|inn|hostel|lodge/i, 'Hotel / Inn'],
  [/travel\s*agency|tour|ticketing/i, 'Travel Agency'],
  [/internet\s*(cafe|shop)|i.?cafe/i, 'Internet Café'],
  [/printing|photocopy|print\s*shop/i, 'Printing Shop'],
  [/software|app\s*dev|web\s*dev|IT\s*services/i, 'IT / Software Services'],
  [/bpo|call\s*center|outsourc/i, 'BPO / Call Center'],
  [/trucking|cargo|freight|courier/i, 'Trucking / Cargo'],
  [/car\s*wash|auto\s*detail/i, 'Car Wash'],
  [/auto\s*repair|vulcanizing|mechanic|car\s*service/i, 'Auto Repair Shop'],
  [/gas\s*station|petron|shell\s*station|fuel/i, 'Gas Station'],
  [/parking/i, 'Parking'],
  [/construction|contractor|builder/i, 'Construction'],
  [/real\s*estate|property|rental|leasing/i, 'Real Estate'],
  [/security\s*agency|guard/i, 'Security Agency'],
  [/cleaning\s*services|janitorial/i, 'Cleaning Services'],
  [/events?\s*(place|hall|venue)|catering\s*hall/i, 'Events Place'],
  [/funeral|memorial/i, 'Funeral Services'],
];

function toGenericChipLabel(raw) {
  const str = (raw || '').toString().trim();
  if (!str) return str;
  for (const [pattern, generic] of GENERIC_CHIP_MAP) {
    if (pattern.test(str)) return generic;
  }
  return formatBizName(str);
}

function dedupeChipsByGenericLabel(chips) {
  const seen = new Set();
  return chips.filter(chip => {
    const generic = toGenericChipLabel(chip.label);
    if (seen.has(generic)) return false;
    seen.add(generic);
    return true;
  });
}

function escapeHtml(str) {
  return (str || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plotLocations(recs) {
  clearBusinessMarkers();
  const bounds = L.latLngBounds();
  recs.forEach((rec) => {
    if (!rec.lat || !rec.lon) return;
    const lat = Number(rec.lat);
    const lon = Number(rec.lon);
    const brgy = rec.barangay_name || '';
    const marker = L.marker([lat, lon]).addTo(map)
      .bindPopup(`<b>${escapeHtml(brgy)}</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}<br><span style="color:#2e7d32;">🎯 Suitability: ${Math.round((rec.suitability_score || 0) * 100)}%</span>`);
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
        business_type, barangay: barangay || null, suitability_score: null,
        lat: lat ? parseFloat(lat) : null, lon: lon ? parseFloat(lon) : null
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Error saving recommendation:', err);
    return { success: false, message: err.message };
  }
}

async function deleteSavedRecommendationFromDB(dbId) {
  try {
    const res = await fetch(`/api/saved-recommendations/${dbId}`, { method: 'DELETE' });
    return await res.json();
  } catch (err) {
    console.error('Error deleting recommendation:', err);
    return { success: false };
  }
}

function markSavedInCurrentList() {
  document.querySelectorAll('#rec-list .save-row').forEach(row => {
    const name = row.dataset.name;
    const barangay = row.dataset.barangay || currentBarangayName || '';
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
      if (savedLoc && savedLoc.dbId) await deleteSavedRecommendationFromDB(savedLoc.dbId);
      row.classList.remove('saved');
      if (label) label.textContent = 'Save';
      locSavedItems.delete(saveKey);
      await fetchSavedRecommendations();
      await reportLogSaved({ action: 'removed', business_type: bizName, barangay, lat: currentClickLat, lon: currentClickLng });
    };
    document.getElementById('unsave-modal')?.classList.add('open');
    return;
  }

  const lat = currentClickLat || null;
  const lon = currentClickLng || null;
  const result = await saveRecommendationToDB(bizName, barangay, lat, lon);
  if (result.success || result.message === 'Already saved') {
    row.classList.add('saved');
    if (label) label.textContent = 'Saved';
    locSavedItems.add(saveKey);
    await fetchSavedRecommendations();
    await reportLogSaved({ action: 'saved', business_type: bizName, barangay, lat, lon });
  }
}

// ─── RENDER IDEA LIST (multi-barangay aware) ──────────────────────────────────
function renderIdeaList({ names, barangays, prefs, allowPins }) {
  // Keep backward-compat: accept old single `barangay` string too
  if (typeof barangays === 'string') barangays = barangays ? [barangays] : null;

  const listEl = document.getElementById('rec-list');
  if (!listEl) return;

  if (!names || !names.length) {
    listEl.innerHTML = '<div class="rec-item" style="color:#888;font-size:13px;">No recommendations found.</div>';
    return;
  }

  // For save-row display use the first barangay label (or empty)
  const primaryBarangay = barangays && barangays.length ? barangays[0] : '';

  listEl.innerHTML = names.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}" style="cursor:pointer;">
      <span class="rec-item-num">${i + 1}.</span>
      <span class="rec-item-name">${escapeHtml(formatBizName(name))}</span>
      <div class="save-row" data-name="${escapeHtml(name)}" data-barangay="${escapeHtml(primaryBarangay)}">
        <img src="/dashboard/save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');

  attachSaveRowListeners();

  listEl.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.save-row')) return;
      if (!allowPins) return;

      const idea = el.dataset.idea;
      const idx = parseInt(el.dataset.idx);

      if (activeIdeaIdx === idx) {
        activeIdeaIdx = -1;
        activeIdeaName = null;
        activeIdeaBarangay = null;
        activeIdeaPrefs = [];
        clearBusinessMarkers();
        listEl.querySelectorAll('.rec-item').forEach(r => r.classList.remove('active'));
        return;
      }

      activeIdeaIdx = idx;
      activeIdeaName = idea;
      activeIdeaBarangay = barangays || null;
      activeIdeaPrefs = prefs || [];

      listEl.querySelectorAll('.rec-item').forEach(r => r.classList.remove('active'));
      el.classList.add('active');

      await reportLogRecommendation({
        idea,
        area: barangays ? barangays.join(', ') : (currentBarangayName || currentLocShortName),
        pinCount: getFilteredPinCount(),
        lat: currentClickLat,
        lon: currentClickLng
      });

      loadAreaDemographics(primaryBarangay || currentBarangayName, idea);

      const top = getFilteredPinCount();

      const barangayList = barangays && barangays.length ? barangays : [null];
      const allRecs = (await Promise.all(
        barangayList.map(b => fetchIdeaLocations({
          idea: idea.trim(),
          barangay: b,
          top,
          prefs,
          _t: Date.now()
        }))
      )).flat();

      clearBusinessMarkers();
      plotLocations(allRecs);
    });
  });

  markSavedInCurrentList();

  // ── Auto-select first idea so the pin slider works immediately ──
  if (allowPins && activeIdeaIdx === -1) {
    const firstItem = listEl.querySelector('.rec-item');
    if (firstItem) {
      // Use setTimeout to let the click listeners above fully attach first
      setTimeout(() => firstItem.click(), 0);
    }
  }
} // ← end of renderIdeaList

// ─── RESOLVE CHIP IDEAS ───────────────────────────────────────────────────────
async function resolveChipIdeas({ selectedChips, barangays, type, prefs }) {
  const barangayList = barangays && barangays.length ? barangays : [null];

  if (selectedChips.length === 0 && !type) {
    const ideas = await fetchIdeas({ barangay: barangayList[0], prefs });
    return ideas.slice(0, 3);
  }

  if (selectedChips.length === 0 && type) {
    const ideas = await fetchIdeas({ barangay: barangayList[0], type, prefs });
    if (ideas.length >= 3) return ideas.slice(0, 3);
    const general = await fetchIdeas({ barangay: barangayList[0], prefs });
    const extra = general.filter(n => !ideas.includes(n));
    return [...ideas, ...extra].slice(0, 3);
  }

  // Score each chip across all selected barangays
  const chipLabels = selectedChips.map(c => c.label);
  const scored = [];
  for (const label of chipLabels) {
    let totalScore = 0;
    let totalRecs = 0;
    for (const b of barangayList) {
      const recs = await fetchIdeaLocations({
        idea: label.trim(),
        barangay: b,
        top: 3,
        prefs,
        _t: Date.now()
      });
      if (recs.length > 0) {
        totalScore += recs.reduce((sum, loc) => sum + (loc.suitability_score || 0), 0);
        totalRecs += recs.length;
      }
    }
    scored.push({ label, score: totalRecs > 0 ? totalScore / totalRecs : 0 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(item => item.label);
}

const barangayMap = {
  'b-bagong-ilog': 'Bagong Ilog', 'b-bagong-katipunan': 'Bagong Katipunan', 'b-bambang': 'Bambang', 'b-buting': 'Buting',
  'b-caniogan': 'Caniogan', 'b-dela-paz': 'Dela Paz', 'b-kalawaan': 'Kalawaan', 'b-kapasigan': 'Kapasigan', 'b-kapitolyo': 'Kapitolyo',
  'b-malinao': 'Malinao', 'b-manggahan': 'Manggahan', 'b-maybunga': 'Maybunga', 'b-oranbo': 'Oranbo', 'b-palatiw': 'Palatiw',
  'b-pinagbuhatan': 'Pinagbuhatan', 'b-pineda': 'Pineda', 'b-rosario': 'Rosario', 'b-sagad': 'Sagad', 'b-san-antonio': 'San Antonio',
  'b-san-joaquin': 'San Joaquin', 'b-san-jose': 'San Jose', 'b-san-miguel': 'San Miguel', 'b-san-nicolas': 'San Nicolas',
  'b-santa-lucia': 'Santa Lucia', 'b-santa-rosa': 'Santa Rosa', 'b-santolan': 'Santolan', 'b-sumilang': 'Sumilang', 'b-ugong': 'Ugong',
  'b-vargas': 'F. Vargas', 'b-wack-wack': 'Wack-Wack'
};

const typeMap = {
  'f-food': 'FOOD', 'f-retail': 'RETAIL', 'f-personal': 'PERSONAL', 'f-tech': 'TECH', 'f-wholesale': 'WHOLESALE',
  'f-manufacturing': 'MANUFACTURING', 'f-it': 'IT', 'f-bpo': 'BPO', 'f-construction': 'CONSTRUCTION', 'f-finance': 'FINANCE',
  'f-education': 'EDUCATION', 'f-healthcare': 'HEALTHCARE', 'f-energy': 'ENERGY', 'f-logistics': 'LOGISTICS',
  'f-hospitality': 'HOSPITALITY', 'f-security': 'SECURITY', 'f-legal': 'LEGAL', 'f-marketing': 'MARKETING',
  'f-admin': 'ADMIN', 'f-general': 'GENERAL'
};

async function applyFiltersAndShowRecommendations() {
  filterPanel.classList.remove('open');
  allowIdeaPins = true;
  isFilterMode = true;

  activeIdeaIdx = -1;
  activeIdeaName = null;
  activeIdeaBarangay = null;
  activeIdeaPrefs = [];
  lastFilteredIdea = null;

  setPinDefault();
  showPinRange();
  clearBusinessMarkers();

  const barangayCheckboxes = document.querySelectorAll('[id^="b-"]:checked');
  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');

  const selectedBarangays = [...barangayCheckboxes].map(cb => barangayMap[cb.id]).filter(Boolean);
  const selectedTypes = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);

  const barangays = selectedBarangays.length ? selectedBarangays : null;
  const prefs = getPrefs();

  const selectedChipEls = document.querySelectorAll('.filter-chip.selected');
  const selectedChips = [...selectedChipEls].map(el => ({
    label: el.dataset.chip || el.textContent.trim(),
    category: el.dataset.category || ''
  }));

  const type = selectedChips.length === 0 ? (selectedTypes[0] || null) : null;

  if (!barangays && !type && !prefs.length && selectedChips.length === 0) return;

  if (barangays) loadAreaDemographics(barangays[0]);

  const titleEl = document.getElementById('loc-panel-title');
  const badgeEl = document.getElementById('loc-badge');
  const areaLabel = barangays
    ? (barangays.length === 1 ? barangays[0] : `${barangays.length} Barangays`)
    : 'All Barangays';

  if (titleEl) titleEl.textContent = `Top Businesses in ${areaLabel}`;
  if (badgeEl) badgeEl.textContent = `📍 ${areaLabel}`;

  locPanel.classList.add('open');

  const listEl = document.getElementById('rec-list');
  if (listEl) listEl.innerHTML = '<div class="rec-item" style="color:#888;font-size:13px;">Loading recommendations…</div>';

  lastFilteredBarangay = barangays;
  lastFilteredPrefs = prefs;

  const ideaNames = await resolveChipIdeas({ selectedChips, barangays, type, prefs });

  renderIdeaList({ names: ideaNames, barangays, prefs, allowPins: true });
}

document.getElementById('done-btn')?.addEventListener('click', async () => {
  await applyFiltersAndShowRecommendations();
});

function showPasigToast(msg) {
  const el = document.getElementById('pasig-toast');
  if (!el) return;
  el.textContent = msg || 'Location not found in Pasig.';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

async function handleLocationSelect(lat, lon, source = 'map') {
  hidePinRange();
  isFilterMode = false;
  lastFilteredIdea = null;
  lastFilteredBarangay = null;
  lastFilteredPrefs = null;
  activeIdeaIdx = -1;
  activeIdeaName = null;
  activeIdeaBarangay = null;
  activeIdeaPrefs = [];

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

  clickedMarker = L.marker([latN, lonN], { draggable: true }).addTo(map)
    .bindPopup(`Selected location<br>${currentClickLat}, ${currentClickLng}`).openPopup();

  clickedMarker.on('popupclose', () => clearClickedMarker());
  clickedMarker.on('drag', (ev) => {
    const p = ev.target.getLatLng();
    ev.target.setPopupContent(`Selected location<br>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
  });
  clickedMarker.on('dragend', async (ev) => {
    const p = ev.target.getLatLng();
    await handleLocationSelect(p.lat, p.lng, 'drag');
  });

  const svDiv = document.getElementById('street-view');
  if (svDiv) {
    const latQ = encodeURIComponent(currentClickLat);
    const lonQ = encodeURIComponent(currentClickLng);
    svDiv.style.display = 'block';
    svDiv.innerHTML = `
      <div style="padding:10px;font-size:13px;color:#1a3a5c;">
        <div style="font-weight:700;margin-bottom:8px;">Street View</div>
        <iframe title="Mapillary" loading="lazy" referrerpolicy="no-referrer"
          src="https://www.mapillary.com/embed?map_style=Mapillary%20light&lat=${latQ}&lng=${lonQ}&z=17"
          style="width:100%;height:100%;min-height:240px;border:none;border-radius:12px;background:#fff;"></iframe>
        <div style="margin-top:8px;">If Mapillary fails to load, open:
          <a href="https://www.google.com/maps?q=${latQ},${lonQ}" target="_blank" rel="noreferrer">Google Maps</a>
        </div>
      </div>`;
  }

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
  } catch {
    if (badge) badge.textContent = `📍 ${currentClickLat}, ${currentClickLng}`;
  }

  if (source !== 'search') {
    await reportLogSearchOrPin({
      source, locationName: currentLocShortName, lat: currentClickLat, lon: currentClickLng
    });
  }

  const typeCheckboxes = document.querySelectorAll('[id^="f-"]:checked');
  const selectedTypes = [...typeCheckboxes].map(cb => typeMap[cb.id]).filter(Boolean);
  const industryCheckboxId = userIndustry ? INDUSTRY_FILTER_MAP[userIndustry.toLowerCase().trim()] : null;
  const industryDerivedType = industryCheckboxId ? typeMap[industryCheckboxId] : null;
  const type = selectedTypes[0] || industryDerivedType || null;
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

  const top3 = ideasData.data.slice(0, 3);

  listEl.innerHTML = top3.map((name, i) => `
    <div class="rec-item" data-idx="${i}" data-idea="${escapeHtml(name)}" style="cursor:pointer;">
      <span class="rec-item-num">${i + 1}.</span>
      <span class="rec-item-name">${escapeHtml(formatBizName(name))}</span>
      <div class="save-row" data-name="${escapeHtml(name)}" data-barangay="${escapeHtml(currentBarangayName)}">
        <img src="/dashboard/save.png" alt="bookmark"><span>Save</span>
      </div>
    </div>
  `).join('');

  attachSaveRowListeners();

  listEl.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.save-row')) return;
      if (!allowIdeaPins) allowIdeaPins = true;

      const idea = el.dataset.idea;
      const idx = parseInt(el.dataset.idx);

      if (activeIdeaIdx === idx) {
        activeIdeaIdx = -1;
        activeIdeaName = null;
        clearBusinessMarkers();
        listEl.querySelectorAll('.rec-item').forEach(r => r.classList.remove('active'));
        return;
      }

      activeIdeaIdx = idx;
      activeIdeaName = idea;

      listEl.querySelectorAll('.rec-item').forEach(r => r.classList.remove('active'));
      el.classList.add('active');

      await reportLogRecommendation({
        idea, area: currentBarangayName || currentLocShortName,
        pinCount: 5, lat: currentClickLat, lon: currentClickLng
      });

      loadAreaDemographics(currentBarangayName, idea);
      hidePinRange();

      const recs = await fetchIdeaLocations({
        idea: idea.trim(),
        barangay: currentBarangayName,
        top: 5,
        prefs,
        _t: Date.now()
      });
      clearBusinessMarkers();
      plotLocations(recs);
    });
  });

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
  await handleLocationSelect(lat, lon, 'map_click');
});

async function doSearch(query) {
  try {
    hidePinRange();
    isFilterMode = false;
    lastFilteredIdea = null;
    lastFilteredBarangay = null;
    lastFilteredPrefs = null;

    const viewbox = `${PASIG_BOUNDS.minLon},${PASIG_BOUNDS.maxLat},${PASIG_BOUNDS.maxLon},${PASIG_BOUNDS.minLat}`;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&bounded=1&viewbox=${viewbox}`);
    const data = await res.json();
    if (!data.length) { showPasigToast('Location not found in Pasig.'); return; }

    const latNum = Number(data[0].lat);
    const lonNum = Number(data[0].lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !isInPasig(latNum, lonNum)) {
      showPasigToast('Location not found in Pasig.');
      return;
    }

    await reportLogSearchOrPin({ source: 'search', locationName: query, lat: latNum.toFixed(6), lon: lonNum.toFixed(6) });
    map.setView([latNum, lonNum], 16);
    await handleLocationSelect(latNum, lonNum, 'search');
  } catch (err) {
    console.error(err);
    showPasigToast('Something went wrong.');
  }
}

function renderHistory() {
  const container = document.getElementById('search-history');
  if (!container) return;
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
  clickedMarker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`${escapeHtml(loc.locationName)}<br>${loc.lat}, ${loc.lon}`).openPopup();
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
  if (unsavePendingCallback) { await unsavePendingCallback(); unsavePendingCallback = null; }
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
  if (profilePopup && profileBtn && !profilePopup.contains(e.target) && e.target !== profileBtn)
    profilePopup.classList.remove('open');
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
        if (businessLine) demoHTML += `<li><strong>Same Line of Business Count:</strong> ${sameLineCount.toLocaleString()}</li>`;
      } else {
        demoHTML += '<li>No demographic data available for this area.</li>';
      }
      demoHTML += '</ul>';
      demoBody.innerHTML = demoHTML;
    }

    const summaryBody = document.getElementById('summary-body');
    if (summaryBody) {
      let summary = '';
      if (!demo) {
        summary = `<p>No demographic data available for <strong>${escapeHtml(barangay)}</strong>.</p>`;
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
        const genderLabel = demo.gender_distribution
          ? `a predominantly ${demo.gender_distribution.toLowerCase()} population`
          : 'a balanced gender distribution';
        const businessCountText = businessLine
          ? `, <strong>${sameLineCount.toLocaleString()}</strong> of which are in the same line of business`
          : '';
        summary = `<p>
          <strong>${escapeHtml(demo.barangay_name || barangay)}</strong> is a ${densityLabel} barangay in Pasig
          with a total population of <strong>${demo.population ? demo.population.toLocaleString() : 'N/A'}</strong>
          and a population density of <strong>${demo.population_density ? demo.population_density.toLocaleString() : 'N/A'} per km²</strong>.
          The dominant age group is <strong>${ageLabel}</strong>, and the area has ${genderLabel}.
          Households in this barangay have an average income range of
          <strong>${demo.avg_income_min ? '₱' + demo.avg_income_min.toLocaleString() : 'N/A'} – ${demo.avg_income_max ? '₱' + demo.avg_income_max.toLocaleString() : 'N/A'}</strong>,
          making it an area ${incomeLabel}.
          There are <strong>${totalBiz.toLocaleString()}</strong> registered businesses operating in the area${businessCountText}.
          This barangay is well-suited for businesses targeting the <strong>${ageLabel}</strong> age group.
        </p>`;
      }
      summaryBody.innerHTML = summary;
    }
  } catch (err) {
    console.error('Error loading area demographics:', err);
  }
}

function toggleCollapse(key) {
  const body = document.getElementById(key + '-body');
  const arrow = document.getElementById(key + '-arrow');
  if (!body || !arrow) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('rotated', !isOpen);
}

function parseJumpTarget() {
  try {
    const raw = localStorage.getItem('mapJumpTarget');
    if (!raw) return null;
    const j = JSON.parse(raw);
    const lat = Number(j?.lat);
    const lon = Number(j?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, source: j?.source || 'report_jump' };
  } catch { return null; }
}

// ============================================================================
// SMART FILTER PERSONALIZATION SYSTEM
// ============================================================================

const INDUSTRY_CHIP_MAP = {
  'food and beverages': {
    suggested: ['Restaurant', 'Coffee Shop', 'Bakery', 'Fast Food', 'Catering', 'Eatery'],
    full: ['Grocery', 'Sari-Sari Store', 'Panciteria', 'Canteen', 'Water Refilling Station', 'Food Cart', 'Milk Tea Shop']
  },
  'food & beverages': {
    suggested: ['Restaurant', 'Coffee Shop', 'Bakery', 'Fast Food', 'Catering', 'Eatery'],
    full: ['Grocery', 'Sari-Sari Store', 'Panciteria', 'Canteen', 'Water Refilling Station', 'Food Cart', 'Milk Tea Shop']
  },
  'retail': {
    suggested: ['Sari-Sari Store', 'Grocery', 'Cellphone Store', 'Hardware Store', 'Appliance Store'],
    full: ['Clothing Store', 'Bookstore', 'Toy Store', 'Pharmacy', 'Drug Store', 'Optical Shop', 'Pet Shop', 'Trading']
  },
  'retail & trading': {
    suggested: ['Sari-Sari Store', 'Grocery', 'Cellphone Store', 'Hardware Store', 'Appliance Store'],
    full: ['Clothing Store', 'Bookstore', 'Toy Store', 'Pharmacy', 'Drug Store', 'Optical Shop', 'Trading']
  },
  'personal care and services': {
    suggested: ['Salon', 'Barbershop', 'Spa', 'Laundry Shop', 'Massage'],
    full: ['Nail Salon', 'Tattoo Studio', 'Car Wash', 'Tailoring', 'Repair Shop', 'Printing Services']
  },
  'beauty & wellness': {
    suggested: ['Salon', 'Spa', 'Massage', 'Barbershop', 'Nail Salon'],
    full: ['Gym', 'Yoga Studio', 'Skincare Clinic', 'Tattoo Studio', 'Laundry Shop']
  },
  'technology digital service': {
    suggested: ['Internet Café', 'Tech Repair', 'Software Company', 'IT Services'],
    full: ['Printing Services', 'Photography', 'Digital Printing', 'E-commerce', 'Gadget Store']
  },
  'it & software': {
    suggested: ['Software Company', 'IT Services', 'Tech Repair', 'Internet Café'],
    full: ['Web Development', 'App Development', 'Digital Printing', 'Gadget Store']
  },
  'healthcare': {
    suggested: ['Medical Clinic', 'Dental Clinic', 'Pharmacy', 'Laboratory'],
    full: ['Hospital', 'Optical Shop', 'Physical Therapy', 'Veterinary Clinic', 'Drug Store']
  },
  'logistics & transport': {
    suggested: ['Trucking', 'Courier Service', 'Warehouse', 'Cargo'],
    full: ['Car Rental', 'Motorcycle Delivery', 'Freight Forwarding', 'Cold Storage']
  },
  'hospitality': {
    suggested: ['Hotel', 'Pension House', 'Catering', 'Event Venue'],
    full: ['Motel', 'Bed & Breakfast', 'Restaurant', 'Travel Agency']
  },
  'education': {
    suggested: ['Tutorial Center', 'Training Center', 'School', 'Review Center'],
    full: ['Daycare', 'Music School', 'Driving School', 'Language Center', 'Library']
  },
  'finance & banking': {
    suggested: ['Lending', 'Pawnshop', 'Remittance', 'Insurance'],
    full: ['Bank', 'Cooperative', 'Foreign Exchange', 'Microfinance', 'Stockbroker']
  },
  'wholesale & import': {
    suggested: ['Wholesaler', 'Trading', 'Distributor', 'Warehouse'],
    full: ['Importer', 'Export', 'Cold Storage', 'Cooperative']
  },
  'construction': {
    suggested: ['Hardware Store', 'Construction', 'Contractor', 'Supplies'],
    full: ['Real Estate', 'Architecture', 'Interior Design', 'Landscaping']
  },
  'bpo & call center': {
    suggested: ['BPO', 'Call Center', 'Outsourcing'],
    full: ['Data Entry', 'Customer Service', 'IT Support', 'Back Office']
  },
  'energy & fuel': {
    suggested: ['Gas Station', 'LPG Dealer', 'Solar Energy'],
    full: ['Water Station', 'Electric Supply', 'Generator Rental']
  },
  'security services': {
    suggested: ['Security Agency', 'CCTV Installation', 'Alarm Systems'],
    full: ['Janitorial Services', 'Manpower Agency', 'Investigations']
  },
  'legal & consulting': {
    suggested: ['Law Firm', 'Consultancy', 'Accounting'],
    full: ['Notary', 'HR Consulting', 'Tax Services', 'Business Registration']
  },
  'marketing & advertising': {
    suggested: ['Advertising Agency', 'Printing Services', 'Events'],
    full: ['Digital Marketing', 'PR Agency', 'Photography', 'Videography', 'Signage']
  },
  'manufacturing': {
    suggested: ['Manufacturing', 'Production', 'Fabrication'],
    full: ['Food Processing', 'Garments', 'Furniture', 'Metal Works', 'Plastics']
  }
};

const GLOBAL_KEYWORD_MAP = {
  'pizza': 'Pizza Restaurant', 'burger': 'Burger Joint', 'ramen': 'Ramen Shop',
  'sushi': 'Sushi Restaurant', 'bbq': 'BBQ Restaurant', 'barbecue': 'BBQ Restaurant',
  'cafe': 'Coffee Shop', 'coffee': 'Coffee Shop', 'milk tea': 'Milk Tea Shop',
  'boba': 'Milk Tea Shop', 'bakery': 'Bakery', 'bakeshop': 'Bakeshop',
  'pastry': 'Pastry Shop', 'cake': 'Cake Shop', 'lechon': 'Lechon Restaurant',
  'seafood': 'Seafood Restaurant', 'buffet': 'Buffet Restaurant', 'catering': 'Catering',
  'food cart': 'Food Cart', 'lugawan': 'Lugawan', 'mami': 'Mami House',
  'halo-halo': 'Halo-Halo Shop', 'ice cream': 'Ice Cream Shop', 'juice': 'Juice Bar',
  'smoothie': 'Smoothie Bar', 'health food': 'Health Food Restaurant', 'vegan': 'Vegan Restaurant',
  'canteen': 'Canteen', 'eatery': 'Eatery', 'turo-turo': 'Turo-Turo',
  'ihawan': 'Ihawan', 'grill': 'Grill Restaurant', 'pares': 'Pares House',
  'tapsi': 'Tapsilugan', 'silog': 'Silog Restaurant',
  'sari-sari': 'Sari-Sari Store', 'sarisari': 'Sari-Sari Store', 'grocery': 'Grocery',
  'minimart': 'Mini Mart', 'mini mart': 'Mini Mart', 'convenience': 'Convenience Store',
  'hardware': 'Hardware Store', 'cellphone': 'Cellphone Store', 'gadget': 'Gadget Store',
  'clothing': 'Clothing Store', 'ukay': 'Ukay-Ukay', 'thrift': 'Thrift Store',
  'pharmacy': 'Pharmacy', 'drugstore': 'Drug Store', 'drug store': 'Drug Store',
  'optical': 'Optical Shop', 'bookstore': 'Bookstore', 'toy': 'Toy Store',
  'pet shop': 'Pet Shop', 'fish': 'Fish Shop', 'meat': 'Meat Shop',
  'vegetables': 'Vegetable Stall', 'palengke': 'Market Stall',
  'salon': 'Salon', 'barbershop': 'Barbershop', 'barber': 'Barbershop',
  'spa': 'Spa', 'massage': 'Massage', 'laundry': 'Laundry Shop',
  'nail': 'Nail Salon', 'tattoo': 'Tattoo Studio', 'gym': 'Gym',
  'yoga': 'Yoga Studio', 'car wash': 'Car Wash', 'tailoring': 'Tailoring Shop',
  'clinic': 'Medical Clinic', 'dental': 'Dental Clinic', 'dentist': 'Dental Clinic',
  'laboratory': 'Laboratory', 'vet': 'Veterinary Clinic', 'veterinary': 'Veterinary Clinic',
  'internet': 'Internet Café', 'internet cafe': 'Internet Café',
  'printing': 'Printing Services', 'photography': 'Photography Studio',
  'pawnshop': 'Pawnshop', 'lending': 'Lending', 'remittance': 'Money Remittance',
  'insurance': 'Insurance', 'tutorial': 'Tutorial Center', 'review': 'Review Center',
  'school': 'School', 'training': 'Training Center', 'driving': 'Driving School',
  'trucking': 'Trucking', 'courier': 'Courier Service', 'delivery': 'Delivery Service',
  'warehouse': 'Warehouse', 'hotel': 'Hotel', 'pension': 'Pension House',
  'event': 'Event Venue', 'water refilling': 'Water Refilling Station',
  'water': 'Water Refilling Station', 'gasoline': 'Gas Station',
  'gas station': 'Gas Station', 'lpg': 'LPG Dealer', 'security': 'Security Agency',
  'manpower': 'Manpower Agency', 'real estate': 'Real Estate',
  'travel': 'Travel Agency', 'funeral': 'Funeral Services', 'cooperative': 'Cooperative'
};

const activeCustomChips = new Set();

function normalizeIndustryKey(industry) {
  return (industry || '').toLowerCase().trim();
}

function getIndustryChips(industry) {
  const key = normalizeIndustryKey(industry);
  return INDUSTRY_CHIP_MAP[key] || { suggested: [], full: [] };
}

function getCrossIndustryMatches(subcategoryText) {
  if (!subcategoryText) return [];
  const lower = subcategoryText.toLowerCase();
  const matches = [];
  for (const [keyword, chipLabel] of Object.entries(GLOBAL_KEYWORD_MAP)) {
    if (lower.includes(keyword) && !matches.includes(chipLabel)) {
      matches.push(chipLabel);
    }
  }
  return matches;
}

function chipMatchesSubcategory(chipLabel, subcategoryText) {
  if (!subcategoryText || !chipLabel) return false;
  const subcatWords = subcategoryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const labelLower = chipLabel.toLowerCase();
  return subcatWords.some(word => labelLower.includes(word));
}

function buildFilterChips(industry, subcategory) {
  const chipSection = document.getElementById('smart-chip-section');
  const chipContainer = document.getElementById('chip-container');
  const crossNote = document.getElementById('cross-industry-note');

  if (!chipContainer) return;

  const industryChips = getIndustryChips(industry);
  const crossMatches = getCrossIndustryMatches(subcategory);

  if (!crossMatches.length && !industryChips.suggested.length && !industryChips.full.length) {
    if (chipSection) chipSection.style.display = 'none';
    if (crossNote) crossNote.style.display = 'none';
    return;
  }

  const boostedChips = industryChips.suggested.filter(chip => chipMatchesSubcategory(chip, subcategory));
  const regularChips = industryChips.suggested.filter(chip => !chipMatchesSubcategory(chip, subcategory));

  const allIndustryLabels = [
    ...industryChips.suggested.map(c => c.toLowerCase()),
    ...industryChips.full.map(c => c.toLowerCase())
  ];
  const trulyCrossIndustry = crossMatches.filter(chip => !allIndustryLabels.includes(chip.toLowerCase()));

  if (crossNote) {
    if (trulyCrossIndustry.length && subcategory) {
      crossNote.style.display = 'block';
      crossNote.textContent = `"${subcategory}" matched outside your industry — showing relevant suggestions too.`;
    } else {
      crossNote.style.display = 'none';
    }
  }

  let html = '';

  if (trulyCrossIndustry.length) {
    html += `<div class="chip-group-label">Matched to your business</div><div class="chip-row">`;
    trulyCrossIndustry.forEach(label => {
      html += `<span class="filter-chip filter-chip--cross" data-chip="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    });
    html += `</div>`;
  }

  if (boostedChips.length) {
    html += `<div class="chip-group-label">Top matches for your industry</div><div class="chip-row">`;
    boostedChips.forEach(label => {
      html += `<span class="filter-chip filter-chip--boosted" data-chip="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    });
    html += `</div>`;
  }

  if (regularChips.length) {
    const groupLabel = (boostedChips.length || trulyCrossIndustry.length) ? 'Other suggestions' : 'Suggested for your industry';
    html += `<div class="chip-group-label">${groupLabel}</div><div class="chip-row">`;
    regularChips.forEach(label => {
      html += `<span class="filter-chip" data-chip="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    });
    html += `</div>`;
  }

  if (industryChips.full.length) {
    html += `<div class="chip-divider">more</div><div class="chip-row">`;
    industryChips.full.forEach(label => {
      html += `<span class="filter-chip" data-chip="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    });
    html += `</div>`;
  }

  chipContainer.innerHTML = html;
  if (chipSection) chipSection.style.display = 'block';

  chipContainer.querySelectorAll('.filter-chip').forEach(chip => {
    const chipValue = chip.dataset.chip || '';

    if (activeCustomChips.has(chipValue)) {
      chip.classList.add('selected');
    }

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) {
        activeCustomChips.add(chipValue);
      } else {
        activeCustomChips.delete(chipValue);
      }
      updateChipSelectionCounter();
      if (activeCustomChips.size === 0) {
        clearBusinessMarkers();
        hidePinRange();
      }
    });
  });

  updateChipSelectionCounter();
}

function updateChipSelectionCounter() {
  const count = activeCustomChips.size;
  const counterEl = document.getElementById('chip-selection-count');
  if (counterEl) {
    counterEl.textContent = count > 0 ? `${count} selected` : '';
    counterEl.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

function clearChipSelections() {
  document.querySelectorAll('.filter-chip.selected').forEach(c => c.classList.remove('selected'));
  activeCustomChips.clear();
  updateChipSelectionCounter();
  clearBusinessMarkers();
  hidePinRange();
}

function renderPersonalizationBanner(industry, subcategory) {
  const banner = document.getElementById('personalization-banner');
  const bannerTags = document.getElementById('banner-tags');
  if (!banner || !bannerTags) return;
  if (!industry && !subcategory) { banner.style.display = 'none'; return; }

  let tagsHTML = '';
  if (subcategory) tagsHTML += `<span class="profile-tag profile-tag--subcat">${escapeHtml(subcategory)}</span>`;
  if (industry) tagsHTML += `<span class="profile-tag profile-tag--industry">${escapeHtml(industry)}</span>`;
  bannerTags.innerHTML = tagsHTML;
  banner.style.display = 'block';
}

function showFilterRebuildToast() {
  const toast = document.getElementById('filter-rebuild-toast');
  if (!toast) return;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function onProfileSaved(industry, industrySpecific) {
  userIndustry = industry;
  userIndustrySpecific = industrySpecific;

  document.querySelectorAll('.filter-panel-body input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  clearChipSelections();

  if (industry) {
    const key = (industry || '').toLowerCase().trim();
    const matchedId = INDUSTRY_FILTER_MAP[key];
    if (matchedId) {
      const cb = document.getElementById(matchedId);
      if (cb) cb.checked = true;
    }
  }

  renderPersonalizationBanner(industry, industrySpecific);
  buildFilterChips(industry, industrySpecific);
  showFilterRebuildToast();
}

window.addEventListener('storage', (e) => {
  if (e.key === 'spotProfileUpdated' && e.newValue) {
    try {
      const updated = JSON.parse(e.newValue);
      onProfileSaved(updated.industry || '', updated.industry_specific || '');
    } catch { }
  }
});

(function patchFetchForProfileSave() {
  const _orig = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (init?.method || 'GET').toUpperCase();
    const response = await _orig(input, init);
    if (method === 'PUT' && url.includes('/api/user-profile')) {
      try {
        const data = await response.clone().json();
        if (data.success && data.user) {
          onProfileSaved(data.user.industry || '', data.user.industry_specific || '');
        }
      } catch { }
    }
    return response;
  };
})();

function applyIndustryPersonalization(industry, industrySpecific) {
  if (industry) {
    const key = (industry || '').toLowerCase().trim();
    const matchedId = INDUSTRY_FILTER_MAP[key];
    if (matchedId) {
      const cb = document.getElementById(matchedId);
      if (cb) cb.checked = true;
    }
  }
  const oldTip = document.getElementById('industry-tip');
  if (oldTip) oldTip.style.display = 'none';
  renderPersonalizationBanner(industry, industrySpecific);
  buildFilterChips(industry, industrySpecific);
}

// ─── DOM CONTENT LOADED ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  fetchSavedRecommendations();

  try {
    const jump = parseJumpTarget();
    if (jump) {
      localStorage.removeItem('mapJumpTarget');
      map.setView([jump.lat, jump.lon], 16);
      await handleLocationSelect(jump.lat, jump.lon, jump.source);
    }
  } catch (e) {
    console.warn('Jump-to-map failed:', e);
  }

  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    const affiliation = (data.affiliation || '').toLowerCase().trim();
    const industry = (data.industry || '').trim();
    const industrySpecific = (data.industry_specific || '').trim();

    userIndustry = industry;
    userIndustrySpecific = industrySpecific;

    if (affiliation === 'entrepreneur') {
      document.querySelectorAll('.entrepreneur-only').forEach(el => { el.style.display = ''; });
    } else {
      document.querySelectorAll('.entrepreneur-only').forEach(el => { el.style.display = 'none'; });
    }

    applyIndustryPersonalization(industry, industrySpecific);
  } catch (err) {
    console.error('Failed to fetch user info:', err);
    document.querySelectorAll('.entrepreneur-only').forEach(el => { el.style.display = 'none'; });
  }
});
