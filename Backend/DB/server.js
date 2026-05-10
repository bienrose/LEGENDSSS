const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { legendDB, geoDB, testConnection } = require("./db_config");
const nodemailer = require("nodemailer");

const app = express();

testConnection();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const frontendPath = path.join(__dirname, "login");
const dashboardPath = path.join(__dirname, "..", "dashboard");
const adminDashboardPath = path.join(__dirname, "..", "..", "admindashboard");

const PASIG_BOUNDS = {
  minLat: 14.5350,
  maxLat: 14.6200,
  minLon: 121.0600,
  maxLon: 121.1100
};
const IDEA_PIN_MIN_GAP_METERS = 200;

// ─── BARANGAY BOUNDING BOXES ──────────────────────────────────────────────────
// FINAL CORRECTED BARANGAY_BOUNDS for server.js
const BARANGAY_BOUNDS = {
  'bagong ilog':      { minLat: 14.570, maxLat: 14.578, minLon: 121.082, maxLon: 121.089 },
  'bagong katipunan': { minLat: 14.574, maxLat: 14.584, minLon: 121.062, maxLon: 121.073 },
  'bambang':          { minLat: 14.564, maxLat: 14.585, minLon: 121.057, maxLon: 121.079 },
  'buting':           { minLat: 14.562, maxLat: 14.583, minLon: 121.066, maxLon: 121.088 },
  'caniogan':         { minLat: 14.574, maxLat: 14.582, minLon: 121.083, maxLon: 121.091 },
  'dela paz':         { minLat: 14.578, maxLat: 14.601, minLon: 121.077, maxLon: 121.101 },
  'kalawaan':         { minLat: 14.558, maxLat: 14.579, minLon: 121.067, maxLon: 121.089 },
  'kapasigan':        { minLat: 14.559, maxLat: 14.580, minLon: 121.062, maxLon: 121.084 },
  'kapitolyo':        { minLat: 14.570, maxLat: 14.595, minLon: 121.050, maxLon: 121.076 },
  'malinao':          { minLat: 14.570, maxLat: 14.591, minLon: 121.078, maxLon: 121.100 },
  'manggahan':        { minLat: 14.581, maxLat: 14.607, minLon: 121.083, maxLon: 121.111 },
  'maybunga':         { minLat: 14.566, maxLat: 14.588, minLon: 121.080, maxLon: 121.102 },
  'oranbo':           { minLat: 14.568, maxLat: 14.589, minLon: 121.067, maxLon: 121.089 },
  'palatiw':          { minLat: 14.577, maxLat: 14.586, minLon: 121.092, maxLon: 121.100 },
  'pinagbuhatan':     { minLat: 14.548, maxLat: 14.574, minLon: 121.081, maxLon: 121.108 },
  'pineda':           { minLat: 14.556, maxLat: 14.576, minLon: 121.053, maxLon: 121.076 },
  'rosario':          { minLat: 14.562, maxLat: 14.572, minLon: 121.075, maxLon: 121.085 },
  'sagad':            { minLat: 14.548, maxLat: 14.570, minLon: 121.076, maxLon: 121.098 },
  'san antonio':      { minLat: 14.578, maxLat: 14.600, minLon: 121.076, maxLon: 121.098 },
  'san joaquin':      { minLat: 14.581, maxLat: 14.591, minLon: 121.071, maxLon: 121.081 },
  'san jose':         { minLat: 14.580, maxLat: 14.589, minLon: 121.064, maxLon: 121.073 },
  'san miguel':       { minLat: 14.569, maxLat: 14.579, minLon: 121.077, maxLon: 121.085 },
  'san nicolas':      { minLat: 14.566, maxLat: 14.576, minLon: 121.080, maxLon: 121.089 },
  'santa lucia':      { minLat: 14.576, maxLat: 14.586, minLon: 121.097, maxLon: 121.105 },
  'santa rosa':       { minLat: 14.560, maxLat: 14.569, minLon: 121.086, maxLon: 121.094 },
  'santolan':         { minLat: 14.583, maxLat: 14.605, minLon: 121.065, maxLon: 121.092 },
  'sumilang':         { minLat: 14.565, maxLat: 14.580, minLon: 121.076, maxLon: 121.091 },
  'ugong':            { minLat: 14.573, maxLat: 14.588, minLon: 121.057, maxLon: 121.069 },
};
// ─── CENTROID FALLBACK MAP ────────────────────────────────────────────────────
const CENTROID_FALLBACK = {
  'bagong ilog':      { lat: 14.5731, lon: 121.0857 },
  'bagong katipunan': { lat: 14.5939, lon: 121.0832 },
  'bambang':          { lat: 14.5833, lon: 121.0669 },
  'buting':           { lat: 14.5742, lon: 121.0784 },
  'caniogan':         { lat: 14.5821, lon: 121.0924 },
  'dela paz':         { lat: 14.5696, lon: 121.0924 },
  'kalawaan':         { lat: 14.5779, lon: 121.0852 },
  'kapasigan':        { lat: 14.5762, lon: 121.0762 },
  'kapitolyo':        { lat: 14.5833, lon: 121.0631 },
  'malinao':          { lat: 14.5857, lon: 121.0901 },
  'manggahan':        { lat: 14.5850, lon: 121.0980 },
  'maybunga':         { lat: 14.5762, lon: 121.0915 },
  'oranbo':           { lat: 14.5869, lon: 121.0794 },
  'palatiw':          { lat: 14.5801, lon: 121.0969 },
  'pinagbuhatan':     { lat: 14.5672, lon: 121.0999 },
  'pineda':           { lat: 14.5743, lon: 121.0681 },
  'rosario':          { lat: 14.5720, lon: 121.0832 },
  'sagad':            { lat: 14.5682, lon: 121.0877 },
  'san antonio':      { lat: 14.5914, lon: 121.0852 },
  'san joaquin':      { lat: 14.5940, lon: 121.0776 },
  'san jose':         { lat: 14.5880, lon: 121.0731 },
  'san miguel':       { lat: 14.5810, lon: 121.0810 },
  'san nicolas':      { lat: 14.5753, lon: 121.0870 },
  'santa cruz':       { lat: 14.5615, lon: 121.0823 },
  'santa lucia':      { lat: 14.5630, lon: 121.0851 },
};

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeBarangay(v) {
  return (v || "").toString().trim().toLowerCase();
}

