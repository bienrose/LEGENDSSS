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
  }
}


app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "login.html"));
});

const pendingVerifications = new Map();

app.post("/register", async (req, res) => {
    try {
        const { fullname, email, username, password, affiliation } = req.body;

        const [existing] = await legendDB.query(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            [email, username]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false });
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

        if (!data) return res.status(400).json({ success: false });

        if (new Date() > new Date(data.codeExpiresAt)) {
            pendingVerifications.delete(tempUserId);
            return res.status(400).json({ success: false });
        }

        if (data.code !== code) {
            return res.status(400).json({ success: false });
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
            return res.status(400).json({ success: false });
        }

        const user = rows[0];

        if (!user.is_verified) {
            return res.status(403).json({ success: false });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ success: false });
        }

        req.session.user = user;

        res.json({ success: true });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: err.message });
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

app.get("/api/user-profile", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Not authenticated" });
        }

        const userId = req.session.user.id;

        const [rows] = await legendDB.query(
            "SELECT id, fullname, email, username, affiliation FROM users WHERE id = ?",
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

        let hashedPassword = req.session.user.password;

        if (password && password.trim() !== "") {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        await legendDB.query(
            "UPDATE users SET fullname = ?, email = ?, username = ?, password = ?, affiliation = ? WHERE id = ?",
            [fullname, email, username, hashedPassword, affiliation, userId]
        );

        const [updatedRows] = await legendDB.query(
            "SELECT id, fullname, email, username, affiliation FROM users WHERE id = ?",
            [userId]
        );

        req.session.user = { ...req.session.user, ...updatedRows[0] };

        return res.status(200).json({ success: true, message: "Profile updated successfully", user: updatedRows[0] });

    } catch (err) {
        console.error("Update profile error:", err);
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