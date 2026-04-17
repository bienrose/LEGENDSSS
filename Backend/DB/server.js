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

app.get("/api/user-profile", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        const userId = req.session.user.id;

        const [rows] = await legendDB.query(
            "SELECT id, fullname, email, username, affiliation, role FROM users WHERE id = ?",
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.status(200).json({ success: true, user: rows[0] });

    } catch (err) {
        console.error("Get profile error:", err);
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
        const [businessCount] = await geoDB.query(
            "SELECT COUNT(*) as count FROM businesses WHERE barangay_id = ?",
            [req.params.id]
        );
        
        if (businessCount[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete: Barangay has ${businessCount[0].count} associated businesses` 
            });
        }
        
        const [result] = await geoDB.query("DELETE FROM demographic_pasig WHERE id = ?", [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Demographic not found" });
        }
        
        res.json({ success: true, message: "Demographic deleted successfully" });
    } catch (err) {
        console.error("Delete demographic error:", err);
        res.status(500).json({ success: false, message: err.message });
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