function barangayMatches(dbName, filterName) {
  if (!dbName || !filterName) return false;
  const a = normalizeBarangay(dbName);
  const b = normalizeBarangay(filterName);
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function getBarangayBounds(barangayName) {
  if (!barangayName) return null;
  const key = normalizeBarangay(barangayName);
  if (BARANGAY_BOUNDS[key]) return BARANGAY_BOUNDS[key];
  const match = Object.keys(BARANGAY_BOUNDS).find(k => key.startsWith(k) || k.startsWith(key));
  return match ? BARANGAY_BOUNDS[match] : null;
}

function inBarangay(lat, lon, barangayName) {
  const b = getBarangayBounds(barangayName);
  if (!b) return inPasig(lat, lon);
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

function getCentroidFallback(barangayName) {
  if (!barangayName) return null;
  const key = normalizeBarangay(barangayName);
  if (CENTROID_FALLBACK[key]) return CENTROID_FALLBACK[key];
  const matchKey = Object.keys(CENTROID_FALLBACK).find(k => key.startsWith(k) || k.startsWith(key));
  return matchKey ? CENTROID_FALLBACK[matchKey] : null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inPasig(lat, lon) {
  return lat >= PASIG_BOUNDS.minLat && lat <= PASIG_BOUNDS.maxLat &&
    lon >= PASIG_BOUNDS.minLon && lon <= PASIG_BOUNDS.maxLon;
}

function zscores(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length || 1);
  const std = Math.sqrt(variance) || 1;
  return arr.map(v => (v - mean) / std);
}

function prefWeights() {
  return {
    totalpop: 1, popdensity: 1, agedist: 1, gender: 1, income: 1,
    bizcount: -1, competitors: -1, bizdensity: 1
  };
}

function ageScore(ageGroup) {
  const good = ["15-24", "25-54", "18-35", "15–24", "25–54", "18–35"];
  return good.includes(ageGroup) ? 1 : 0;
}

async function isSubCategorySaturated(barangay, subCategory) {
  if (!subCategory || !barangay) return false;
  const stopWords = [
    'place', 'restaurant', 'owner', 'shop', 'store', 'business', 'service',
    'company', 'center', 'centre', 'hub', 'spot', 'joint', 'house', 'bar',
    'cafe', 'diner', 'grill', 'bistro', 'parlor', 'parlour', 'salon',
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'their', 'its',
    'firm', 'office', 'agency', 'studio', 'workshop', 'clinic', 'lab',
    'branch', 'outlet', 'depot', 'warehouse', 'factory', 'plant', 'mill',
    'facility', 'station', 'terminal', 'garage', 'yard', 'lot', 'site',
    'group', 'enterprise', 'venture', 'operation', 'establishment',
    'provider', 'supplier', 'dealer', 'distributor', 'trader', 'vendor',
    'retailer', 'wholesaler', 'merchant', 'franchise', 'chain',
    'consultancy', 'consulting', 'solutions', 'management', 'holdings',
    'inc', 'llc', 'ltd', 'corp', 'co', 'corporation', 'limited',
    'associates', 'partners'
  ];
  const keywords = subCategory.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
  if (keywords.length === 0) return false;

  let sql = `SELECT COUNT(*) AS cnt FROM businesses 
             WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND (`;
  const params = [`${normalizeBarangay(barangay)}%`];
  const conditions = keywords.map(() => `(LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`);
  sql += conditions.join(' OR ') + ')';
  keywords.forEach(kw => { params.push(`%${kw}%`, `%${kw}%`); });

  const [rows] = await geoDB.query(sql, params);
  const count = rows[0]?.cnt || 0;
  return count >= 2;
}

function dedupeByLatLon(rows, precision = 5) {
  const seen = new Set();
  return rows.filter(r => {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    const key = `${lat.toFixed(precision)}|${lon.toFixed(precision)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ballesterosyther1@gmail.com",
    pass: "fsvq erkw plhi qwez"
  }
});

// ─── AUTO-CALCULATE BARANGAY BOUNDS FROM ACTUAL DATA ─────────────────────────
// ─── AUTO-CALCULATE BARANGAY BOUNDS FROM ACTUAL DATA ─────────────────────────
app.get("/api/calculate-barangay-bounds", requireAdmin, async (req, res) => {
  try {
    const [barangays] = await geoDB.query(
      `SELECT DISTINCT barangay FROM businesses WHERE barangay IS NOT NULL AND barangay <> '' ORDER BY barangay`
    );
    
    const results = [];
    
    for (const b of barangays) {
      const [coords] = await geoDB.query(
        `SELECT 
           MIN(CAST(lat AS DECIMAL(10,7))) as minLat,
           MAX(CAST(lat AS DECIMAL(10,7))) as maxLat,
           MIN(CAST(lon AS DECIMAL(10,7))) as minLon,
           MAX(CAST(lon AS DECIMAL(10,7))) as maxLon,
           AVG(CAST(lat AS DECIMAL(10,7))) as avgLat,
           AVG(CAST(lon AS DECIMAL(10,7))) as avgLon,
           COUNT(*) as cnt
         FROM businesses
         WHERE barangay = ?
           AND lat IS NOT NULL AND lon IS NOT NULL
           AND lat <> 'null' AND lon <> 'null'`,
        [b.barangay]
      );
      
      if (coords[0] && coords[0].cnt > 0) {
        const minLat = Number(coords[0].minLat);
        const maxLat = Number(coords[0].maxLat);
        const minLon = Number(coords[0].minLon);
        const maxLon = Number(coords[0].maxLon);
        const avgLat = Number(coords[0].avgLat);
        const avgLon = Number(coords[0].avgLon);
        
        // Add small padding (0.002 degrees ≈ 200m)
        const padding = 0.002;
        
        results.push({
          barangay: b.barangay,
          bounds: {
            minLat: (minLat - padding).toFixed(4),
            maxLat: (maxLat + padding).toFixed(4),
            minLon: (minLon - padding).toFixed(4),
            maxLon: (maxLon + padding).toFixed(4),
          },
          center: {
            lat: avgLat.toFixed(4),
            lon: avgLon.toFixed(4)
          },
          count: coords[0].cnt
        });
      }
    }
    
    res.json({ success: true, bounds: results });
  } catch (err) {
    console.error("calculate-barangay-bounds error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/api/clean-bad-coordinates", requireAdmin, async (req, res) => {
  try {
    // Remove businesses clearly outside Pasig
    const [result] = await geoDB.query(
      `DELETE FROM businesses 
       WHERE (CAST(lat AS DECIMAL(10,7)) < 14.500 
          OR CAST(lat AS DECIMAL(10,7)) > 14.650
          OR CAST(lon AS DECIMAL(10,7)) < 121.000 
          OR CAST(lon AS DECIMAL(10,7)) > 121.150)
         AND lat IS NOT NULL AND lon IS NOT NULL`
    );
    
    res.json({ 
      success: true, 
      deletedCount: result.affectedRows,
      message: `Removed ${result.affectedRows} businesses with coordinates outside Pasig`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/check-river-businesses", requireAuth, async (req, res) => {
  try {
    // Check businesses in Santa Lucia bounds that might be in the river
    const [biz] = await geoDB.query(
      `SELECT id, barangay, business_trade_name, lat, lon
       FROM businesses
       WHERE CAST(lat AS DECIMAL(10,7)) >= 14.576 
         AND CAST(lat AS DECIMAL(10,7)) <= 14.584
         AND CAST(lon AS DECIMAL(10,7)) >= 121.098 
         AND CAST(lon AS DECIMAL(10,7)) <= 121.104
       ORDER BY RAND()
       LIMIT 20`
    );
    
    res.json({
      total: biz.length,
      businesses: biz.map(b => ({
        id: b.id,
        name: b.business_trade_name,
        lat: Number(b.lat),
        lon: Number(b.lon),
        maps: `https://www.google.com/maps?q=${b.lat},${b.lon}`
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function sendVerificationCode(email, username, code) {
  await transporter.sendMail({
    from: "ballesterosyther1@gmail.com",
    to: email,
    subject: "Email Verification Code",
    html: `<p>Hello ${username},</p><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
  });
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: "Not authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: "Not authenticated" });
  if (req.session.user.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required" });
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  if (req.session.user.role !== "admin") return res.redirect("/dashboard");
  next();
}

const debugRouteRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false
});

const pendingVerifications = new Map();
const pendingPasswordResets = new Map();

const TYPE_TO_CATEGORY = {
  FOOD: "Food & Beverage", RETAIL: "Retail & Trading", PERSONAL: "Beauty & Wellness",
  TECH: "IT & Software", WHOLESALE: "Wholesale & Import", MANUFACTURING: "Manufacturing",
  IT: "IT & Software", BPO: "BPO & Call Center", CONSTRUCTION: "Construction",
  FINANCE: "Finance & Banking", EDUCATION: "Education", HEALTHCARE: "Healthcare",
  ENERGY: "Energy & Fuel", LOGISTICS: "Logistics & Transport", HOSPITALITY: "Hospitality",
  SECURITY: "Security", LEGAL: "Legal & Consulting", MARKETING: "Marketing & Advertising",
  ADMIN: "HR & Manpower", GENERAL: "General Services"
};

const CATEGORY_ALIASES = {
  "food and beverages": "Food & Beverage", "food & beverages": "Food & Beverage",
  "food and beverage": "Food & Beverage", "food & beverage": "Food & Beverage",
  "retail": "Retail & Trading", "retail & trading": "Retail & Trading",
  "retail and trading": "Retail & Trading", "personal care and services": "Beauty & Wellness",
  "beauty & wellness": "Beauty & Wellness", "beauty and wellness": "Beauty & Wellness",
  "technology digital service": "IT & Software", "it & software": "IT & Software",
  "it and software": "IT & Software", "healthcare": "Healthcare",
  "logistics & transport": "Logistics & Transport", "logistics and transport": "Logistics & Transport",
  "hospitality": "Hospitality", "education": "Education",
  "finance & banking": "Finance & Banking", "finance and banking": "Finance & Banking",
  "wholesale & import": "Wholesale & Import", "wholesale and import": "Wholesale & Import",
  "construction": "Construction", "bpo & call center": "BPO & Call Center",
  "bpo and call center": "BPO & Call Center", "energy & fuel": "Energy & Fuel",
  "energy and fuel": "Energy & Fuel", "security services": "Security",
  "legal & consulting": "Legal & Consulting", "legal and consulting": "Legal & Consulting",
  "marketing & advertising": "Marketing & Advertising", "marketing and advertising": "Marketing & Advertising",
  "manufacturing": "Manufacturing", "hr & manpower": "HR & Manpower",
  "hr and manpower": "HR & Manpower", "general services": "General Services"
};

function normalizeCategoryInput(value) {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  return CATEGORY_ALIASES[key] || TYPE_TO_CATEGORY[raw] || raw;
}

function getBusinessProfile(businessType, category = null) {
  const type = (businessType || "").toLowerCase();
  if (category) {
    const catLower = category.toLowerCase();
    if (catLower.includes("food") || catLower.includes("restaurant")) {
      return {
        prefersHighPopulation: true, prefersMediumPopulation: false,
        prefersHighIncome: true, prefersMediumIncome: false,
        prefersHighDensity: true, targetAgeGroups: ['25-54', '18-35', 'working'],
        preferredGender: 'balanced', populationWeight: 0.25, incomeWeight: 0.30,
        densityWeight: 0.20, ageWeight: 0.15, genderWeight: 0.05
      };
    }
    if (catLower.includes("retail")) {
      return {
        prefersHighPopulation: true, prefersMediumPopulation: false,
        prefersHighIncome: false, prefersMediumIncome: true,
        prefersHighDensity: true, targetAgeGroups: ['all', 'family'],
        preferredGender: 'balanced', populationWeight: 0.35, incomeWeight: 0.15,
        densityWeight: 0.25, ageWeight: 0.10, genderWeight: 0.05
      };
    }
  }
  const profiles = {
    'restaurant': { prefersHighPopulation: true, prefersMediumPopulation: false, prefersHighIncome: true, prefersMediumIncome: false, prefersHighDensity: true, targetAgeGroups: ['25-54', '18-35', 'working'], preferredGender: 'balanced', populationWeight: 0.25, incomeWeight: 0.30, densityWeight: 0.20, ageWeight: 0.15, genderWeight: 0.05 },
    'bakery': { prefersHighPopulation: false, prefersMediumPopulation: true, prefersHighIncome: false, prefersMediumIncome: true, prefersHighDensity: false, targetAgeGroups: ['family', 'children', 'all'], preferredGender: 'balanced', populationWeight: 0.30, incomeWeight: 0.20, densityWeight: 0.15, ageWeight: 0.15, genderWeight: 0.10 },
    'eatery': { prefersHighPopulation: false, prefersMediumPopulation: true, prefersHighIncome: false, prefersMediumIncome: true, prefersHighDensity: true, targetAgeGroups: ['all', 'working', '18-35'], preferredGender: 'balanced', populationWeight: 0.25, incomeWeight: 0.20, densityWeight: 0.25, ageWeight: 0.15, genderWeight: 0.05 },
    'coffee shop': { prefersHighPopulation: false, prefersMediumPopulation: true, prefersHighIncome: true, prefersMediumIncome: false, prefersHighDensity: true, targetAgeGroups: ['18-35', 'young', 'professional'], preferredGender: 'balanced', populationWeight: 0.20, incomeWeight: 0.35, densityWeight: 0.25, ageWeight: 0.10, genderWeight: 0.05 }
  };
  for (const [key, prof] of Object.entries(profiles)) {
    if (type.includes(key)) return prof;
  }
  return {
    prefersHighPopulation: false, prefersMediumPopulation: true,
    prefersHighIncome: false, prefersMediumIncome: true,
    prefersHighDensity: false, targetAgeGroups: ['all'], preferredGender: 'balanced',
    populationWeight: 0.25, incomeWeight: 0.20, densityWeight: 0.20,
    ageWeight: 0.15, genderWeight: 0.10
  };
}

// ─── Helper: Map readable business names to database codes ────────────────────
function ideaToDbSearchTerms(idea) {
  const ideaLower = (idea || '').toLowerCase().trim();
  const mappings = {
    'restaurant': ['RES RESTAURANT', 'RES EATERY', 'RES FAST FOOD', 'ADM RESTAURANT', 'RET FOOD RETAILER'],
    'pizza': ['RES RESTAURANT', 'RES PIZZA', 'RET FOOD RETAILER'],
    'pizza restaurant': ['RES RESTAURANT', 'RES PIZZA', 'RET FOOD RETAILER'],
    'pizza shop': ['RES RESTAURANT', 'RES PIZZA', 'RET FOOD RETAILER'],
    'bakery': ['SSM BAKERY', 'RES BAKERY', 'RET BAKERY', 'SSM BAKESHOP', 'RES BAKESHOP'],
    'bakeshop': ['SSM BAKERY', 'RES BAKERY', 'RET BAKERY', 'SSM BAKESHOP', 'RES BAKESHOP'],
    'coffee shop': ['RES COFFEE SHOP', 'RES CAFE', 'RET FOOD RETAILER'],
    'cafe': ['RES CAFE', 'RES COFFEE SHOP', 'RET FOOD RETAILER'],
    'sari-sari store': ['SAR SARI-SARI STORE', 'RET RETAILER'],
    'retail': ['RET RETAILER', 'RET TRADING', 'RET FOOD RETAILER', 'RET RETAIL'],
    'retail store': ['RET RETAILER', 'RET TRADING', 'RET FOOD RETAILER', 'RET RETAIL'],
    'pharmacy': ['DRG DRUG STORE', 'RET RETAILER', 'RET DRUG STORE'],
    'drug store': ['DRG DRUG STORE', 'RET RETAILER'],
    'salon': ['SER BEAUTY PARLOR', 'SER SALON', 'SER BARBER SHOP'],
    'salon & beauty': ['SER BEAUTY PARLOR', 'SER SALON', 'SER BARBER SHOP'],
    'salon / barbershop': ['SER BEAUTY PARLOR', 'SER SALON', 'SER BARBER SHOP'],
    'barbershop': ['SER BARBER SHOP', 'SER BEAUTY PARLOR', 'SER SALON'],
    'laundry shop': ['SER LAUNDRY', 'SER SERVICES'],
    'laundry': ['SER LAUNDRY', 'SER SERVICES'],
    'spa & massage': ['SER SPA', 'SER MASSAGE', 'SER SALON'],
    'spa': ['SER SPA', 'SER MASSAGE', 'SER SALON'],
    'massage': ['SER MASSAGE', 'SER SPA'],
    'construction': ['SER CONSTRUCTION SERVICES', 'SER SERVICES'],
    'services': ['SER SERVICES', 'SER CONSTRUCTION SERVICES'],
    'wholesale': ['WSR WHOLESALER', 'WSR DISTRIBUTORS', 'WSR IMPORTER', 'RET TRADING'],
    'bank': ['BNK BANK', 'BNK BANK - BRANCH', 'FRX FOREIGN EXCHANGE'],
    'healthcare': ['MED CLINIC', 'HOS HOSPITAL', 'DEN DENTAL CLINIC', 'DRG DRUG STORE', 'SER VETERINARY CLINIC'],
    'eatery': ['RES EATERY', 'RES RESTAURANT', 'RET RETAILER', 'RET FOOD RETAILER'],
    'canteen': ['RES EATERY', 'RES RESTAURANT', 'RET FOOD RETAILER'],
    'grocery': ['RET GROCERY', 'RET RETAILER', 'RET FOOD RETAILER', 'RET SUPERMARKET'],
    'grocery / supermarket': ['RET GROCERY', 'RET RETAILER', 'RET FOOD RETAILER', 'RET SUPERMARKET'],
    'fast food': ['RES FAST FOOD', 'RES RESTAURANT'],
    'fast food restaurant': ['RES FAST FOOD', 'RES RESTAURANT'],
    'gas station': ['RET GAS STATION', 'RET GASOLINE STATION'],
    'water refilling': ['RET WATER REFILLING', 'RET WATER'],
    'water refilling station': ['RET WATER REFILLING', 'RET WATER'],
    'lpg': ['FIX RETAILER - LIQUIFIED PETROLEUM GAS', 'RET LPG'],
    'lpg dealer': ['FIX RETAILER - LIQUIFIED PETROLEUM GAS', 'RET LPG'],
    'hotel': ['HOT HOTEL', 'MOT MOTEL', 'APT LESSOR'],
    'hotel & lodging': ['HOT HOTEL', 'MOT MOTEL'],
    'school': ['EDU SCHOOL', 'EDU EDUCATIONAL INSTITUTION'],
    'education': ['EDU SCHOOL', 'EDU EDUCATIONAL INSTITUTION', 'SER TUTORIAL', 'SER TRAINING CENTER'],
    'printing shop': ['SER PRINTING', 'PRN PRINTING SERVICES'],
    'printing services': ['SER PRINTING', 'PRN PRINTING SERVICES'],
    'internet café': ['SER INTERNET CAFE', 'SER INTERNET SHOP'],
    'car wash': ['SER CAR WASH', 'SER SERVICES'],
    'hardware store': ['RET HARDWARE', 'RET RETAILER'],
    'real estate': ['APT LESSOR', 'APT APARTMENT', 'APT COMMERCIAL UNIT', 'SER REAL ESTATE'],
    'security agency': ['SCA SECURITY AGENCY', 'SER SECURITY'],
    'funeral services': ['SER FUNERAL PARLOR', 'SER FUNERAL'],
    'catering': ['CAT CATERING', 'RES RESTAURANT'],
    'travel agency': ['TA TRAVEL AGENCY', 'SER TRAVEL'],
    'lending': ['SER LENDING', 'BNK BANK'],
    'pawnshop': ['PWN PAWNSHOP', 'SER LENDING'],
    'insurance': ['IN6 INSURANCE', 'SER INSURANCE'],
    'money remittance': ['SER REMITTANCE', 'FRX FOREIGN EXCHANGE'],
    'cooperative': ['SER COOPERATIVE', 'BNK BANK'],
    'bpo': ['BPO CALL CENTER', 'SER BPO'],
    'bpo / call center': ['BPO CALL CENTER', 'SER BPO'],
    'call center': ['BPO CALL CENTER', 'SER BPO'],
    'it services': ['SER IT SERVICES', 'SER SOFTWARE', 'SER TECH'],
    'it / software services': ['SER IT SERVICES', 'SER SOFTWARE', 'SER TECH'],
    'software company': ['SER SOFTWARE', 'SER IT SERVICES'],
    'trucking': ['SER TRUCKING', 'SER CARGO', 'SER LOGISTICS'],
    'trucking / cargo': ['SER TRUCKING', 'SER CARGO', 'SER LOGISTICS'],
    'logistics': ['SER LOGISTICS', 'SER TRUCKING', 'SER CARGO'],
    'food': ['RES RESTAURANT', 'RET FOOD RETAILER', 'RES EATERY', 'SSM BAKERY'],
    'food business': ['RES RESTAURANT', 'RET FOOD RETAILER', 'RES EATERY', 'RET RETAILER', 'SSM BAKERY'],
    'personal care': ['SER BEAUTY PARLOR', 'SER SALON', 'SER SPA', 'SER MASSAGE'],
    'tech': ['SER IT SERVICES', 'SER SOFTWARE', 'SER TECH'],
    'finance': ['BNK BANK', 'SER LENDING', 'IN6 INSURANCE', 'FRX FOREIGN EXCHANGE'],
    'energy': ['RET GAS STATION', 'FIX RETAILER - LIQUIFIED PETROLEUM GAS', 'RET WATER REFILLING'],
    'hospitality': ['HOT HOTEL', 'RES RESTAURANT', 'CAT CATERING'],
    'manufacturing': ['SSM MANUFACTURING', 'BSM MANUFACTURING', 'WSR WHOLESALER'],
    'trading': ['RET TRADING', 'WSR WHOLESALER', 'RET RETAILER'],
    'auto shop': ['SER AUTO REPAIR', 'SER VULCANIZING', 'SER SERVICES'],
    'general business': ['RET RETAILER', 'SER SERVICES', 'RES RESTAURANT'],
    'general services': ['SER SERVICES', 'RET RETAILER'],
  };
  
  if (mappings[ideaLower]) return mappings[ideaLower];
  
  // Try partial match
  const words = ideaLower.split(/\s+/);
  for (const key of Object.keys(mappings)) {
    for (const word of words) {
      if (word.length > 2 && (key.includes(word) || word.includes(key))) {
        return mappings[key];
      }
    }
  }
  
  // Fallback
  return [idea, ideaLower.replace(/\s+/g, '%')];
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

app.post("/register", async (req, res) => {
  try {
    const { fullname, email, username, password, affiliation, industry, industry_specific } = req.body;
    const [existing] = await legendDB.query("SELECT id FROM users WHERE email = ? OR username = ?", [email, username]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: "Email or username already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const code = generateVerificationCode();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10);
    const tempId = crypto.randomBytes(16).toString("hex");

    pendingVerifications.set(tempId, {
      fullname, email, username, hashedPassword: hashed, affiliation,
      industry: industry || null, industry_specific: industry_specific || null,
      code, codeExpiresAt: expiry
    });

    await sendVerificationCode(email, username, code);
    res.json({ success: true, tempUserId: tempId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/verify-code", async (req, res) => {
  try {
    const { tempUserId, code } = req.body;
    const data = pendingVerifications.get(tempUserId);
    if (!data) return res.status(400).json({ success: false, message: "Invalid temp ID" });
    if (new Date() > new Date(data.codeExpiresAt)) {
      pendingVerifications.delete(tempUserId);
      return res.status(400).json({ success: false, message: "Code expired" });
    }
    if (data.code !== code) return res.status(400).json({ success: false, message: "Invalid code" });

    await legendDB.query(
      `INSERT INTO users (fullname, email, username, password, is_verified, verified_at, registered_at, affiliation, industry, industry_specific, role)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW(), ?, ?, ?, 'user')`,
      [data.fullname, data.email, data.username, data.hashedPassword, data.affiliation, data.industry || null, data.industry_specific || null]
    );
    pendingVerifications.delete(tempUserId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await legendDB.query("SELECT * FROM users WHERE username = ? OR email = ?", [username, username]);
    if (rows.length === 0) return res.status(400).json({ success: false, message: "User not found" });
    const user = rows[0];
    if (!user.is_verified) return res.status(403).json({ success: false, message: "Account not verified" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: "Wrong password" });

    req.session.user = {
      id: user.id, fullname: user.fullname, email: user.email, username: user.username,
      affiliation: user.affiliation, industry: user.industry || '',
      industry_specific: user.industry_specific || '', role: user.role || "user"
    };
    const redirectUrl = user.role === "admin" ? "/dashboard" : "/dashboard";
    res.json({ success: true, redirect: redirectUrl, isAdmin: user.role === "admin" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const [rows] = await legendDB.query("SELECT id, username FROM users WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Email not found" });
    const user = rows[0];
    const code = generateResetCode();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10);
    pendingPasswordResets.set(email, { code, codeExpiresAt: expiry });
    await sendVerificationCode(email, user.username, code);
    return res.json({ success: true, message: "Reset code sent" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Email sending failed" });
  }
});

app.post("/verify-forgot-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    const data = pendingPasswordResets.get(email);
    if (!data) return res.status(400).json({ success: false, message: "No reset request" });
    if (new Date() > new Date(data.codeExpiresAt)) {
      pendingPasswordResets.delete(email);
      return res.status(400).json({ success: false, message: "Code expired" });
    }
    if (data.code !== code) return res.status(400).json({ success: false, message: "Invalid code" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const data = pendingPasswordResets.get(email);
    if (!data) return res.status(400).json({ success: false, message: "No reset request" });
    const hashed = await bcrypt.hash(newPassword, 10);
    await legendDB.query("UPDATE users SET password = ? WHERE email = ?", [hashed, email]);
    pendingPasswordResets.delete(email);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false });
    res.redirect("/"); // ← must be "/" not "/dashboard"
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true });
  });
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.get("/dashboard/profile", requireAuth, (req, res) => {
  res.sendFile(path.join(dashboardPath, "Profile.html"));
});

app.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(adminDashboardPath, "admindb.html"));
});

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const [rows] = await legendDB.query(
      "SELECT affiliation, industry, industry_specific FROM users WHERE id = ?",
      [req.session.user.id]
    );
    if (rows.length === 0) {
      return res.json({ success: true, affiliation: '', industry: '', industry_specific: '' });
    }
    res.json({
      success: true,
      affiliation: rows[0].affiliation || '',
      industry: rows[0].industry || '',
      industry_specific: rows[0].industry_specific || ''
    });
  } catch (err) {
    res.json({ success: true, affiliation: '', industry: '', industry_specific: '' });
  }
});
app.get("/api/admin/test-report-tables", requireAdmin, async (req, res) => {
  try {
    const [tables] = await legendDB.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('search_pin_history', 'recommendation_history', 'saved_history')
    `);

    const [searchCount] = await legendDB.query(`SELECT COUNT(*) as cnt FROM search_pin_history`);
    const [recCount] = await legendDB.query(`SELECT COUNT(*) as cnt FROM recommendation_history`);
    const [savedCount] = await legendDB.query(`SELECT COUNT(*) as cnt FROM saved_history`);

    res.json({
      tablesFound: tables.map(t => t.TABLE_NAME),
      counts: {
        search_pin_history: searchCount[0].cnt,
        recommendation_history: recCount[0].cnt,
        saved_history: savedCount[0].cnt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const [rows] = await legendDB.query(
      "SELECT id, fullname, username, email, affiliation FROM users WHERE role != 'admin' ORDER BY fullname"
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/smart-chips", requireAuth, async (req, res) => {
  try {
    const { category = "", subcategory = "" } = req.query;
    const normalizedCategory = normalizeCategoryInput(category);
    if (!normalizedCategory) {
      return res.json({ success: true, data: { suggested: [], full: [], cross: [] } });
    }
    const CATEGORY_MAP = {
      "Food and Beverages": ["Restaurant", "Coffee Shop", "Milk Tea Shop", "Pizza Shop", "Burger Restaurant", "Fried Chicken Restaurant", "Bakery", "Fast Food Restaurant", "Cafe"],
      "Retail": ["Convenience Store", "Sari-Sari Store", "Grocery / Supermarket", "General Business"],
      "Personal Care and Services": ["Salon / Barbershop", "Spa & Massage", "Laundry Shop", "Repair Shop"],
      "Technology": ["Internet Cafe", "Computer Shop", "IT Services"],
      "Digital Service": ["Printing Shop", "Online Services", "Digital Marketing"],
      "Wholesale & Import": ["Wholesale Store", "Importer", "Trading Business"],
      "Manufacturing": ["Factory", "Production", "Industrial Business"],
      "IT & Software": ["Software Company", "IT Services", "System Developer"],
      "BPO & Call Center": ["Call Center", "BPO Services"],
      "Construction": ["Construction Company", "Contractor"],
      "Finance & Banking": ["Bank", "Lending Company", "Financial Services"],
      "Education": ["School", "Training Center", "Tutorial Center"],
      "Healthcare": ["Clinic", "Hospital", "Pharmacy"],
      "Energy and Fuel": ["Gas Station", "Fuel Supplier"],
      "Logistics & Transport": ["Delivery Service", "Transport Service", "Logistics Company"],
      "Hospitality": ["Hotel", "Resort", "Lodging"],
      "Security Services": ["Security Agency"],
      "Legal & Consulting": ["Law Firm", "Consulting Firm"],
      "Marketing & Advertising": ["Marketing Agency", "Advertising Agency"],
      "Admin & Management": ["Office Services", "Admin Services"],
      "General Services": ["General Business"]
    };
    const allowed = CATEGORY_MAP[normalizedCategory] || [];
    const [rows] = await geoDB.query(
      `SELECT business_trade_name, category, COUNT(*) AS cnt
       FROM businesses WHERE category = ? AND business_trade_name IS NOT NULL AND business_trade_name <> ''
       GROUP BY business_trade_name, category`,
      [normalizedCategory]
    );
    function toGenericType(name) {
      const str = (name || "").toLowerCase();
      if (/coffee|cafe|brew|starbucks/.test(str)) return "Coffee Shop";
      if (/milk.?tea|boba|gong cha|chatime/.test(str)) return "Milk Tea Shop";
      if (/pizza|pizzeria/.test(str)) return "Pizza Shop";
      if (/burger|jollibee|mcdo|mcdonald/.test(str)) return "Burger Restaurant";
      if (/chicken|fried chicken|bonchon/.test(str)) return "Fried Chicken Restaurant";
      if (/bakery|bakeshop|tinapay/.test(str)) return "Bakery";
      if (/fast.?food/.test(str)) return "Fast Food Restaurant";
      if (/restaurant|eatery|diner/.test(str)) return "Restaurant";
      if (/cafe/.test(str)) return "Cafe";
      if (/grocery|supermarket|palengke/.test(str)) return "Grocery / Supermarket";
      if (/sari.?sari/.test(str)) return "Sari-Sari Store";
      if (/convenience|7.?eleven|minimart/.test(str)) return "Convenience Store";
      if (/laundry|washing/.test(str)) return "Laundry Shop";
      if (/salon|barber/.test(str)) return "Salon / Barbershop";
      if (/spa|massage/.test(str)) return "Spa & Massage";
      if (/repair|vulcanizing/.test(str)) return "Repair Shop";
      if (/internet|computer/.test(str)) return "Internet Cafe";
      if (/printing|photocopy/.test(str)) return "Printing Shop";
      if (/clinic/.test(str)) return "Clinic";
      if (/hospital/.test(str)) return "Hospital";
      if (/pharmacy|drugstore/.test(str)) return "Pharmacy";
      if (/bank/.test(str)) return "Bank";
      return "General Business";
    }
    const map = new Map();
    rows.forEach((r) => {
      const generic = toGenericType(r.business_trade_name);
      if (!map.has(generic)) map.set(generic, { label: generic, category: r.category || normalizedCategory, cnt: 0 });
      map.get(generic).cnt += r.cnt;
    });
    const all = [...map.values()].sort((a, b) => b.cnt - a.cnt);
    let filtered = allowed.length > 0 ? all.filter(item => allowed.includes(item.label)) : all;
    if (filtered.length < 6) {
      const existing = new Set(filtered.map(x => x.label));
      allowed.forEach(label => { if (!existing.has(label)) filtered.push({ label, category: normalizedCategory, cnt: 0 }); });
    }
    let suggested = filtered.slice(0, 6);
    let full = filtered.slice(6, 18);
    let cross = [];
    const sub = (subcategory || "").toString().trim();
    if (sub) {
      const [crossRows] = await geoDB.query(
        `SELECT business_trade_name, category, COUNT(*) AS cnt
         FROM businesses WHERE LOWER(business_trade_name) LIKE ? AND category <> ? AND business_trade_name IS NOT NULL AND business_trade_name <> ''
         GROUP BY business_trade_name, category`,
        [`%${sub.toLowerCase()}%`, normalizedCategory]
      );
      const crossMap = new Map();
      crossRows.forEach((r) => {
        const generic = toGenericType(r.business_trade_name);
        if (!crossMap.has(generic)) crossMap.set(generic, { label: generic, category: r.category || "", cnt: 0 });
        crossMap.get(generic).cnt += r.cnt;
      });
      cross = [...crossMap.values()].sort((a, b) => b.cnt - a.cnt).slice(0, 10);
      if (allowed.length > 0) cross = cross.filter(item => allowed.includes(item.label));
    }
    function enforce(list) { if (allowed.length === 0) return list; return list.filter(item => allowed.includes(item.label)); }
    suggested = enforce(suggested); full = enforce(full); cross = enforce(cross);
    return res.json({ success: true, data: { suggested, full, cross } });
  } catch (err) {
    console.error("[smart-chips error]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/user-profile", requireAuth, async (req, res) => {
  try {
    const [rows] = await legendDB.query(
      "SELECT id, fullname, email, username, affiliation, industry, industry_specific, role FROM users WHERE id = ?",
      [req.session.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, user: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/user-profile", requireAuth, async (req, res) => {
  try {
    const { fullname, email, username, password, affiliation, industry, industry_specific } = req.body;
    const userId = req.session.user.id;
    const [existing] = await legendDB.query(
      "SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?",
      [email, username, userId]
    );
    if (existing.length > 0) return res.status(400).json({ success: false, message: "Email or username already in use" });
    let updateFields = [fullname, email, username, affiliation, industry || null, industry_specific || null];
    let updateQuery = "UPDATE users SET fullname = ?, email = ?, username = ?, affiliation = ?, industry = ?, industry_specific = ?";
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ", password = ?";
      updateFields.push(hashedPassword);
    }
    updateQuery += " WHERE id = ?";
    updateFields.push(userId);
    await legendDB.query(updateQuery, updateFields);
    const [updatedRows] = await legendDB.query(
      "SELECT id, fullname, email, username, affiliation, industry, industry_specific, role FROM users WHERE id = ?",
      [userId]
    );
    req.session.user = { ...req.session.user, ...updatedRows[0], role: updatedRows[0].role };
    return res.status(200).json({ success: true, message: "Profile updated successfully", user: updatedRows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/admin/profile", requireAdminPage, (req, res) => {
  res.sendFile(path.join(adminDashboardPath, "admindb.html")); 
  // or a separate admin profile HTML if you have one
});

app.get("/api/check-auth", (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false });
  res.json({
    authenticated: true, isAdmin: req.session.user.role === "admin",
    user: { id: req.session.user.id, fullname: req.session.user.fullname, username: req.session.user.username, role: req.session.user.role }
  });
});

app.get("/api/nearest-barangay", requireAuth, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ success: false, message: "lat/lon required" });
    const clickLat = Number(lat), clickLon = Number(lon);
    const [barangays] = await geoDB.query(
      `SELECT barangay_name, center_lat, center_lon FROM demographic_pasig WHERE center_lat IS NOT NULL AND center_lon IS NOT NULL`
    );
    if (barangays.length === 0) return res.json({ success: false, message: "No barangay centers found." });
    let nearestBarangay = null, minDist = Infinity;
    barangays.forEach(row => {
      const dist = haversineMeters(clickLat, clickLon, Number(row.center_lat), Number(row.center_lon));
      if (dist < minDist) { minDist = dist; nearestBarangay = row.barangay_name; }
    });
    res.json({ success: true, barangay: nearestBarangay, distanceMeters: Math.round(minDist) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/area-demographics", requireAuth, async (req, res) => {
  try {
    const { barangay, line_of_business } = req.query;
    if (!barangay) return res.status(400).json({ success: false, message: "barangay required" });
    const [demoRows] = await geoDB.query(
      `SELECT barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution
       FROM demographic_pasig WHERE LOWER(TRIM(barangay_name)) LIKE LOWER(TRIM(?))`,
      [`${normalizeBarangay(barangay)}%`]
    );
    const demo = demoRows.length > 0 ? demoRows[0] : null;
    const [bizCountRows] = await geoDB.query(
      `SELECT COUNT(*) AS total FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?))`,
      [`${normalizeBarangay(barangay)}%`]
    );
    const totalBusinesses = bizCountRows[0]?.total || 0;
    let sameLineCount = 0;
    if (line_of_business) {
      const [sameLineRows] = await geoDB.query(
        `SELECT COUNT(*) AS cnt FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND line_of_business = ?`,
        [`${normalizeBarangay(barangay)}%`, line_of_business]
      );
      sameLineCount = sameLineRows[0]?.cnt || 0;
    }
    res.json({ success: true, data: { demographic: demo, totalBusinesses, sameLineCount, lineOfBusiness: line_of_business || null } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SAVED RECOMMENDATIONS ────────────────────────────────────────────────────
app.get("/api/saved-recommendations", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await legendDB.query(
      `SELECT id, business_type, barangay, suitability_score, lat, lon, saved_at FROM saved_recommendations WHERE user_id = ? ORDER BY saved_at DESC`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/saved-recommendations", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { business_type, barangay, suitability_score, lat, lon } = req.body;
    if (!business_type) return res.status(400).json({ success: false, message: "business_type is required" });
    const latVal = (lat !== null && lat !== undefined && lat !== '') ? parseFloat(lat) : null;
    const lonVal = (lon !== null && lon !== undefined && lon !== '') ? parseFloat(lon) : null;
    const barangayVal = (barangay && barangay.trim()) ? barangay.trim() : null;
    let existing;
    if (barangayVal === null) {
      [existing] = await legendDB.query(
        `SELECT id FROM saved_recommendations WHERE user_id = ? AND business_type = ? AND barangay IS NULL`,
        [userId, business_type]
      );
    } else {
      [existing] = await legendDB.query(
        `SELECT id FROM saved_recommendations WHERE user_id = ? AND business_type = ? AND LOWER(TRIM(barangay)) = LOWER(TRIM(?))`,
        [userId, business_type, barangayVal]
      );
    }
    if (existing.length > 0) return res.json({ success: false, message: "Already saved" });
    const [result] = await legendDB.query(
      `INSERT INTO saved_recommendations (user_id, business_type, barangay, suitability_score, lat, lon) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, business_type, barangayVal, suitability_score || null, latVal, lonVal]
    );
    res.json({ success: true, id: result.insertId, message: "Saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/saved-recommendations/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [result] = await legendDB.query("DELETE FROM saved_recommendations WHERE id = ? AND user_id = ?", [req.params.id, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Saved recommendation not found" });
    res.json({ success: true, message: "Removed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN STATS ──────────────────────────────────────────────────────────────
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [userCount] = await legendDB.query("SELECT COUNT(*) as total FROM users WHERE role != 'admin'");
    const totalUsers = userCount[0].total;
    const [affiliations] = await legendDB.query(`
      SELECT SUM(CASE WHEN affiliation = 'Entrepreneur' THEN 1 ELSE 0 END) as entrepreneur,
             SUM(CASE WHEN affiliation = 'Aspiring Entrepreneur' THEN 1 ELSE 0 END) as aspiring FROM users`);
    const entrepreneur = parseInt(affiliations[0].entrepreneur) || 0;
    const aspiring = parseInt(affiliations[0].aspiring) || 0;
    const totalAffiliation = entrepreneur + aspiring;
    const entrepreneurPct = totalAffiliation > 0 ? Math.round((entrepreneur / totalAffiliation) * 100) : 0;
    const aspiringPct = totalAffiliation > 0 ? Math.round((aspiring / totalAffiliation) * 100) : 0;
    res.json({ success: true, totalUsers, entrepreneurPct, aspiringPct, entrepreneurCount: entrepreneur, aspiringCount: aspiring });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/saved-stats", requireAdmin, async (req, res) => {
  try {
    const [stats] = await legendDB.query(`
      SELECT COALESCE(business_type, 'Unknown') as business_type, COUNT(*) as count,
             ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM saved_recommendations), 1) as percentage
      FROM saved_recommendations GROUP BY business_type ORDER BY count DESC LIMIT 4`);
    res.json({ success: true, stats });
  } catch (err) {
    res.json({ success: true, stats: [] });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.get("/api/admin/barangays", requireAdmin, async (req, res) => {
  try {
    const [barangays] = await geoDB.query("SELECT barangay_name FROM demographic_pasig ORDER BY barangay_name");
    res.json({ success: true, barangays: barangays.map(b => b.barangay_name) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/businesses", requireAdmin, async (req, res) => {
  try {
    const { search = "", category = "", barangay = "", page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClauses = [], params = [];
    if (search) { whereClauses.push("(business_trade_name LIKE ? OR business_address LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (category) { whereClauses.push("category = ?"); params.push(category); }
    if (barangay) { whereClauses.push("barangay = ?"); params.push(barangay); }
    const whereSQL = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";
    const [countResult] = await geoDB.query(`SELECT COUNT(*) as total FROM businesses ${whereSQL}`, params);
    const total = countResult[0].total;
    const [businesses] = await geoDB.query(
      `SELECT b.id, b.business_trade_name, b.line_of_business, b.category, b.barangay, b.street, b.business_address, b.lat, b.lon,
              d.population, d.population_density, d.avg_income_min, d.avg_income_max
       FROM businesses b LEFT JOIN demographic_pasig d ON b.barangay_id = d.id ${whereSQL} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, data: businesses, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
  try {
    const [business] = await geoDB.query(
      `SELECT b.*, d.id as demographic_id FROM businesses b LEFT JOIN demographic_pasig d ON b.barangay_id = d.id WHERE b.id = ?`,
      [req.params.id]
    );
    if (business.length === 0) return res.status(404).json({ success: false, message: "Business not found" });
    res.json({ success: true, business: business[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/businesses", requireAdmin, async (req, res) => {
  try {
    const { business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon } = req.body;
    if (!business_trade_name || !barangay) return res.status(400).json({ success: false, message: "Business name and barangay are required" });
    const [barangayResult] = await geoDB.query("SELECT id FROM demographic_pasig WHERE barangay_name = ?", [barangay]);
    const barangay_id = barangayResult.length ? barangayResult[0].id : null;
    const [result] = await geoDB.query(
      `INSERT INTO businesses (business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon, barangay_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [business_trade_name, line_of_business || null, category || null, barangay, street || null, business_address || null, lat || null, lon || null, barangay_id]
    );
    res.json({ success: true, id: result.insertId, message: "Business added successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
  try {
    const { business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon } = req.body;
    let barangay_id = null;
    if (barangay) {
      const [barangayResult] = await geoDB.query("SELECT id FROM demographic_pasig WHERE barangay_name = ?", [barangay]);
      barangay_id = barangayResult.length ? barangayResult[0].id : null;
    }
    const [result] = await geoDB.query(
      `UPDATE businesses SET business_trade_name = COALESCE(?, business_trade_name), line_of_business = COALESCE(?, line_of_business),
       category = COALESCE(?, category), barangay = COALESCE(?, barangay), street = COALESCE(?, street),
       business_address = COALESCE(?, business_address), lat = COALESCE(?, lat), lon = COALESCE(?, lon), barangay_id = COALESCE(?, barangay_id)
       WHERE id = ?`,
      [business_trade_name || null, line_of_business || null, category || null, barangay || null, street || null,
       business_address || null, lat || null, lon || null, barangay_id, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Business not found" });
    res.json({ success: true, message: "Business updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
  try {
    const [result] = await geoDB.query("DELETE FROM businesses WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Business not found" });
    res.json({ success: true, message: "Business deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/demographics", requireAdmin, async (req, res) => {
  try {
    const [demographics] = await geoDB.query(
      `SELECT id, barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution
       FROM demographic_pasig ORDER BY barangay_name`
    );
    res.json({ success: true, data: demographics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/demographics/:id", requireAdmin, async (req, res) => {
  try {
    const [demographic] = await geoDB.query("SELECT * FROM demographic_pasig WHERE id = ?", [req.params.id]);
    if (demographic.length === 0) return res.status(404).json({ success: false, message: "Demographic not found" });
    res.json({ success: true, demographic: demographic[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/demographics", requireAdmin, async (req, res) => {
  try {
    const { barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution } = req.body;
    if (!barangay_name) return res.status(400).json({ success: false, message: "Barangay name is required" });
    const [result] = await geoDB.query(
      `INSERT INTO demographic_pasig (barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [barangay_name, population || null, population_density || null, highest_age_group || null, avg_income_min || null, avg_income_max || null, gender_distribution || null]
    );
    res.json({ success: true, id: result.insertId, message: "Demographic added successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/demographics/:id", requireAdmin, async (req, res) => {
  try {
    const { barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution } = req.body;
    const [result] = await geoDB.query(
      `UPDATE demographic_pasig SET barangay_name = COALESCE(?, barangay_name), population = COALESCE(?, population),
       population_density = COALESCE(?, population_density), highest_age_group = COALESCE(?, highest_age_group),
       avg_income_min = COALESCE(?, avg_income_min), avg_income_max = COALESCE(?, avg_income_max),
       gender_distribution = COALESCE(?, gender_distribution) WHERE id = ?`,
      [barangay_name || null, population || null, population_density || null, highest_age_group || null,
       avg_income_min || null, avg_income_max || null, gender_distribution || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Demographic not found" });
    res.json({ success: true, message: "Demographic updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/admin/demographics/:id", requireAdmin, async (req, res) => {
  try {
    const [businessCount] = await geoDB.query("SELECT COUNT(*) as count FROM businesses WHERE barangay_id = ?", [req.params.id]);
    if (businessCount[0].count > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete: Barangay has ${businessCount[0].count} associated businesses` });
    }
    const [result] = await geoDB.query("DELETE FROM demographic_pasig WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Demographic not found" });
    res.json({ success: true, message: "Demographic deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Helper: Convert DB business codes to readable names ──────────────────────
function dbCodeToReadableName(dbCode) {
  if (!dbCode) return 'Other Business';
  
  const code = dbCode.toString().toUpperCase().trim();
  
  // Specific food types (keep these)
  if (code.includes('PIZZA')) return 'Pizza Restaurant';
  if (code.includes('BAKERY') || code.includes('BAKESHOP')) return 'Bakery';
  if (code.includes('COFFEE') || code.includes('CAFE')) return 'Coffee Shop';
  if (code.includes('MILK TEA') || code.includes('MILKTEA')) return 'Milk Tea Shop';
  if (code.includes('RESTAURANT') || code.includes('EATERY') || code.includes('CANTEEN') || code.includes('DINER')) return 'Restaurant';
  if (code.includes('FAST FOOD')) return 'Fast Food Restaurant';
  if (code.includes('CATERING')) return 'Catering';
  
  // Other specific types
  if (code.includes('SARI-SARI') || code.includes('SARI SARI')) return 'Sari-Sari Store';
  if (code.includes('GROCERY') || code.includes('SUPERMARKET')) return 'Grocery';
  if (code.includes('CONVENIENCE') || code.includes('MINIMART')) return 'Convenience Store';
  if (code.includes('DRUG') || code.includes('PHARMACY')) return 'Pharmacy';
  if (code.includes('SALON') || code.includes('BEAUTY') || code.includes('BARBER')) return 'Salon & Beauty';
  if (code.includes('LAUNDRY') || code.includes('WASHING')) return 'Laundry Shop';
  if (code.includes('SPA') || code.includes('MASSAGE')) return 'Spa & Massage';
  if (code.includes('CLINIC') || code.includes('HOSPITAL') || code.includes('MEDICAL') || code.includes('DENTAL')) return 'Healthcare';
  if (code.includes('SCHOOL') || code.includes('TUTORIAL') || code.includes('TRAINING') || code.includes('EDUCATION')) return 'Education';
  if (code.includes('HOTEL') || code.includes('MOTEL') || code.includes('INN') || code.includes('LODGE')) return 'Hotel & Lodging';
  if (code.includes('HARDWARE')) return 'Hardware Store';
  if (code.includes('WATER')) return 'Water Refilling';
  if (code.includes('LPG')) return 'LPG Dealer';
  if (code.includes('GAS') || code.includes('FUEL') || code.includes('PETROL')) return 'Gas Station';
  if (code.includes('BANK')) return 'Bank';
  if (code.includes('CONSTRUCTION')) return 'Construction';
  if (code.includes('SECURITY') || code.includes('GUARD')) return 'Security Agency';
  if (code.includes('FUNERAL')) return 'Funeral Services';
  if (code.includes('PRINTING') || code.includes('PHOTOCOPY')) return 'Printing Services';
  if (code.includes('GYM') || code.includes('FITNESS')) return 'Gym / Fitness';
  if (code.includes('CAR') || code.includes('AUTO') || code.includes('VEHICLE') || code.includes('VULCANIZING')) return 'Auto Shop';
  if (code.includes('TRAVEL')) return 'Travel Agency';
  if (code.includes('LENDING') || code.includes('LOAN')) return 'Lending';
  if (code.includes('PAWNSHOP')) return 'Pawnshop';
  if (code.includes('INSURANCE')) return 'Insurance';
  if (code.includes('REMITTANCE') || code.includes('MONEY')) return 'Money Remittance';
  if (code.includes('COOPERATIVE')) return 'Cooperative';
  if (code.includes('BPO') || code.includes('CALL CENTER')) return 'BPO / Call Center';
  if (code.includes('SOFTWARE') || code.includes('IT SERVICES') || code.includes('TECH')) return 'IT / Software';
  if (code.includes('TRUCKING') || code.includes('CARGO') || code.includes('COURIER') || code.includes('LOGISTICS')) return 'Logistics';
  if (code.includes('WAREHOUSE')) return 'Warehouse';
  if (code.includes('REAL ESTATE') || code.includes('LESSOR') || code.includes('APARTMENT') || code.includes('RENTAL')) return 'Real Estate';
  if (code.includes('LAW') || code.includes('LEGAL') || code.includes('ATTORNEY')) return 'Law Firm';
  if (code.includes('CONSULTING') || code.includes('CONSULTANCY')) return 'Consulting';
  if (code.includes('ACCOUNTING') || code.includes('AUDIT')) return 'Accounting';
  if (code.includes('MARKETING') || code.includes('ADVERTISING')) return 'Marketing';
  if (code.includes('MANPOWER') || code.includes('HR')) return 'Manpower Services';
  if (code.includes('PHOTOGRAPHY') || code.includes('PHOTO STUDIO')) return 'Photo Studio';
  if (code.includes('TAILORING') || code.includes('ALTERATION')) return 'Tailoring';
  if (code.includes('NAIL')) return 'Nail Salon';
  if (code.includes('OPTICAL') || code.includes('EYEWEAR')) return 'Optical Shop';
  if (code.includes('CLOTHING') || code.includes('BOUTIQUE') || code.includes('FASHION')) return 'Clothing Store';
  if (code.includes('SHOE') || code.includes('FOOTWEAR')) return 'Shoe Store';
  if (code.includes('BOOK') || code.includes('SCHOOL SUPPLY')) return 'Bookstore';
  if (code.includes('TOY') || code.includes('GAMES')) return 'Toy Store';
  if (code.includes('PET') || code.includes('VETERINARY')) return 'Pet Shop';
  if (code.includes('FLOWER') || code.includes('FLORIST')) return 'Flower Shop';
  if (code.includes('DAYCARE') || code.includes('CHILDCARE')) return 'Daycare';
  if (code.includes('CLEANING') || code.includes('JANITORIAL')) return 'Cleaning Services';
  if (code.includes('PARKING')) return 'Parking';
  if (code.includes('EVENTS') || code.includes('VENUE') || code.includes('HALL')) return 'Events Place';
  if (code.includes('FOREIGN EXCHANGE') || code.includes('FOREX')) return 'Foreign Exchange';
  if (code.includes('FRANCHISE')) return 'Franchise';
  if (code.includes('EXPORT')) return 'Export';
  if (code.includes('STOCKBROKER') || code.includes('BROKER')) return 'Stockbroker';
  if (code.includes('REPAIR')) return 'Repair Shop';
  
  // DON'T return vague names - return the best match or 'Other Business'
  return 'Other Business';
}

app.get("/api/ideas", requireAuth, async (req, res) => {
  try {
    const { category, barangay, top = 3, prefs = "" } = req.query;
    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const topN = parseInt(top) || 3;

    // ─── Get category keywords for filtering ──────────────────────────────────
    const mappedCategory = category ? (TYPE_TO_CATEGORY[category] || category) : null;
    const categoryKeywords = mappedCategory ? getCategoryKeywords(mappedCategory) : [];

    async function fetchIdeaRows(opts = {}) {
      let sql = `SELECT line_of_business AS name, COUNT(*) AS cnt
                 FROM businesses
                 WHERE line_of_business IS NOT NULL AND line_of_business <> ''`;
      const p = [];
      
      if (opts.category && categoryKeywords.length > 0) {
        // Filter by category keywords matching line_of_business
        const keywordConditions = categoryKeywords.map(() => 
          `LOWER(line_of_business) LIKE ?`
        ).join(' OR ');
        sql += ` AND (${keywordConditions})`;
        categoryKeywords.forEach(kw => p.push(`%${kw.toLowerCase()}%`));
      }
      
      if (opts.barangay) {
        sql += " AND LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?))";
        p.push(`${normalizeBarangay(opts.barangay)}%`);
      }
      sql += " GROUP BY line_of_business ORDER BY cnt DESC";
      const [rows] = await geoDB.query(sql, p);
      return rows;
    }

    // Fetch with category and barangay filters
    let ideaRows = await fetchIdeaRows({ category: mappedCategory, barangay });

    // Progressive fallback
    if (ideaRows.length < topN && barangay && mappedCategory) {
      const wider = await fetchIdeaRows({ barangay });
      const existing = new Set(ideaRows.map(r => r.name));
      ideaRows = [...ideaRows, ...wider.filter(r => !existing.has(r.name))];
    }

    if (ideaRows.length < topN) {
      const widest = await fetchIdeaRows({ category: mappedCategory });
      const existing = new Set(ideaRows.map(r => r.name));
      ideaRows = [...ideaRows, ...widest.filter(r => !existing.has(r.name))];
    }

    if (ideaRows.length < topN) {
      const fallback = await fetchIdeaRows({});
      const existing = new Set(ideaRows.map(r => r.name));
      ideaRows = [...ideaRows, ...fallback.filter(r => !existing.has(r.name))];
    }

    if (!ideaRows.length) return res.json({ success: true, data: [] });

    // ─── Convert to readable names and filter out generic/irrelevant ──────────
    const GENERIC_NAMES = ['Food Business', 'Other Business', 'General Business', 
                           'Retail Store', 'Services', 'Wholesale', 'Manufacturing',
                           'Admin Services', 'General Services'];
    
    const readableNameMap = new Map();
    ideaRows.forEach(row => {
      const readableName = dbCodeToReadableName(row.name);
      // Skip generic/vague names
      if (GENERIC_NAMES.includes(readableName)) return;
      
      // If category is specified, check if the readable name matches
      if (categoryKeywords.length > 0) {
        const matchesCategory = categoryKeywords.some(kw => 
          readableName.toLowerCase().includes(kw.toLowerCase())
        );
        if (!matchesCategory) return;
      }
      
      if (readableNameMap.has(readableName)) {
        readableNameMap.set(readableName, readableNameMap.get(readableName) + row.cnt);
      } else {
        readableNameMap.set(readableName, row.cnt);
      }
    });

    let readableRows = [...readableNameMap.entries()]
      .map(([name, cnt]) => ({ name, cnt }))
      .sort((a, b) => b.cnt - a.cnt);

    // If not enough results after filtering, relax the category filter
    if (readableRows.length < topN && categoryKeywords.length > 0) {
      // Re-process without category filter
      const relaxedMap = new Map();
      ideaRows.forEach(row => {
        const readableName = dbCodeToReadableName(row.name);
        if (GENERIC_NAMES.includes(readableName)) return;
        if (relaxedMap.has(readableName)) {
          relaxedMap.set(readableName, relaxedMap.get(readableName) + row.cnt);
        } else {
          relaxedMap.set(readableName, row.cnt);
        }
      });
      const relaxedRows = [...relaxedMap.entries()]
        .map(([name, cnt]) => ({ name, cnt }))
        .filter(r => !readableRows.find(rr => rr.name === r.name))
        .sort((a, b) => b.cnt - a.cnt);
      readableRows = [...readableRows, ...relaxedRows];
    }

    const result = readableRows.slice(0, topN).map(r => r.name);
    return res.json({ success: true, data: result });

  } catch (err) {
    console.error("ideas error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Add this helper function to map categories to keywords
function getCategoryKeywords(category) {
  const catLower = (category || '').toLowerCase().trim();
  
  const CATEGORY_KEYWORDS = {
    'food & beverage': [
      'restaurant', 'eatery', 'cafe', 'coffee', 'bakery', 'bakeshop', 
      'fast food', 'canteen', 'catering', 'pizza', 'burger', 'diner', 
      'grill', 'milk tea', 'juice', 'snack', 'panciteria', 'ice cream', 
      'donut', 'pastry', 'food', 'beverage', 'drink', 'bar', 'karaoke',
      'refreshment', 'pares', 'silog', 'tapsi', 'lugaw', 'goto', 'ihaw',
      'lechon', 'seafood', 'buffet', 'carinderia', 'turo-turo'
    ],
    'retail & trading': [
      'store', 'retail', 'sari-sari', 'grocery', 'supermarket', 
      'convenience', 'hardware', 'cellphone', 'appliance', 'clothing', 
      'bookstore', 'optical', 'pharmacy', 'drug', 'shoe', 'toy', 
      'pet', 'flower', 'trading', 'shop', 'mart'
    ],
    'beauty & wellness': [
      'salon', 'barber', 'spa', 'massage', 'nail', 'wellness', 'beauty', 'hair'
    ],
    'healthcare': [
      'clinic', 'hospital', 'dental', 'pharmacy', 'drug', 'laboratory', 
      'medical', 'optical', 'veterinary'
    ],
    'hospitality': [
      'hotel', 'motel', 'inn', 'lodge', 'pension', 'resort', 'catering', 'apartment'
    ],
    'education': [
      'school', 'tutorial', 'training', 'review', 'daycare', 'academy'
    ],
    'finance & banking': [
      'bank', 'lending', 'pawnshop', 'insurance', 'remittance', 
      'cooperative', 'microfinance', 'money'
    ],
    'construction': [
      'construction', 'hardware', 'contractor', 'supplies'
    ],
    'logistics & transport': [
      'trucking', 'cargo', 'freight', 'courier', 'delivery', 'logistics', 'warehouse'
    ],
    'it & software': [
      'software', 'it services', 'tech', 'internet', 'computer', 'web', 'app', 'digital'
    ],
    'bpo & call center': [
      'bpo', 'call center', 'outsourcing'
    ],
    'manufacturing': [
      'manufacturing', 'factory', 'production', 'fabrication'
    ],
    'wholesale & import': [
      'wholesale', 'distributor', 'importer', 'trading'
    ],
    'energy & fuel': [
      'gas station', 'lpg', 'fuel', 'energy', 'solar'
    ],
    'security': [
      'security', 'guard', 'cctv', 'alarm'
    ],
    'legal & consulting': [
      'law', 'legal', 'consulting', 'accounting', 'notary', 'attorney'
    ],
    'marketing & advertising': [
      'marketing', 'advertising', 'printing', 'photography', 'videography'
    ],
    'hr & manpower': [
      'manpower', 'admin', 'hr'
    ],
    'general services': [
      'laundry', 'car wash', 'cleaning', 'repair', 'printing', 
      'photography', 'travel', 'funeral', 'events', 'gym', 'fitness', 
      'tailoring', 'parking', 'water'
    ],
  };
  
  return CATEGORY_KEYWORDS[catLower] || [];
}
app.get("/api/ideas-by-point", requireAuth, async (req, res) => {
  try {
    const { lat, lon, category, top = 3, prefs = "" } = req.query;
    if (!lat || !lon) return res.status(400).json({ success: false, message: "lat/lon required" });

    const latNum = Number(lat), lonNum = Number(lon);
    if (!inPasig(latNum, lonNum)) return res.json({ success: true, data: [] });

    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const weights = prefWeights();
    const GENERIC_NAMES = [
      'Food Business', 'Other Business', 'General Business',
      'Retail Store', 'Services', 'Wholesale', 'Manufacturing',
      'Admin Services', 'General Services'
    ];

    let sql = `SELECT line_of_business AS name, COUNT(*) AS cnt
               FROM businesses
               WHERE line_of_business IS NOT NULL AND line_of_business <> ''`;
    const params = [];

    if (category) {
      const mappedCategory = TYPE_TO_CATEGORY[category] || category;
      sql += " AND category = ?";
      params.push(mappedCategory);
    }

    sql += " GROUP BY line_of_business ORDER BY cnt DESC";
    const [ideaRows] = await geoDB.query(sql, params);

    // ─── DEDUPE by readable name, sum counts ─────────────────────────────────
    const readableMap = new Map();
    ideaRows.forEach(row => {
      const readable = dbCodeToReadableName(row.name);
      if (GENERIC_NAMES.includes(readable)) return;
      if (readableMap.has(readable)) {
        readableMap.set(readable, readableMap.get(readable) + Number(row.cnt));
      } else {
        readableMap.set(readable, Number(row.cnt));
      }
    });

    let readableIdeaRows = [...readableMap.entries()]
      .map(([name, cnt]) => ({ name, cnt }))
      .sort((a, b) => b.cnt - a.cnt);

    if (!readableIdeaRows.length) return res.json({ success: true, data: [] });

    const topN = parseInt(top) || 3;

    if (!prefList.length) {
      return res.json({
        success: true,
        data: readableIdeaRows.slice(0, topN).map(r => r.name)
      });
    }

    // ─── Preference-based scoring ─────────────────────────────────────────────
    const ideas = readableIdeaRows.map(r => r.name);

    const [allBiz] = await geoDB.query(
      `SELECT barangay, line_of_business,
              CAST(lat AS DECIMAL(10,7)) AS lat,
              CAST(lon AS DECIMAL(10,7)) AS lon
       FROM businesses
       WHERE lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'
         AND CAST(lat AS DECIMAL(10,7)) BETWEEN ? AND ?
         AND CAST(lon AS DECIMAL(10,7)) BETWEEN ? AND ?`,
      [PASIG_BOUNDS.minLat, PASIG_BOUNDS.maxLat, PASIG_BOUNDS.minLon, PASIG_BOUNDS.maxLon]
    );

    const [demoRows] = await geoDB.query(
      `SELECT barangay_name, population, population_density,
              avg_income_max, gender_distribution, highest_age_group
       FROM demographic_pasig`
    );
    const demoMap = {};
    demoRows.forEach(d => { demoMap[normalizeBarangay(d.barangay_name)] = d; });

    const [totBizRows] = await geoDB.query(
      `SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`
    );
    const totalBizMap = {};
    totBizRows.forEach(r => { totalBizMap[normalizeBarangay(r.barangay)] = Number(r.cnt) || 0; });

    const centroidMap = {};
    allBiz.forEach(b => {
      const key = normalizeBarangay(b.barangay);
      const latN = Number(b.lat), lonN = Number(b.lon);
      if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return;
      if (!centroidMap[key]) centroidMap[key] = { lat: 0, lon: 0, n: 0 };
      centroidMap[key].lat += latN;
      centroidMap[key].lon += lonN;
      centroidMap[key].n += 1;
    });
    Object.keys(centroidMap).forEach(k => {
      centroidMap[k].lat /= centroidMap[k].n;
      centroidMap[k].lon /= centroidMap[k].n;
    });

    let nearestBarangay = null, minDist = Infinity;
    Object.keys(centroidMap).forEach(b => {
      const c = centroidMap[b];
      const d = haversineMeters(latNum, lonNum, c.lat, c.lon);
      if (d < minDist) { minDist = d; nearestBarangay = b; }
    });

    const radius = 500;
    const ideaScores = [];
    ideas.forEach(name => {
      const searchTerms = ideaToDbSearchTerms(name) || [name];
      const ideaBiz = allBiz.filter(b =>
        searchTerms.some(term =>
          (b.line_of_business || '').toUpperCase().includes(term.toUpperCase())
        )
      );
      let competitors = 0;
      ideaBiz.forEach(b => {
        if (haversineMeters(latNum, lonNum, Number(b.lat), Number(b.lon)) <= radius) competitors += 1;
      });
      const demo = demoMap[nearestBarangay] || {};
      const totalBiz = totalBizMap[nearestBarangay] || 0;
      const bizDensity = demo.population
        ? totalBiz / (Number(demo.population) / 1000)
        : 0;
      ideaScores.push({
        name,
        totalpop:    Number(demo.population) || 0,
        popdensity:  Number(demo.population_density) || 0,
        income:      Number(demo.avg_income_max) || 0,
        gender:      demo.gender_distribution === "Female" ? 1 : 0,
        agedist:     ageScore(demo.highest_age_group),
        bizdensity:  bizDensity,
        bizcount:    ideaBiz.filter(b => normalizeBarangay(b.barangay) === nearestBarangay).length,
        competitors
      });
    });

    const finalScores = ideaScores.map(i => ({ name: i.name, score: 0 }));
    prefList.forEach(pref => {
      const values = ideaScores.map(i => Number(i[pref]) || 0);
      const z = zscores(values);
      z.forEach((val, idx) => { finalScores[idx].score += (weights[pref] || 0) * val; });
    });
    finalScores.sort((a, b) => b.score - a.score);

    return res.json({
      success: true,
      data: finalScores
        .filter(r => !GENERIC_NAMES.includes(r.name))
        .slice(0, topN)
        .map(r => r.name)
    });

  } catch (err) {
    console.error("ideas-by-point error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Get actual business types in a barangay ──────────────────────────────────
app.get("/api/barangay-business-types", requireAuth, async (req, res) => {
  try {
    const { barangay, type } = req.query;
    
    // FIXED: Return empty array if no barangay provided
    if (!barangay) {
      return res.json({ success: true, data: [] });
    }
    
    let sql = `
      SELECT line_of_business, COUNT(*) as cnt
      FROM businesses
      WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?))
        AND line_of_business IS NOT NULL
        AND line_of_business <> ''`;
    
    const params = [`${normalizeBarangay(barangay)}%`];
    
    // Add type filter if specified
    if (type) {
      const mappedCategory = TYPE_TO_CATEGORY[type] || type;
      sql += ` AND category = ?`;
      params.push(mappedCategory);
    }
    
    sql += ` GROUP BY line_of_business ORDER BY cnt DESC LIMIT 3`;
    
    const [rows] = await geoDB.query(sql, params);
    
    // Transform the business codes into readable names
    const businessTypes = rows.map(row => {
      const rawType = row.line_of_business || '';
      let readable = rawType;
      
      // Map common codes to readable names
      if (/RESTAURANT/i.test(rawType)) readable = 'Restaurant';
      else if (/SARI-SARI/i.test(rawType)) readable = 'Sari-Sari Store';
      else if (/BAKERY/i.test(rawType)) readable = 'Bakery';
      else if (/DRUG|PHARMACY/i.test(rawType)) readable = 'Pharmacy';
      else if (/RETAILER|RETAIL/i.test(rawType)) readable = 'Retail Store';
      else if (/SALON|BEAUTY|BARBER/i.test(rawType)) readable = 'Salon & Beauty';
      else if (/LAUNDRY/i.test(rawType)) readable = 'Laundry Shop';
      else if (/SPA|MASSAGE/i.test(rawType)) readable = 'Spa & Massage';
      else if (/CONSTRUCTION/i.test(rawType)) readable = 'Construction';
      else if (/SERVICES/i.test(rawType)) readable = 'Services';
      else if (/WHOLESALE|DISTRIBUTOR/i.test(rawType)) readable = 'Wholesale';
      else if (/BANK/i.test(rawType)) readable = 'Bank';
      else if (/HOTEL|MOTEL|INN/i.test(rawType)) readable = 'Hotel & Lodging';
      else if (/CLINIC|HOSPITAL|MEDICAL|DENTAL/i.test(rawType)) readable = 'Healthcare';
      else if (/COFFEE|CAFE/i.test(rawType)) readable = 'Coffee Shop';
      else if (/FAST FOOD/i.test(rawType)) readable = 'Fast Food';
      else if (/EATERY|CANTEEN/i.test(rawType)) readable = 'Eatery';
      else if (/GROCERY|SUPERMARKET/i.test(rawType)) readable = 'Grocery';
      else if (/HARDWARE/i.test(rawType)) readable = 'Hardware Store';
      else if (/SCHOOL|TUTORIAL|TRAINING/i.test(rawType)) readable = 'Education';
      else if (/GAS|FUEL|PETROL/i.test(rawType)) readable = 'Gas Station';
      else if (/WATER/i.test(rawType)) readable = 'Water Refilling';
      else if (/LPG/i.test(rawType)) readable = 'LPG Dealer';
      else if (/FUNERAL/i.test(rawType)) readable = 'Funeral Services';
      else if (/PRINTING/i.test(rawType)) readable = 'Printing Services';
      else if (/GARAGE|AUTO|CAR|VEHICLE/i.test(rawType)) readable = 'Auto Shop';
      else if (/LESSOR|APARTMENT|RENTAL/i.test(rawType)) readable = 'Real Estate';
      else if (/TRADING/i.test(rawType)) readable = 'Trading';
      else if (/FOOD/i.test(rawType)) readable = 'Food Business';
      
      return readable;
    });
    
    // Remove duplicates
    const uniqueTypes = [...new Set(businessTypes)];
    
    res.json({ success: true, data: uniqueTypes.slice(0, 3) });
    
  } catch (err) {
    console.error("barangay-business-types error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add this debug endpoint to server.js
app.get("/api/verify-barangay-names", requireAuth, async (req, res) => {
  try {
    const [sample] = await geoDB.query(
      `SELECT id, barangay as db_barangay, business_trade_name, lat, lon
       FROM businesses
       WHERE barangay = 'Santa Lucia'
       LIMIT 30`
    );
    
    // Get the actual barangay for each coordinate
    const results = await Promise.all(sample.map(async (biz) => {
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${biz.lat}&lon=${biz.lon}&format=json`);
        const data = await resp.json();
        const nominatimBarangay = data.address?.suburb || data.address?.neighbourhood || data.address?.city_district || 'Unknown';
        return {
          id: biz.id,
          db_barangay: biz.db_barangay,
          nominatim_barangay: nominatimBarangay,
          lat: biz.lat,
          lon: biz.lon
        };
      } catch {
        return { id: biz.id, db_barangay: biz.db_barangay, nominatim_barangay: 'Error', lat: biz.lat, lon: biz.lon };
      }
    }));
    
    // Count mismatches
    const mismatches = results.filter(r => 
      r.nominatim_barangay.toLowerCase() !== 'santa lucia' && 
      r.nominatim_barangay !== 'Unknown' && 
      r.nominatim_barangay !== 'Error'
    );
    
    res.json({
      total_sample: sample.length,
      mismatch_count: mismatches.length,
      mismatches: mismatches.slice(0, 10),
      unique_nominatim_barangays: [...new Set(mismatches.map(m => m.nominatim_barangay))].sort()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/idea-locations", requireAuth, async (req, res) => {
  try {
    const { idea, barangay, top = 5 } = req.query;
    if (!idea) return res.status(400).json({ success: false, message: "idea required" });

    const topN = Math.min(parseInt(top, 10) || 5, 50);
    const searchTerms = ideaToDbSearchTerms(idea);
    
    let sql = `SELECT id, barangay, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon,
                      business_trade_name, line_of_business
               FROM businesses
               WHERE lat IS NOT NULL AND lon IS NOT NULL
                 AND lat != 'null' AND lon != 'null'`;
    
    const params = [];
    
    // FIX: Broader search - try multiple approaches
    const searchConditions = [];
    
    // 1. Search by mapped DB codes
    if (searchTerms && searchTerms.length > 0) {
      const termConditions = searchTerms.map(() => 
        `(LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`
      ).join(' OR ');
      searchConditions.push(`(${termConditions})`);
      searchTerms.forEach(term => {
        params.push(`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`);
      });
    }
    
    // 2. Search by the idea name directly
    searchConditions.push(`(LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`);
    params.push(`%${idea.toLowerCase()}%`, `%${idea.toLowerCase()}%`);
    
    // 3. For food-related searches, also search for common food codes
    const foodIdeas = ['bakery', 'restaurant', 'eatery', 'canteen', 'coffee', 'cafe', 'fast food', 'bakeshop'];
    if (foodIdeas.some(f => idea.toLowerCase().includes(f))) {
      searchConditions.push(`(LOWER(line_of_business) LIKE '%bakery%' OR LOWER(line_of_business) LIKE '%bakeshop%' OR LOWER(line_of_business) LIKE '%restaurant%' OR LOWER(line_of_business) LIKE '%eatery%' OR LOWER(line_of_business) LIKE '%food%')`);
    }
    
    sql += ` AND (${searchConditions.join(' OR ')})`;

    // Barangay filter
    if (barangay) {
      sql += ` AND LOWER(TRIM(barangay)) = LOWER(TRIM(?))`;
      params.push(barangay);
    }

    sql += ` ORDER BY RAND() LIMIT ${Math.min(topN * 3, 100)}`;
    
    console.log('📍 idea-locations SQL:', sql.substring(0, 200));
    console.log('📍 Params:', params);
    
    const [rows] = await geoDB.query(sql, params);
    console.log(`📍 Found ${rows.length} results for "${idea}" in ${barangay}`);

    let result = rows.map(r => ({
      lat: Number(r.lat),
      lon: Number(r.lon),
      barangay_name: r.barangay,
      suitability_score: 0.9,
      business_type: idea,
      business_name: r.business_trade_name,
      is_predicted: false
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));

    return res.json({ 
      success: true, 
      data: result.slice(0, topN),
      total_found: rows.length
    });
  } catch (err) {
    console.error("idea-locations error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/test-idea-mapping", (req, res) => {
  const testIdea = req.query.idea || 'Pizza';
  const result = ideaToDbSearchTerms(testIdea);
  res.json({ 
    input: testIdea,
    result: result,
    functionExists: typeof ideaToDbSearchTerms === 'function'
  });
});

// Add to server.js temporarily
app.get("/api/check-santa-lucia-centroids", requireAuth, async (req, res) => {
  try {
    // Check demographic centroids
    const [demoCentroids] = await geoDB.query(
      `SELECT barangay_name, center_lat, center_lon 
       FROM demographic_pasig 
       WHERE LOWER(TRIM(barangay_name)) LIKE '%santa lucia%'`
    );
    
    // Check actual business coordinates for Santa Lucia
    const [bizCoords] = await geoDB.query(
      `SELECT barangay, 
              MIN(CAST(lat AS DECIMAL(10,7))) as minLat, 
              MAX(CAST(lat AS DECIMAL(10,7))) as maxLat,
              MIN(CAST(lon AS DECIMAL(10,7))) as minLon, 
              MAX(CAST(lon AS DECIMAL(10,7))) as maxLon,
              AVG(CAST(lat AS DECIMAL(10,7))) as avgLat,
              AVG(CAST(lon AS DECIMAL(10,7))) as avgLon,
              COUNT(*) as cnt
       FROM businesses 
       WHERE LOWER(TRIM(barangay)) LIKE '%santa lucia%'
         AND lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'`
    );
    
    res.json({
      demoCentroids,
      businessCoordinates: bizCoords,
      currentBounds: BARANGAY_BOUNDS['santa lucia'],
      currentCentroid: CENTROID_FALLBACK['santa lucia']
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/idea-locations", requireAuth, async (req, res) => {
  try {
    const { idea, barangay, top = 5 } = req.query;
    if (!idea) return res.status(400).json({ success: false, message: "idea required" });

    const topN = Math.min(parseInt(top, 10) || 5, 50);
    const searchTerms = ideaToDbSearchTerms(idea);
    
    let sql = `SELECT id, barangay, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon,
                      business_trade_name, line_of_business
               FROM businesses
               WHERE lat IS NOT NULL AND lon IS NOT NULL
                 AND lat != 'null' AND lon != 'null'`;
    
    const params = [];
    
    // Add search conditions
    if (searchTerms && searchTerms.length > 0) {
      const conditions = searchTerms.map(() => `(LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`).join(' OR ');
      sql += ` AND (${conditions})`;
      searchTerms.forEach(term => {
        params.push(`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`);
      });
    }
    
    sql += ` AND (LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`;
    params.push(`%${idea.toLowerCase()}%`, `%${idea.toLowerCase()}%`);

    // SIMPLE barangay filter - just match the name, no bounds!
    if (barangay) {
      sql += ` AND LOWER(TRIM(barangay)) = LOWER(TRIM(?))`;
      params.push(barangay);
    }

    sql += ` ORDER BY RAND() LIMIT ${Math.min(topN * 3, 100)}`;
    
    const [rows] = await geoDB.query(sql, params);

    let result = rows.map(r => ({
      lat: Number(r.lat),
      lon: Number(r.lon),
      barangay_name: r.barangay,
      suitability_score: 0.9,
      business_type: idea,
      business_name: r.business_trade_name,
      is_predicted: false
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));

    return res.json({ 
      success: true, 
      data: result.slice(0, topN),
      total_found: rows.length
    });
  } catch (err) {
    console.error("idea-locations error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
// ─── DATA FIX: Reassign barangay names based on GPS coordinates ───────────────
app.get("/api/fix-barangay-names", requireAdmin, async (req, res) => {
  try {
    const results = [];
    
    // Loop through all barangay bounds
    for (const [barangayName, bounds] of Object.entries(BARANGAY_BOUNDS)) {
      // Capitalize first letter of each word
      const properName = barangayName.replace(/\b\w/g, c => c.toUpperCase());
      
      // Update businesses whose coordinates fall within this barangay's bounds
      const [updateResult] = await geoDB.query(
        `UPDATE businesses 
         SET barangay = ?
         WHERE CAST(lat AS DECIMAL(10,7)) >= ? 
           AND CAST(lat AS DECIMAL(10,7)) <= ?
           AND CAST(lon AS DECIMAL(10,7)) >= ?
           AND CAST(lon AS DECIMAL(10,7)) <= ?
           AND lat IS NOT NULL AND lon IS NOT NULL
           AND lat <> 'null' AND lon <> 'null'`,
        [properName, bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon]
      );
      
      results.push({
        barangay: properName,
        bounds: bounds,
        businessesUpdated: updateResult.affectedRows
      });
    }
    
    // Count businesses that didn't match any bounds
    const [unmatched] = await geoDB.query(
      `SELECT COUNT(*) as cnt FROM businesses 
       WHERE lat IS NOT NULL AND lon IS NOT NULL 
       AND lat <> 'null' AND lon <> 'null'
       AND barangay NOT IN (?)`,
      [Object.keys(BARANGAY_BOUNDS).map(b => b.replace(/\b\w/g, c => c.toUpperCase()))]
    );
    
    res.json({
      success: true,
      message: 'Barangay names reassigned based on GPS coordinates',
      results: results,
      unmatchedBusinesses: unmatched[0].cnt
    });
    
  } catch (err) {
    console.error("fix-barangay-names error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// ─── DATA FIX: Remove businesses outside Pasig ────────────────────────────────
app.get("/api/fix-outside-pasig", requireAdmin, async (req, res) => {
  try {
    const [result] = await geoDB.query(
      `UPDATE businesses 
       SET barangay = 'Outside Pasig'
       WHERE (CAST(lat AS DECIMAL(10,7)) < ? 
              OR CAST(lat AS DECIMAL(10,7)) > ?
              OR CAST(lon AS DECIMAL(10,7)) < ?
              OR CAST(lon AS DECIMAL(10,7)) > ?)
         AND lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'`,
      [PASIG_BOUNDS.minLat, PASIG_BOUNDS.maxLat, PASIG_BOUNDS.minLon, PASIG_BOUNDS.maxLon]
    );
    
    res.json({
      success: true,
      businessesMarkedOutside: result.affectedRows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DEBUG ROUTES ─────────────────────────────────────────────────────────────
app.get("/api/debug-manggahan", requireAuth, debugRouteRateLimit, async (req, res) => {
  const rawIdea = (req.query.idea || "Restaurant").toString().trim();
  const idea = rawIdea.slice(0, 80).replace(/[^a-zA-Z0-9\s&'().,-]/g, "");
  const barangay = req.query.barangay || "Manggahan";
  try {
    const [barangayNames] = await geoDB.query(`SELECT DISTINCT barangay FROM businesses WHERE barangay LIKE ? LIMIT 10`, [`%${barangay}%`]);
    const [centroid] = await geoDB.query(`SELECT barangay_name, center_lat, center_lon FROM demographic_pasig WHERE barangay_name LIKE ? LIMIT 5`, [`%${barangay}%`]);
    const [bizCount] = await geoDB.query(`SELECT COUNT(*) as cnt FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?))`, [`${normalizeBarangay(barangay)}%`]);
    const [ideaMatch] = await geoDB.query(`SELECT barangay, line_of_business, lat, lon FROM businesses WHERE (line_of_business LIKE ? OR business_trade_name LIKE ?) AND lat IS NOT NULL AND lon IS NOT NULL LIMIT 10`, [`%${idea}%`, `%${idea}%`]);
    const [manggahanBiz] = await geoDB.query(`SELECT DISTINCT line_of_business FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) LIMIT 20`, [`${normalizeBarangay(barangay)}%`]);
    res.json({ barangayNamesInDB: barangayNames, centroidData: centroid, bizCountInBarangay: bizCount[0].cnt, ideaMatchesAnyBiz: ideaMatch, barangayLineOfBusiness: manggahanBiz });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/debug-barangay-check", requireAuth, async (req, res) => {
  try {
    const barangay = req.query.barangay || 'Santa Lucia';
    const [allBarangays] = await geoDB.query(`SELECT DISTINCT barangay, COUNT(*) as cnt FROM businesses WHERE barangay IS NOT NULL AND barangay <> '' GROUP BY barangay ORDER BY barangay`);
    const [matchingBiz] = await geoDB.query(`SELECT barangay, business_trade_name, line_of_business, lat, lon FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) LIMIT 20`, [`%${barangay.toLowerCase()}%`]);
    const [demo] = await geoDB.query(`SELECT barangay_name, center_lat, center_lon FROM demographic_pasig WHERE LOWER(TRIM(barangay_name)) LIKE LOWER(TRIM(?))`, [`%${barangay.toLowerCase()}%`]);
    const santaLuciaBounds = BARANGAY_BOUNDS['santa lucia'];
    let bizInBounds = [];
    if (santaLuciaBounds) {
      [bizInBounds] = await geoDB.query(`SELECT barangay, business_trade_name, line_of_business, lat, lon FROM businesses WHERE CAST(lat AS DECIMAL(10,7)) BETWEEN ? AND ? AND CAST(lon AS DECIMAL(10,7)) BETWEEN ? AND ? LIMIT 20`, [santaLuciaBounds.minLat, santaLuciaBounds.maxLat, santaLuciaBounds.minLon, santaLuciaBounds.maxLon]);
    }
    res.json({ success: true, searchedBarangay: barangay, allBarangaysInDB: allBarangays, matchingBusinesses: matchingBiz, demographicData: demo, santaLuciaBounds: santaLuciaBounds || 'not found', businessesInSantaLuciaBounds: bizInBounds.map(b => ({ barangay: b.barangay, name: b.business_trade_name, line: b.line_of_business, lat: b.lat, lon: b.lon })) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get("/api/debug-idea-search", requireAuth, async (req, res) => {
  try {
    const { idea, barangay } = req.query;
    const searchTerms = ideaToDbSearchTerms(idea);
    let query, params;
    if (searchTerms && searchTerms.length > 0) {
      const likeConditions = searchTerms.map(() => `line_of_business LIKE ?`);
      query = `SELECT barangay, business_trade_name, line_of_business, lat, lon FROM businesses WHERE (${likeConditions.join(' OR ')} OR business_trade_name LIKE ?) AND LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND lat IS NOT NULL AND lon IS NOT NULL LIMIT 20`;
      params = []; searchTerms.forEach(term => params.push(`%${term}%`)); params.push(`%${idea}%`, `%${(barangay || '').toLowerCase()}%`);
    } else {
      query = `SELECT barangay, business_trade_name, line_of_business, lat, lon FROM businesses WHERE (line_of_business LIKE ? OR business_trade_name LIKE ?) AND LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND lat IS NOT NULL AND lon IS NOT NULL LIMIT 20`;
      params = [`%${idea}%`, `%${idea}%`, `%${(barangay || '').toLowerCase()}%`];
    }
    const [exactMatch] = await geoDB.query(query, params);
    const [broadMatch] = await geoDB.query(`SELECT line_of_business, COUNT(*) as cnt FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND line_of_business IS NOT NULL GROUP BY line_of_business ORDER BY cnt DESC LIMIT 30`, [`%${(barangay || '').toLowerCase()}%`]);
    const [categories] = await geoDB.query(`SELECT category, COUNT(*) as cnt FROM businesses WHERE LOWER(TRIM(barangay)) LIKE LOWER(TRIM(?)) AND category IS NOT NULL GROUP BY category ORDER BY cnt DESC`, [`%${(barangay || '').toLowerCase()}%`]);
    res.json({ idea, barangay, searchTerms, exactMatches: exactMatch, broadMatches: broadMatch, categories: categories });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get("/geo-test", async (req, res) => {
  try { const [rows] = await geoDB.query("SELECT 1 AS test"); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/debug-session", (req, res) => {
  res.json({ authenticated: !!req.session.user, user: req.session.user || null, isAdmin: req.session.user?.role === "admin", adminDashboardPath });
});

// ─── REPORT LOGGING ROUTES ────────────────────────────────────────────────────
app.post("/api/report/search-pin", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { query, source, lat, lon } = req.body;
    await legendDB.query(`INSERT INTO search_pin_history (user_id, query, pinned_item_id, pinned_item_type, is_pinned, created_at) VALUES (?, ?, NULL, 'location', ?, NOW())`, [userId, query || null, (source === 'map_click' || source === 'drag') ? 1 : 0]);
    res.json({ success: true });
  } catch (err) { console.error("search-pin report error:", err); res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/report/recommendation", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { idea, area, lat, lon } = req.body;
    await legendDB.query(`INSERT INTO recommendation_history (user_id, recommended_item_id, recommended_item_type, source, was_clicked, created_at) VALUES (?, ?, 'business_idea', ?, 1, NOW())`, [userId, idea || null, area || null]);
    res.json({ success: true });
  } catch (err) { console.error("recommendation report error:", err); res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/report/saved", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { action, business_type, barangay, lat, lon } = req.body;
    const wasRemoved = action === 'removed' ? 1 : 0;
    await legendDB.query(`INSERT INTO saved_history (user_id, business_type, barangay, suitability_score, lat, lon, saved_at, was_removed, removed_at) VALUES (?, ?, ?, NULL, ?, ?, NOW(), ?, ?)`, [userId, business_type || null, barangay || null, lat ? parseFloat(lat) : null, lon ? parseFloat(lon) : null, wasRemoved, wasRemoved ? new Date() : null]);
    res.json({ success: true });
  } catch (err) { console.error("saved report error:", err); res.status(500).json({ success: false, message: err.message }); }
});

// ─── ADMIN REPORT HISTORY ROUTES ──────────────────────────────────────────────
app.get("/api/admin/report/search-pins", requireAdmin, async (req, res) => {
  try { const [rows] = await legendDB.query(`SELECT s.*, u.username, u.fullname FROM search_pin_history s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC LIMIT 200`); res.json({ success: true, data: rows }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.get("/api/admin/report/recommendations", requireAdmin, async (req, res) => {
  try { const [rows] = await legendDB.query(`SELECT r.*, u.username, u.fullname FROM recommendation_history r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC LIMIT 200`); res.json({ success: true, data: rows }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.get("/api/admin/report/saved", requireAdmin, async (req, res) => {
  try { const [rows] = await legendDB.query(`SELECT s.*, u.username, u.fullname FROM saved_history s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.saved_at DESC LIMIT 200`); res.json({ success: true, data: rows }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use(express.static(frontendPath));
app.use("/dashboard", express.static(dashboardPath));
app.use("/admin", express.static(adminDashboardPath));
app.use("/admindashboard", express.static(adminDashboardPath));

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("Admin dashboard: http://localhost:3000/admin");
});