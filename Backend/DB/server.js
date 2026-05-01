const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
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

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeBarangay(v) {
  return (v || "").toString().trim().toLowerCase();
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

function zscores(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length || 1);
  const std = Math.sqrt(variance) || 1;
  return arr.map(v => (v - mean) / std);
}

function prefWeights() {
  return {
    totalpop: 1,
    popdensity: 1,
    agedist: 1,
    gender: 1,
    income: 1,
    bizcount: -1,
    competitors: -1,
    bizdensity: 1
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
             WHERE LOWER(TRIM(barangay)) = LOWER(TRIM(?)) AND (`;
  const params = [barangay];
  
  const conditions = keywords.map(() => `(LOWER(line_of_business) LIKE ? OR LOWER(business_trade_name) LIKE ?)`);
  sql += conditions.join(' OR ') + ')';
  
  keywords.forEach(kw => {
    params.push(`%${kw}%`, `%${kw}%`);
  });
  
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

const pendingVerifications = new Map();
const pendingPasswordResets = new Map();

const TYPE_TO_CATEGORY = {
  FOOD: "Food & Beverage",
  RETAIL: "Retail & Trading",
  PERSONAL: "Beauty & Wellness",
  TECH: "IT & Software",
  WHOLESALE: "Wholesale & Import",
  MANUFACTURING: "Manufacturing",
  IT: "IT & Software",
  BPO: "BPO & Call Center",
  CONSTRUCTION: "Construction",
  FINANCE: "Finance & Banking",
  EDUCATION: "Education",
  HEALTHCARE: "Healthcare",
  ENERGY: "Energy & Fuel",
  LOGISTICS: "Logistics & Transport",
  HOSPITALITY: "Hospitality",
  SECURITY: "Security",
  LEGAL: "Legal & Consulting",
  MARKETING: "Marketing & Advertising",
  ADMIN: "HR & Manpower",
  GENERAL: "General Services"
};

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
      fullname, email, username, hashedPassword: hashed, affiliation, industry: industry || null, industry_specific: industry_specific || null, code, codeExpiresAt: expiry
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
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      username: user.username,
      affiliation: user.affiliation,
      industry: user.industry || '',
      industry_specific: user.industry_specific || '',
      role: user.role || "user"
    };

    const redirectUrl = user.role === "admin" ? "/admin" : "/dashboard";
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
    res.redirect("/");
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

app.get("/api/user-profile", requireAuth, async (req, res) => {
  try {
    const [rows] = await legendDB.query(
      "SELECT id, fullname, email, username, affiliation, role FROM users WHERE id = ?",
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
    const { fullname, email, username, password, affiliation } = req.body;
    const userId = req.session.user.id;

    const [existing] = await legendDB.query(
      "SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?",
      [email, username, userId]
    );
    if (existing.length > 0) return res.status(400).json({ success: false, message: "Email or username already in use" });

    let updateFields = [fullname, email, username, affiliation];
    let updateQuery = "UPDATE users SET fullname = ?, email = ?, username = ?, affiliation = ?";

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ", password = ?";
      updateFields.push(hashedPassword);
    }

    updateQuery += " WHERE id = ?";
    updateFields.push(userId);

    await legendDB.query(updateQuery, updateFields);

    const [updatedRows] = await legendDB.query(
      "SELECT id, fullname, email, username, affiliation, role FROM users WHERE id = ?",
      [userId]
    );

    req.session.user = { ...req.session.user, ...updatedRows[0], role: updatedRows[0].role };
    return res.status(200).json({ success: true, message: "Profile updated successfully", user: updatedRows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/check-auth", (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    isAdmin: req.session.user.role === "admin",
    user: {
      id: req.session.user.id,
      fullname: req.session.user.fullname,
      username: req.session.user.username,
      role: req.session.user.role
    }
  });
});

app.get("/api/nearest-barangay", requireAuth, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ success: false, message: "lat/lon required" });

    const clickLat = Number(lat);
    const clickLon = Number(lon);

    const [barangays] = await geoDB.query(
      `SELECT barangay_name, center_lat, center_lon 
       FROM demographic_pasig 
       WHERE center_lat IS NOT NULL AND center_lon IS NOT NULL`
    );

    if (barangays.length === 0) {
      return res.json({ success: false, message: "No barangay centers found." });
    }

    let nearestBarangay = null;
    let minDist = Infinity;

    barangays.forEach(row => {
      const dist = haversineMeters(clickLat, clickLon, Number(row.center_lat), Number(row.center_lon));
      if (dist < minDist) {
        minDist = dist;
        nearestBarangay = row.barangay_name;
      }
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
      `SELECT barangay_name, population, population_density, highest_age_group, 
              avg_income_min, avg_income_max, gender_distribution
       FROM demographic_pasig
       WHERE LOWER(TRIM(barangay_name)) = LOWER(TRIM(?))`,
      [barangay]
    );

    const demo = demoRows.length > 0 ? demoRows[0] : null;

    const [bizCountRows] = await geoDB.query(
      `SELECT COUNT(*) AS total FROM businesses WHERE LOWER(TRIM(barangay)) = LOWER(TRIM(?))`,
      [barangay]
    );
    const totalBusinesses = bizCountRows[0]?.total || 0;

    let sameLineCount = 0;
    if (line_of_business) {
      const [sameLineRows] = await geoDB.query(
        `SELECT COUNT(*) AS cnt FROM businesses 
         WHERE LOWER(TRIM(barangay)) = LOWER(TRIM(?)) 
         AND line_of_business = ?`,
        [barangay, line_of_business]
      );
      sameLineCount = sameLineRows[0]?.cnt || 0;
    }

    res.json({
      success: true,
      data: { demographic: demo, totalBusinesses, sameLineCount, lineOfBusiness: line_of_business || null }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SAVED RECOMMENDATIONS ──────────────────────────────────────────────────
// FIX: All saved_recommendations queries now use legendDB (legendsss_db),
//      which is where the table actually lives per your phpMyAdmin screenshot.

app.get("/api/saved-recommendations", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await legendDB.query(
      `SELECT id, business_type, barangay, suitability_score, lat, lon, saved_at
       FROM saved_recommendations
       WHERE user_id = ?
       ORDER BY saved_at DESC`,
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

    if (!business_type) {
      return res.status(400).json({ success: false, message: "business_type is required" });
    }

    const latVal = (lat !== null && lat !== undefined && lat !== '') ? parseFloat(lat) : null;
    const lonVal = (lon !== null && lon !== undefined && lon !== '') ? parseFloat(lon) : null;
    const barangayVal = (barangay && barangay.trim()) ? barangay.trim() : null;

    // FIX: Use IS NULL safe comparison so NULL barangay duplicate-check works correctly
    let existing;
    if (barangayVal === null) {
      [existing] = await legendDB.query(
        `SELECT id FROM saved_recommendations 
         WHERE user_id = ? AND business_type = ? AND barangay IS NULL`,
        [userId, business_type]
      );
    } else {
      [existing] = await legendDB.query(
        `SELECT id FROM saved_recommendations 
         WHERE user_id = ? AND business_type = ? AND LOWER(TRIM(barangay)) = LOWER(TRIM(?))`,
        [userId, business_type, barangayVal]
      );
    }

    if (existing.length > 0) {
      return res.json({ success: false, message: "Already saved" });
    }

    const [result] = await legendDB.query(
      `INSERT INTO saved_recommendations (user_id, business_type, barangay, suitability_score, lat, lon)
       VALUES (?, ?, ?, ?, ?, ?)`,
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
    const [result] = await legendDB.query(
      "DELETE FROM saved_recommendations WHERE id = ? AND user_id = ?",
      [req.params.id, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Saved recommendation not found" });
    }
    res.json({ success: true, message: "Removed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN SAVED STATS ───────────────────────────────────────────────────────
// FIX: Also moved to legendDB since saved_recommendations is there

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [userCount] = await legendDB.query("SELECT COUNT(*) as total FROM users WHERE role != 'admin'");
    const totalUsers = userCount[0].total;

    const [affiliations] = await legendDB.query(`
      SELECT 
        SUM(CASE WHEN affiliation = 'Entrepreneur' THEN 1 ELSE 0 END) as entrepreneur,
        SUM(CASE WHEN affiliation = 'Aspiring Entrepreneur' THEN 1 ELSE 0 END) as aspiring
      FROM users
    `);

    const entrepreneur = parseInt(affiliations[0].entrepreneur) || 0;
    const aspiring = parseInt(affiliations[0].aspiring) || 0;
    const totalAffiliation = entrepreneur + aspiring;

    const entrepreneurPct = totalAffiliation > 0 ? Math.round((entrepreneur / totalAffiliation) * 100) : 0;
    const aspiringPct = totalAffiliation > 0 ? Math.round((aspiring / totalAffiliation) * 100) : 0;

    res.json({ 
      success: true, 
      totalUsers, 
      entrepreneurPct, 
      aspiringPct,
      entrepreneurCount: entrepreneur,
      aspiringCount: aspiring
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/saved-stats", requireAdmin, async (req, res) => {
  try {
    const [stats] = await legendDB.query(`
      SELECT 
        COALESCE(business_type, 'Unknown') as business_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM saved_recommendations), 1) as percentage
      FROM saved_recommendations
      GROUP BY business_type
      ORDER BY count DESC
      LIMIT 4
    `);
    res.json({ success: true, stats });
  } catch (err) {
    res.json({ success: true, stats: [] });
  }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

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

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push("(business_trade_name LIKE ? OR business_address LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      whereClauses.push("category = ?");
      params.push(category);
    }
    if (barangay) {
      whereClauses.push("barangay = ?");
      params.push(barangay);
    }

    const whereSQL = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

    const [countResult] = await geoDB.query(`SELECT COUNT(*) as total FROM businesses ${whereSQL}`, params);
    const total = countResult[0].total;

    const [businesses] = await geoDB.query(
      `SELECT 
        b.id, b.business_trade_name, b.line_of_business, 
        b.category, b.barangay, b.street, b.business_address, b.lat, b.lon,
        d.population, d.population_density, d.avg_income_min, d.avg_income_max
      FROM businesses b
      LEFT JOIN demographic_pasig d ON b.barangay_id = d.id
      ${whereSQL}
      ORDER BY b.id DESC
      LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: businesses,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
  try {
    const [business] = await geoDB.query(
      `SELECT b.*, d.id as demographic_id
       FROM businesses b
       LEFT JOIN demographic_pasig d ON b.barangay_id = d.id
       WHERE b.id = ?`,
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
      `INSERT INTO businesses 
       (business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon, barangay_id)
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
      `UPDATE businesses SET 
        business_trade_name = COALESCE(?, business_trade_name),
        line_of_business = COALESCE(?, line_of_business),
        category = COALESCE(?, category),
        barangay = COALESCE(?, barangay),
        street = COALESCE(?, street),
        business_address = COALESCE(?, business_address),
        lat = COALESCE(?, lat),
        lon = COALESCE(?, lon),
        barangay_id = COALESCE(?, barangay_id)
       WHERE id = ?`,
      [business_trade_name || null, line_of_business || null, category || null, barangay || null, street || null, business_address || null, lat || null, lon || null, barangay_id, req.params.id]
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
    const [demographics] = await geoDB.query(`
      SELECT 
        id, barangay_name, population, population_density,
        highest_age_group, avg_income_min, avg_income_max,
        gender_distribution
      FROM demographic_pasig
      ORDER BY barangay_name
    `);
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
      `INSERT INTO demographic_pasig 
       (barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution)
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
      `UPDATE demographic_pasig SET 
        barangay_name = COALESCE(?, barangay_name),
        population = COALESCE(?, population),
        population_density = COALESCE(?, population_density),
        highest_age_group = COALESCE(?, highest_age_group),
        avg_income_min = COALESCE(?, avg_income_min),
        avg_income_max = COALESCE(?, avg_income_max),
        gender_distribution = COALESCE(?, gender_distribution)
       WHERE id = ?`,
      [barangay_name || null, population || null, population_density || null, highest_age_group || null, avg_income_min || null, avg_income_max || null, gender_distribution || null, req.params.id]
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

app.get("/api/ideas", requireAuth, async (req, res) => {
  try {
    const { category, barangay, top = 3, prefs = "" } = req.query;
    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const weights = prefWeights();

    let sql = `SELECT line_of_business AS name, COUNT(*) AS cnt
               FROM businesses
               WHERE line_of_business IS NOT NULL AND line_of_business <> ''`;
    const params = [];

    if (category) {
      const mappedCategory = TYPE_TO_CATEGORY[category] || category;
      sql += " AND category = ?";
      params.push(mappedCategory);
    }

    if (barangay) {
      sql += " AND barangay = ?";
      params.push(barangay);
    }

    sql += " GROUP BY line_of_business ORDER BY cnt DESC";

    const [ideaRows] = await geoDB.query(sql, params);
    if (!ideaRows.length) return res.json({ success: true, data: [] });

    // ── Sub-category saturation check ──────────────────────────────────
    const userSubCategory = (req.session.user?.industry_specific || '').trim();
    const ownBarangay = barangay || '';
    let userSubCategoryIdea = null;
    let filteredIdeaRows = ideaRows;

    if (userSubCategory && ownBarangay) {
      const saturated = await isSubCategorySaturated(ownBarangay, userSubCategory);
      const subKw = userSubCategory.toLowerCase();
      const keywords = subKw.split(/\s+/).filter(w => w.length > 2);
            if (!saturated) {
        userSubCategoryIdea = ideaRows.find(row => {
          const name = (row.name || '').toLowerCase();
          return keywords.some(kw => name.includes(kw));
        });
        if (userSubCategoryIdea) {
          filteredIdeaRows = ideaRows.filter(row => row !== userSubCategoryIdea);
        } else {
          // No match in DB but not saturated — create synthetic idea
          userSubCategoryIdea = { name: userSubCategory };
        }
      } else {
        filteredIdeaRows = ideaRows.filter(row => {
          const name = (row.name || '').toLowerCase();
          return !keywords.some(kw => name.includes(kw));
        });
      }
    }

    if (!filteredIdeaRows.length && !userSubCategoryIdea) {
      return res.json({ success: true, data: [] });
    }

    if (!prefList.length) {
      let result = [];
      if (userSubCategoryIdea) {
        result.push(userSubCategoryIdea.name);
      }
      const remaining = filteredIdeaRows.slice(0, parseInt(top) - result.length).map(r => r.name);
      result = result.concat(remaining);
      return res.json({ success: true, data: result.slice(0, parseInt(top)) });
    }

    const ideas = filteredIdeaRows.map(r => r.name);
    if (userSubCategoryIdea && !ideas.includes(userSubCategoryIdea.name)) {
      ideas.unshift(userSubCategoryIdea.name);
    }
    const [allBiz] = await geoDB.query(
      `SELECT barangay, line_of_business, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon
       FROM businesses
       WHERE lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'
         AND CAST(lat AS DECIMAL(10,7)) BETWEEN ? AND ?
         AND CAST(lon AS DECIMAL(10,7)) BETWEEN ? AND ?`,
      [PASIG_BOUNDS.minLat, PASIG_BOUNDS.maxLat, PASIG_BOUNDS.minLon, PASIG_BOUNDS.maxLon]
    );

    const [demoRows] = await geoDB.query(
      `SELECT barangay_name, population, population_density, avg_income_max, gender_distribution, highest_age_group
       FROM demographic_pasig`
    );
    const demoMap = {};
    demoRows.forEach(d => demoMap[normalizeBarangay(d.barangay_name)] = d);

    const [totBizRows] = await geoDB.query(`SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`);
    const totalBizMap = {};
    totBizRows.forEach(r => totalBizMap[normalizeBarangay(r.barangay)] = Number(r.cnt) || 0);

    const centroidMap = {};
    allBiz.forEach(b => {
      const key = normalizeBarangay(b.barangay);
      const lat = Number(b.lat);
      const lon = Number(b.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (!centroidMap[key]) centroidMap[key] = { lat: 0, lon: 0, n: 0 };
      centroidMap[key].lat += lat;
      centroidMap[key].lon += lon;
      centroidMap[key].n += 1;
    });

    Object.keys(centroidMap).forEach(k => {
      centroidMap[k].lat /= centroidMap[k].n;
      centroidMap[k].lon /= centroidMap[k].n;
    });

    const radius = 500;
    const ideaScores = [];

    if (barangay) {
      const bKey = normalizeBarangay(barangay);
      const c = centroidMap[bKey];
      const demo = demoMap[bKey] || {};
      const totalBiz = totalBizMap[bKey] || 0;
      const bizDensity = demo.population ? totalBiz / (Number(demo.population) / 1000) : 0;

      ideas.forEach(name => {
        const ideaBiz = allBiz.filter(b => b.line_of_business === name && normalizeBarangay(b.barangay) === bKey);
        const bizcount = ideaBiz.length;
        let competitors = 0;

        if (c) {
          ideaBiz.forEach(b => {
            const d = haversineMeters(c.lat, c.lon, Number(b.lat), Number(b.lon));
            if (d <= radius) competitors += 1;
          });
        }

        ideaScores.push({
          name,
          totalpop: Number(demo.population) || 0,
          popdensity: Number(demo.population_density) || 0,
          income: Number(demo.avg_income_max) || 0,
          gender: demo.gender_distribution === "Female" ? 1 : 0,
          agedist: ageScore(demo.highest_age_group),
          bizdensity: bizDensity,
          bizcount,
          competitors
        });
      });
    } else {
      ideas.forEach(name => {
        let bestObj = null;

        Object.keys(centroidMap).forEach(bgy => {
          const c = centroidMap[bgy];
          const demo = demoMap[bgy] || {};
          const totalBiz = totalBizMap[bgy] || 0;
          const bizDensity = demo.population ? totalBiz / (Number(demo.population) / 1000) : 0;

          const ideaBiz = allBiz.filter(b => b.line_of_business === name && normalizeBarangay(b.barangay) === bgy);
          const bizcount = ideaBiz.length;

          let competitors = 0;
          ideaBiz.forEach(b => {
            const d = haversineMeters(c.lat, c.lon, Number(b.lat), Number(b.lon));
            if (d <= radius) competitors += 1;
          });

          const obj = {
            name,
            totalpop: Number(demo.population) || 0,
            popdensity: Number(demo.population_density) || 0,
            income: Number(demo.avg_income_max) || 0,
            gender: demo.gender_distribution === "Female" ? 1 : 0,
            agedist: ageScore(demo.highest_age_group),
            bizdensity: bizDensity,
            bizcount,
            competitors
          };

          if (!bestObj || obj.competitors < bestObj.competitors) bestObj = obj;
        });

        if (bestObj) ideaScores.push(bestObj);
      });
    }

    const finalScores = ideaScores.map(i => ({ name: i.name, score: 0 }));

    prefList.forEach(pref => {
      const values = ideaScores.map(i => Number(i[pref]) || 0);
      const z = zscores(values);
      z.forEach((val, idx) => {
        finalScores[idx].score += (weights[pref] || 0) * val;
      });
    });

    finalScores.sort((a, b) => b.score - a.score);
    return res.json({ success: true, data: finalScores.slice(0, parseInt(top)).map(r => r.name) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/ideas-by-point", requireAuth, async (req, res) => {
  try {
    const { lat, lon, category, top = 3, prefs = "" } = req.query;
    if (!lat || !lon) return res.status(400).json({ success: false, message: "lat/lon required" });

    const latNum = Number(lat);
    const lonNum = Number(lon);

    const inPasig =
      latNum >= PASIG_BOUNDS.minLat &&
      latNum <= PASIG_BOUNDS.maxLat &&
      lonNum >= PASIG_BOUNDS.minLon &&
      lonNum <= PASIG_BOUNDS.maxLon;

    if (!inPasig) {
      return res.json({ success: true, data: [] });
    }

    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const weights = prefWeights();

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

    // ── Sub-category saturation check ──────────────────────────────────
    const userSubCategory = (req.session.user?.industry_specific || '').trim();
    let userSubCategoryIdea = null;
    let filteredIdeaRows = ideaRows;

    if (userSubCategory) {
      const nearestBrgy = await (async () => {
        try {
          const [barangays] = await geoDB.query(
            `SELECT barangay_name, center_lat, center_lon 
             FROM demographic_pasig 
             WHERE center_lat IS NOT NULL AND center_lon IS NOT NULL`
          );
          let nearest = null;
          let minDist = Infinity;
          barangays.forEach(row => {
            const dist = haversineMeters(latNum, lonNum, Number(row.center_lat), Number(row.center_lon));
            if (dist < minDist) { minDist = dist; nearest = row.barangay_name; }
          });
          return nearest || '';
        } catch { return ''; }
      })();

      if (nearestBrgy) {
        const saturated = await isSubCategorySaturated(nearestBrgy, userSubCategory);
        const subKw = userSubCategory.toLowerCase();
        const keywords = subKw.split(/\s+/).filter(w => w.length > 2);
        if (!saturated) {
          userSubCategoryIdea = ideaRows.find(row => {
            const name = (row.name || '').toLowerCase();
            return keywords.some(kw => name.includes(kw));
          });
          if (userSubCategoryIdea) {
            filteredIdeaRows = ideaRows.filter(row => row !== userSubCategoryIdea);
          } else {
            // No match in DB but not saturated — create synthetic idea
            userSubCategoryIdea = { name: userSubCategory };
          }
        } else {
          filteredIdeaRows = ideaRows.filter(row => {
            const name = (row.name || '').toLowerCase();
            return !keywords.some(kw => name.includes(kw));
          });
        }
      }
    }

    if (!filteredIdeaRows.length && !userSubCategoryIdea) {
      return res.json({ success: true, data: [] });
    }

    if (!prefList.length) {
      let result = [];
      if (userSubCategoryIdea) {
        result.push(userSubCategoryIdea.name);
      }
      const remaining = filteredIdeaRows.slice(0, parseInt(top) - result.length).map(r => r.name);
      result = result.concat(remaining);
      return res.json({ success: true, data: result.slice(0, parseInt(top)) });
    }

    const ideas = filteredIdeaRows.map(r => r.name);
    if (userSubCategoryIdea && !ideas.includes(userSubCategoryIdea.name)) {
      ideas.unshift(userSubCategoryIdea.name);
    }

    const [allBiz] = await geoDB.query(
      `SELECT barangay, line_of_business, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon
       FROM businesses
       WHERE lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'
         AND CAST(lat AS DECIMAL(10,7)) BETWEEN ? AND ?
         AND CAST(lon AS DECIMAL(10,7)) BETWEEN ? AND ?`,
      [PASIG_BOUNDS.minLat, PASIG_BOUNDS.maxLat, PASIG_BOUNDS.minLon, PASIG_BOUNDS.maxLon]
    );

    const [demoRows] = await geoDB.query(
      `SELECT barangay_name, population, population_density, avg_income_max, gender_distribution, highest_age_group
       FROM demographic_pasig`
    );
    const demoMap = {};
    demoRows.forEach(d => demoMap[normalizeBarangay(d.barangay_name)] = d);

    const [totBizRows] = await geoDB.query(`SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`);
    const totalBizMap = {};
    totBizRows.forEach(r => totalBizMap[normalizeBarangay(r.barangay)] = Number(r.cnt) || 0);

    const centroidMap = {};
    allBiz.forEach(b => {
      const key = normalizeBarangay(b.barangay);
      const latN = Number(b.lat);
      const lonN = Number(b.lon);
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

    let nearestBarangay = null;
    let minDist = Infinity;
    Object.keys(centroidMap).forEach(b => {
      const c = centroidMap[b];
      const d = haversineMeters(Number(lat), Number(lon), c.lat, c.lon);
      if (d < minDist) {
        minDist = d;
        nearestBarangay = b;
      }
    });

    const radius = 500;
    const ideaScores = [];

    ideas.forEach(name => {
      const ideaBiz = allBiz.filter(b => b.line_of_business === name);

      let competitors = 0;
      ideaBiz.forEach(b => {
        const d = haversineMeters(Number(lat), Number(lon), Number(b.lat), Number(b.lon));
        if (d <= radius) competitors += 1;
      });

      const demo = demoMap[nearestBarangay] || {};
      const totalBiz = totalBizMap[nearestBarangay] || 0;
      const bizDensity = demo.population ? totalBiz / (Number(demo.population) / 1000) : 0;

      ideaScores.push({
        name,
        totalpop: Number(demo.population) || 0,
        popdensity: Number(demo.population_density) || 0,
        income: Number(demo.avg_income_max) || 0,
        gender: demo.gender_distribution === "Female" ? 1 : 0,
        agedist: ageScore(demo.highest_age_group),
        bizdensity: bizDensity,
        bizcount: ideaBiz.filter(b => normalizeBarangay(b.barangay) === nearestBarangay).length,
        competitors
      });
    });

    if (!prefList.length) {
      const values = ideaScores.map(i => Number(i.competitors) || 0);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const ranked = ideaScores
        .map(i => ({ name: i.name, score: (max - i.competitors) / ((max - min) || 1) }))
        .sort((a, b) => b.score - a.score);

      return res.json({ success: true, data: ranked.slice(0, parseInt(top)).map(r => r.name) });
    }

    const finalScores = ideaScores.map(i => ({ name: i.name, score: 0 }));
    prefList.forEach(pref => {
      const values = ideaScores.map(i => Number(i[pref]) || 0);
      const z = zscores(values);
      z.forEach((val, idx) => {
        finalScores[idx].score += (weights[pref] || 0) * val;
      });
    });

    finalScores.sort((a, b) => b.score - a.score);
    return res.json({ success: true, data: finalScores.slice(0, parseInt(top)).map(r => r.name) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/idea-locations", requireAuth, async (req, res) => {
  try {
    const { idea, barangay, top = 5, prefs = "" } = req.query;
    if (!idea) return res.status(400).json({ success: false, message: "idea required" });

    const topN = Math.max(1, parseInt(top, 10) || 5);
    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const weights = prefWeights();

    const [ideaRowsRaw] = await geoDB.query(
      `SELECT barangay, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon
       FROM businesses
       WHERE line_of_business = ?
         AND lat IS NOT NULL AND lon IS NOT NULL
         AND lat <> 'null' AND lon <> 'null'`,
      [idea]
    );

    let allSql = `
      SELECT barangay, CAST(lat AS DECIMAL(10,7)) AS lat, CAST(lon AS DECIMAL(10,7)) AS lon
      FROM businesses
      WHERE lat IS NOT NULL AND lon IS NOT NULL
        AND lat <> 'null' AND lon <> 'null'`;
    const allParams = [];

    if (barangay) {
      allSql += ` AND LOWER(TRIM(barangay)) = LOWER(TRIM(?))`;
      allParams.push(barangay);
    }

    const [allRowsRaw] = await geoDB.query(allSql, allParams);

    const inPasig = (lat, lon) =>
      lat >= PASIG_BOUNDS.minLat &&
      lat <= PASIG_BOUNDS.maxLat &&
      lon >= PASIG_BOUNDS.minLon &&
      lon <= PASIG_BOUNDS.maxLon;

    const ideaRows = ideaRowsRaw
      .map(r => ({ barangay: r.barangay, lat: Number(r.lat), lon: Number(r.lon) }))
      .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && inPasig(r.lat, r.lon));

    let candidates = allRowsRaw
      .map(r => ({ barangay_name: r.barangay, lat: Number(r.lat), lon: Number(r.lon) }))
      .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && inPasig(r.lat, r.lon));

    candidates = dedupeByLatLon(candidates, 5);

    if (!candidates.length) {
      return res.json({ success: true, data: [] });
    }

    const [demoRows] = await geoDB.query(
      `SELECT barangay_name, population, population_density, avg_income_max, gender_distribution, highest_age_group
       FROM demographic_pasig`
    );
    const demoMap = {};
    demoRows.forEach(d => (demoMap[normalizeBarangay(d.barangay_name)] = d));

    const [totBizRows] = await geoDB.query(
      `SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`
    );
    const totalBizMap = {};
    totBizRows.forEach(r => (totalBizMap[normalizeBarangay(r.barangay)] = Number(r.cnt) || 0));

    const radius = 500;

    candidates.forEach(c => {
      let cnt = 0;
      ideaRows.forEach(b => {
        const d = haversineMeters(c.lat, c.lon, b.lat, b.lon);
        if (d <= radius) cnt += 1;
      });

      const drow = demoMap[normalizeBarangay(c.barangay_name)] || {};
      c.competitors = cnt;
      c.totalpop = Number(drow.population) || 0;
      c.popdensity = Number(drow.population_density) || 0;
      c.income = Number(drow.avg_income_max) || 0;
      c.gender = drow.gender_distribution === "Female" ? 1 : 0;
      c.agedist = ageScore(drow.highest_age_group);

      const totalBiz = totalBizMap[normalizeBarangay(c.barangay_name)] || 0;
      c.bizdensity = c.totalpop ? totalBiz / (c.totalpop / 1000) : 0;
      c.bizcount = ideaRows.filter(
        b => normalizeBarangay(b.barangay) === normalizeBarangay(c.barangay_name)
      ).length;
    });

    if (!prefList.length) {
      const values = candidates.map(c => Number(c.competitors) || 0);
      const max = Math.max(...values);
      const min = Math.min(...values);
      candidates = candidates.map(c => {
        const denom = (max - min) || 1;
        const score = (max - c.competitors) / denom;
        return { ...c, score };
      });
    }

    let ranked = [];
    if (!prefList.length) {
      ranked = [...candidates].sort((a, b) => b.score - a.score);
    } else {
      const scoreArr = candidates.map(c => ({ ...c, score: 0 }));
      prefList.forEach(pref => {
        const values = scoreArr.map(i => Number(i[pref]) || 0);
        const z = zscores(values);
        z.forEach((val, idx) => {
          scoreArr[idx].score += (weights[pref] || 0) * val;
        });
      });
      ranked = scoreArr.sort((a, b) => b.score - a.score);
    }

    const minGapMeters = 120;
    const chosen = [];
    for (const p of ranked) {
      const farEnough = chosen.every(c => haversineMeters(c.lat, c.lon, p.lat, p.lon) >= minGapMeters);
      if (farEnough) chosen.push(p);
      if (chosen.length >= topN) break;
    }

    if (chosen.length < topN) {
      for (const p of ranked) {
        const exists = chosen.some(c => c.lat === p.lat && c.lon === p.lon);
        if (!exists) chosen.push(p);
        if (chosen.length >= topN) break;
      }
    }

    const jitterMeters = 35;
    const jitterDegLat = jitterMeters / 111111;
    const jitterDegLon = jitterMeters / (111111 * Math.cos(14.58 * Math.PI / 180));

    while (chosen.length < topN && chosen.length > 0) {
      const base = chosen[chosen.length % chosen.length];
      const lat = base.lat + (Math.random() * 2 - 1) * jitterDegLat;
      const lon = base.lon + (Math.random() * 2 - 1) * jitterDegLon;
      if (inPasig(lat, lon)) chosen.push({ ...base, lat, lon });
    }

    return res.json({ success: true, data: chosen.slice(0, topN) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/geo-test", async (req, res) => {
  try {
    const [rows] = await geoDB.query("SELECT 1 AS test");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug-session", (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    user: req.session.user || null,
    isAdmin: req.session.user?.role === "admin",
    adminDashboardPath
  });
});
// ─── REPORT LOGGING ROUTES ───────────────────────────────────────────────────

app.post("/api/report/search-pin", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { query, source, lat, lon } = req.body;

    await legendDB.query(
      `INSERT INTO search_pin_history (user_id, query, pinned_item_id, pinned_item_type, is_pinned, created_at)
       VALUES (?, ?, NULL, 'location', ?, NOW())`,
      [userId, query || null, (source === 'map_click' || source === 'drag') ? 1 : 0]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("search-pin report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/report/recommendation", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { idea, area, lat, lon } = req.body;

    await legendDB.query(
      `INSERT INTO recommendation_history (user_id, recommended_item_id, recommended_item_type, source, was_clicked, created_at)
       VALUES (?, ?, 'business_idea', ?, 1, NOW())`,
      [userId, idea || null, area || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("recommendation report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/report/saved", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { action, business_type, barangay, lat, lon } = req.body;

    const wasRemoved = action === 'removed' ? 1 : 0;

    await legendDB.query(
      `INSERT INTO saved_history (user_id, business_type, barangay, suitability_score, lat, lon, saved_at, was_removed, removed_at)
       VALUES (?, ?, ?, NULL, ?, ?, NOW(), ?, ?)`,
      [
        userId,
        business_type || null,
        barangay || null,
        lat ? parseFloat(lat) : null,
        lon ? parseFloat(lon) : null,
        wasRemoved,
        wasRemoved ? new Date() : null
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("saved report error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// ─── ADMIN REPORT HISTORY ROUTES ─────────────────────────────────────────────

app.get("/api/admin/report/search-pins", requireAdmin, async (req, res) => {
  try {
    const [rows] = await legendDB.query(`
      SELECT s.*, u.username, u.fullname
      FROM search_pin_history s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/report/recommendations", requireAdmin, async (req, res) => {
  try {
    const [rows] = await legendDB.query(`
      SELECT r.*, u.username, u.fullname
      FROM recommendation_history r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/admin/report/saved", requireAdmin, async (req, res) => {
  try {
    const [rows] = await legendDB.query(`
      SELECT s.*, u.username, u.fullname
      FROM saved_history s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.saved_at DESC
      LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use(express.static(frontendPath));
app.use("/dashboard", express.static(dashboardPath));
app.use("/admin", express.static(adminDashboardPath));
app.use("/admindashboard", express.static(adminDashboardPath));

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log("Admin dashboard: http://localhost:3000/admin");
});