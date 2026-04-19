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



function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResetCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "ballesterosyther1@gmail.com",
        pass: "fsvq erkw plhi qwez"
    }
});

async function sendVerificationCode(email, username, code) {
    try {
        await transporter.sendMail({
            from: "ballesterosyther1@gmail.com",
            to: email,
            subject: "Email Verification Code",
            html: `<p>Hello ${username},</p><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
        });
    } catch (err) {
        console.error("Email sending error:", err);
        throw err;
    }
}


function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Admin access required" });
    }
    next();
}

const pendingVerifications = new Map();
const pendingPasswordResets = new Map();

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "login.html"));
});

app.post("/register", async (req, res) => {
    try {
        const { fullname, email, username, password, affiliation } = req.body;

        const [existing] = await legendDB.query(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            [email, username]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: "Email or username already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const code = generateVerificationCode();

        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 10);

        const tempId = crypto.randomBytes(16).toString("hex");

        pendingVerifications.set(tempId, {
            fullname,
            email,
            username,
            hashedPassword: hashed,
            affiliation,
            code,
            codeExpiresAt: expiry
        });

        await sendVerificationCode(email, username, code);

        res.json({ success: true, tempUserId: tempId });

    } catch (err) {
        console.error("Register error:", err);
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

        if (data.code !== code) {
            return res.status(400).json({ success: false, message: "Invalid code" });
        }

        await legendDB.query(
            `INSERT INTO users 
            (fullname, email, username, password, is_verified, verified_at, registered_at, affiliation, role)
            VALUES (?, ?, ?, ?, 1, NOW(), NOW(), ?, 'user')`,
            [data.fullname, data.email, data.username, data.hashedPassword, data.affiliation]
        );

        pendingVerifications.delete(tempUserId);

        res.json({ success: true });

    } catch (err) {
        console.error("Verify code error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log("🔥 LOGIN ATTEMPT:", username);  // ADD THIS


        const [rows] = await legendDB.query(
            "SELECT * FROM users WHERE username = ? OR email = ?",
            [username, username]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const user = rows[0];

        console.log("👤 USER FOUND:", user.username, "ROLE:", user.role);  // ADD THIS

        if (!user.is_verified) {
            return res.status(403).json({ success: false, message: "Account not verified" });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ success: false, message: "Wrong password" });
        }

        req.session.user = {
            id: user.id,
            fullname: user.fullname,
            email: user.email,
            username: user.username,
            affiliation: user.affiliation,
            role: user.role || 'user'
        };

        const redirectUrl = user.role === 'admin' ? '/admin' : '/dashboard';

        console.log("🔀 REDIRECT URL:", redirectUrl);  // ADD THIS


        res.json({ 
            success: true, 
            redirect: redirectUrl,
            isAdmin: user.role === 'admin'
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        const [rows] = await legendDB.query(
            "SELECT id, username FROM users WHERE email = ?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Email not found" });
        }

        const user = rows[0];
        const code = generateResetCode();

        const expiry = new Date();
        expiry.setMinutes(expiry.getMinutes() + 10);

        pendingPasswordResets.set(email, {
            code,
            codeExpiresAt: expiry
        });

        await sendVerificationCode(email, user.username, code);

        return res.json({ success: true, message: "Reset code sent" });

    } catch (err) {
        console.error("Forgot password error:", err);
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

        if (data.code !== code) {
            return res.status(400).json({ success: false, message: "Invalid code" });
        }

        return res.json({ success: true });

    } catch (err) {
        console.error("Verify forgot code error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/reset-password", async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        const data = pendingPasswordResets.get(email);
        if (!data) return res.status(400).json({ success: false, message: "No reset request" });

        const hashed = await bcrypt.hash(newPassword, 10);

        await legendDB.query(
            "UPDATE users SET password = ? WHERE email = ?",
            [hashed, email]
        );

        pendingPasswordResets.delete(email);

        return res.json({ success: true });

    } catch (err) {
        console.error("Reset password error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false });
        }
        res.redirect("/");
    });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true });
    });
});

app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");
    res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.get("/dashboard/profile", (req, res) => {
    if (!req.session.user) return res.redirect("/");
    res.sendFile(path.join(dashboardPath, "Profile.html"));
});

app.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(adminDashboardPath, "admindb.html"));
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

app.post("/api/user-profile", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        const { fullname, email, username, password, affiliation } = req.body;
        const userId = req.session.user.id;

        const [existing] = await legendDB.query(
            "SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?",
            [email, username, userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: "Email or username already in use" });
        }

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

        req.session.user = { 
            ...req.session.user, 
            ...updatedRows[0], 
            role: updatedRows[0].role };

        return res.status(200).json({ success: true, message: "Profile updated successfully", user: updatedRows[0] });

    } catch (err) {
        console.error("Update profile error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/admin", requireAdmin, (req, res) => {
    res.sendFile(path.join(adminDashboardPath, "admindb.html"));
});
app.get("/api/check-auth", (req, res) => {
    if (!req.session.user) {
        return res.json({ authenticated: false });
    }
    res.json({
        authenticated: true,
        isAdmin: req.session.user.role === 'admin',
        user: {
            id: req.session.user.id,
            fullname: req.session.user.fullname,
            username: req.session.user.username,
            role: req.session.user.role
        }
    });
});


// Get dashboard statistics
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
        const [userCount] = await legendDB.query("SELECT COUNT(*) as total FROM users");
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
            aspiringPct
        });
    } catch (err) {
        console.error("Admin stats error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get saved recommendations stats
app.get("/api/admin/saved-stats", requireAdmin, async (req, res) => {
    try {
        const [stats] = await geoDB.query(`
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
        console.error("Saved stats error:", err);
        res.json({ success: true, stats: [] });
    }
});

// Get all barangays
app.get("/api/admin/barangays", requireAdmin, async (req, res) => {
    try {
        const [barangays] = await geoDB.query(
            "SELECT barangay_name FROM demographic_pasig ORDER BY barangay_name"
        );
        res.json({ success: true, barangays: barangays.map(b => b.barangay_name) });
    } catch (err) {
        console.error("Get barangays error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/admin/businesses", requireAdmin, async (req, res) => {
    try {
        const { search = '', category = '', barangay = '', page = 1, limit = 50 } = req.query;
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
        
        const [countResult] = await geoDB.query(
            `SELECT COUNT(*) as total FROM businesses ${whereSQL}`,
            params
        );
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
        console.error("Get businesses error:", err);
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
        
        if (business.length === 0) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }
        
        res.json({ success: true, business: business[0] });
    } catch (err) {
        console.error("Get business error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/businesses", requireAdmin, async (req, res) => {
    try {
        const { business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon } = req.body;
        
        if (!business_trade_name || !barangay) {
            return res.status(400).json({ success: false, message: "Business name and barangay are required" });
        }
        
        const [barangayResult] = await geoDB.query(
            "SELECT id FROM demographic_pasig WHERE barangay_name = ?",
            [barangay]
        );
        const barangay_id = barangayResult.length ? barangayResult[0].id : null;
        
        const [result] = await geoDB.query(
            `INSERT INTO businesses 
             (business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon, barangay_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [business_trade_name, line_of_business || null, category || null, barangay, street || null, business_address || null, lat || null, lon || null, barangay_id]
        );
        
        res.json({ success: true, id: result.insertId, message: "Business added successfully" });
    } catch (err) {
        console.error("Add business error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
    try {
        const { business_trade_name, line_of_business, category, barangay, street, business_address, lat, lon } = req.body;
        
        let barangay_id = null;
        if (barangay) {
            const [barangayResult] = await geoDB.query(
                "SELECT id FROM demographic_pasig WHERE barangay_name = ?",
                [barangay]
            );
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
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }
        
        res.json({ success: true, message: "Business updated successfully" });
    } catch (err) {
        console.error("Update business error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/admin/businesses/:id", requireAdmin, async (req, res) => {
    try {
        const [result] = await geoDB.query("DELETE FROM businesses WHERE id = ?", [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Business not found" });
        }
        
        res.json({ success: true, message: "Business deleted successfully" });
    } catch (err) {
        console.error("Delete business error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== DEMOGRAPHICS CRUD ====================

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
        console.error("Get demographics error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/admin/demographics/:id", requireAdmin, async (req, res) => {
    try {
        const [demographic] = await geoDB.query(
            "SELECT * FROM demographic_pasig WHERE id = ?",
            [req.params.id]
        );
        
        if (demographic.length === 0) {
            return res.status(404).json({ success: false, message: "Demographic not found" });
        }
        
        res.json({ success: true, demographic: demographic[0] });
    } catch (err) {
        console.error("Get demographic error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/admin/demographics", requireAdmin, async (req, res) => {
    try {
        const { barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution } = req.body;
        
        if (!barangay_name) {
            return res.status(400).json({ success: false, message: "Barangay name is required" });
        }
        
        const [result] = await geoDB.query(
            `INSERT INTO demographic_pasig 
             (barangay_name, population, population_density, highest_age_group, avg_income_min, avg_income_max, gender_distribution)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [barangay_name, population || null, population_density || null, highest_age_group || null, avg_income_min || null, avg_income_max || null, gender_distribution || null]
        );
        
        res.json({ success: true, id: result.insertId, message: "Demographic added successfully" });
    } catch (err) {
        console.error("Add demographic error:", err);
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
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Demographic not found" });
        }
        
        res.json({ success: true, message: "Demographic updated successfully" });
    } catch (err) {
        console.error("Update demographic error:", err);
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
      const typeToCategory = {
        FOOD: "Food & Beverage",
        RETAIL: "Retail & Trading",
        PERSONAL: "Beauty & Wellness",
        TECH: "IT & Software"
      };
      sql += " AND category = ?";
      params.push(typeToCategory[category] || category);
    }

    if (barangay) {
      sql += " AND barangay = ?";
      params.push(barangay);
    }

    sql += " GROUP BY line_of_business ORDER BY cnt DESC";

    const [ideaRows] = await geoDB.query(sql, params);
    if (!ideaRows.length) return res.json({ success: true, data: [] });

    if (!prefList.length) {
      return res.json({ success: true, data: ideaRows.slice(0, parseInt(top)).map(r => r.name) });
    }

    const ideas = ideaRows.map(r => r.name);

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

    const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
    const weights = prefWeights();

    let sql = `SELECT line_of_business AS name, COUNT(*) AS cnt
               FROM businesses
               WHERE line_of_business IS NOT NULL AND line_of_business <> ''`;
    const params = [];

    if (category) {
      const typeToCategory = {
        FOOD: "Food & Beverage",
        RETAIL: "Retail & Trading",
        PERSONAL: "Beauty & Wellness",
        TECH: "IT & Software"
      };
      sql += " AND category = ?";
      params.push(typeToCategory[category] || category);
    }

    sql += " GROUP BY line_of_business ORDER BY cnt DESC";

    const [ideaRows] = await geoDB.query(sql, params);
    if (!ideaRows.length) return res.json({ success: true, data: [] });

    const ideas = ideaRows.map(r => r.name);

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
  console.log("✅ NEW IDEA LOCATIONS ROUTE ACTIVE");
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

app.use(express.static(frontendPath));
app.use("/dashboard", express.static(dashboardPath));
app.use("/admin", express.static(adminDashboardPath));
app.use("/admindashboard", express.static(adminDashboardPath));

app.get("/api/debug-session", (req, res) => {
    res.json({
        authenticated: !!req.session.user,
        user: req.session.user || null,
        isAdmin: req.session.user?.role === 'admin'
    });
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
    console.log("Admin dashboard: http://localhost:3000/admin");
});