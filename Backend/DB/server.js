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
    saveUninitialized: false
}));

const frontendPath = path.join(__dirname, "login");
const dashboardPath = path.join(__dirname, "..", "dashboard");

function generateVerificationCode() {
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

function normalizeBarangay(v) {
  return (v || "").toString().trim().toLowerCase();
}

const PASIG_BARANGAYS = new Set([
  "bagong ilog","bagong katipunan","bambang","buting","caniogan","dela paz","kalawaan","kapasigan",
  "kapitolyo","malinao","manggahan","maybunga","oranbo","palatiw","pinagbuhatan","pineda","rosario",
  "sagad","san antonio","san joaquin","san jose","san miguel","san nicolas","santa lucia","santa rosa",
  "santolan","sumilang","ugong","f. vargas","vargas","wack-wack","wack-wack greenhills"
]);

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "login.html"));
});

const pendingVerifications = new Map();

const pendingPasswordResets = new Map();
function generateResetCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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
            (fullname, email, username, password, is_verified, verified_at, registered_at, affiliation)
            VALUES (?, ?, ?, ?, 1, NOW(), NOW(), ?)`,
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

        const [rows] = await legendDB.query(
            "SELECT * FROM users WHERE username = ?",
            [username]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const user = rows[0];

        if (!user.is_verified) {
            return res.status(403).json({ success: false, message: "Account not verified" });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ success: false, message: "Wrong password" });
        }

        req.session.user = user;

        res.json({ success: true });

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

app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");
    res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.get("/dashboard/profile", (req, res) => {
    if (!req.session.user) return res.redirect("/");
    res.sendFile(path.join(dashboardPath, "Profile.html"));
});

app.get("/api/ideas", async (req, res) => {
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
            const dbCategory = typeToCategory[category] || category;
            sql += ` AND category = ?`;
            params.push(dbCategory);
        }

        if (barangay) {
            sql += ` AND barangay = ?`;
            params.push(barangay);
        }

        sql += ` GROUP BY line_of_business
                 ORDER BY cnt DESC`;

        const [ideaRows] = await geoDB.query(sql, params);
        if (!ideaRows.length) return res.json({ success: true, data: [] });

        if (!prefList.length) {
            return res.json({ success: true, data: ideaRows.slice(0, parseInt(top)).map(r => r.name) });
        }

        const ideas = ideaRows.map(r => r.name);

        const [allBiz] = await geoDB.query(
            `SELECT barangay, line_of_business, lat, lon
             FROM businesses
             WHERE lat IS NOT NULL AND lon IS NOT NULL
               AND lat <> 'null' AND lon <> 'null'`
        );

        const [demoRows] = await geoDB.query(
            `SELECT barangay_name, population, population_density, avg_income_max, gender_distribution, highest_age_group
             FROM demographic_pasig`
        );
        const demoMap = {};
        demoRows.forEach(d => demoMap[normalizeBarangay(d.barangay_name)] = d);

        const [totBizRows] = await geoDB.query(
            `SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`
        );
        const totalBizMap = {};
        totBizRows.forEach(r => totalBizMap[normalizeBarangay(r.barangay)] = r.cnt);

        const centroidMap = {};
        allBiz.forEach(b => {
            const key = normalizeBarangay(b.barangay);
            if (!centroidMap[key]) centroidMap[key] = { lat: 0, lon: 0, n: 0 };
            centroidMap[key].lat += parseFloat(b.lat);
            centroidMap[key].lon += parseFloat(b.lon);
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
            const bizDensity = demo.population ? totalBiz / (demo.population / 1000) : 0;

            ideas.forEach(name => {
                const ideaBiz = allBiz.filter(b => b.line_of_business === name && normalizeBarangay(b.barangay) === bKey);
                const bizcount = ideaBiz.length;

                let competitors = 0;
                if (c) {
                    ideaBiz.forEach(b => {
                        const d = haversineMeters(c.lat, c.lon, parseFloat(b.lat), parseFloat(b.lon));
                        if (d <= radius) competitors += 1;
                    });
                }

                ideaScores.push({
                    name,
                    population: demo.population || 0,
                    population_density: demo.population_density || 0,
                    income: demo.avg_income_max || 0,
                    gender: demo.gender_distribution === "Female" ? 1 : 0,
                    agedist: ageScore(demo.highest_age_group),
                    bizdensity: bizDensity,
                    bizcount,
                    competitors
                });
            });
        } else {
            ideas.forEach(name => {
                let bestScoreObj = null;

                Object.keys(centroidMap).forEach(bgy => {
                    const c = centroidMap[bgy];
                    const demo = demoMap[bgy] || {};
                    const totalBiz = totalBizMap[bgy] || 0;
                    const bizDensity = demo.population ? totalBiz / (demo.population / 1000) : 0;

                    const ideaBiz = allBiz.filter(b => b.line_of_business === name && normalizeBarangay(b.barangay) === bgy);
                    const bizcount = ideaBiz.length;

                    let competitors = 0;
                    ideaBiz.forEach(b => {
                        const d = haversineMeters(c.lat, c.lon, parseFloat(b.lat), parseFloat(b.lon));
                        if (d <= radius) competitors += 1;
                    });

                    const obj = {
                        name,
                        population: demo.population || 0,
                        population_density: demo.population_density || 0,
                        income: demo.avg_income_max || 0,
                        gender: demo.gender_distribution === "Female" ? 1 : 0,
                        agedist: ageScore(demo.highest_age_group),
                        bizdensity: bizDensity,
                        bizcount,
                        competitors
                    };

                    if (!bestScoreObj) bestScoreObj = obj;
                    else bestScoreObj = obj;
                });

                ideaScores.push(bestScoreObj);
            });
        }

        const scoreItems = ideaScores;

        let finalScores = scoreItems.map(i => ({ name: i.name, score: 0 }));

        prefList.forEach(pref => {
            const values = scoreItems.map(i => i[pref] || 0);
            const z = zscores(values);
            z.forEach((val, idx) => {
                finalScores[idx].score += (weights[pref] || 0) * val;
            });
        });

        finalScores.sort((a, b) => b.score - a.score);

        res.json({ success: true, data: finalScores.slice(0, parseInt(top)).map(r => r.name) });
    } catch (err) {
        console.error("Ideas API error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/idea-locations", async (req, res) => {
    try {
        const { idea, barangay, top = 5, prefs = "" } = req.query;
        if (!idea) return res.status(400).json({ success: false, message: "idea required" });

        const prefList = prefs ? prefs.split(",").filter(Boolean) : [];
        const weights = prefWeights();

        const [ideaRows] = await geoDB.query(
            `SELECT barangay, lat, lon
             FROM businesses
             WHERE line_of_business = ?
               AND lat IS NOT NULL AND lon IS NOT NULL
               AND lat <> 'null' AND lon <> 'null'`,
            [idea]
        );

        const [allRows] = await geoDB.query(
            `SELECT barangay, lat, lon
             FROM businesses
             WHERE lat IS NOT NULL AND lon IS NOT NULL
               AND lat <> 'null' AND lon <> 'null'`
        );

        const [demoRows] = await geoDB.query(
            `SELECT barangay_name, population, population_density, avg_income_max, gender_distribution, highest_age_group
             FROM demographic_pasig`
        );
        const demoMap = {};
        demoRows.forEach(d => demoMap[normalizeBarangay(d.barangay_name)] = d);

        const [totBizRows] = await geoDB.query(
            `SELECT barangay, COUNT(*) AS cnt FROM businesses GROUP BY barangay`
        );
        const totalBizMap = {};
        totBizRows.forEach(r => totalBizMap[normalizeBarangay(r.barangay)] = r.cnt);

        let candidates = [];

        if (barangay) {
            const bKey = normalizeBarangay(barangay);
            candidates = allRows
              .filter(r => normalizeBarangay(r.barangay) === bKey)
              .map(r => ({
                barangay_name: r.barangay,
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon)
              }))
              .filter(r => !isNaN(r.lat) && !isNaN(r.lon));
        } else {
            candidates = allRows.map(r => ({
                barangay_name: r.barangay,
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon)
            })).filter(r => !isNaN(r.lat) && !isNaN(r.lon));
        }

        candidates = candidates.filter(c => PASIG_BARANGAYS.has(normalizeBarangay(c.barangay_name)));

        if (!candidates.length) return res.json({ success: true, data: [] });

        const r = 500;

        candidates.forEach(c => {
            let cnt = 0;
            ideaRows.forEach(b => {
                const d = haversineMeters(c.lat, c.lon, parseFloat(b.lat), parseFloat(b.lon));
                if (d <= r) cnt += 1;
            });
            c.competitors = cnt;

            const d = demoMap[normalizeBarangay(c.barangay_name)] || {};
            c.totalpop = d.population || 0;
            c.popdensity = d.population_density || 0;
            c.income = d.avg_income_max || 0;
            c.gender = d.gender_distribution === "Female" ? 1 : 0;
            c.agedist = ageScore(d.highest_age_group);

            const totalBiz = totalBizMap[normalizeBarangay(c.barangay_name)] || 0;
            c.bizdensity = d.population ? totalBiz / (d.population / 1000) : 0;
            c.bizcount = ideaRows.filter(b => normalizeBarangay(b.barangay) === normalizeBarangay(c.barangay_name)).length;
        });

        if (!prefList.length) {
            candidates.sort((a, b) => a.competitors - b.competitors);
            return res.json({ success: true, data: candidates.slice(0, parseInt(top)) });
        }

        const scoreArr = candidates.map(c => ({ ...c, score: 0 }));

        prefList.forEach(pref => {
            const values = scoreArr.map(i => i[pref] || 0);
            const z = zscores(values);
            z.forEach((val, idx) => {
                scoreArr[idx].score += (weights[pref] || 0) * val;
            });
        });

        scoreArr.sort((a, b) => b.score - a.score);

        res.json({ success: true, data: scoreArr.slice(0, parseInt(top)) });
    } catch (err) {
        console.error("Idea locations error:", err);
        res.status(500).json({ success: false, message: err.message });
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

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});