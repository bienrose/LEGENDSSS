const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { legendDB, geoDB, testConnection } = require("./db_config");

const app = express();

testConnection();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  })
);

const frontendPath = path.join(__dirname, "login");
const dashboardPath = path.join(__dirname, "..", "dashboard");

app.use(express.static(frontendPath));
app.use("/dashboard", express.static(dashboardPath));

async function sendVerificationCode(email, username, code) {
  console.log("\n========== VERIFICATION CODE ==========");
  console.log(`To: ${email}`);
  console.log(`User: ${username}`);
  console.log(`CODE: ${code}`);
  console.log("========================================\n");
  return true;
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

const pendingVerifications = new Map();
const forgotPasswordRequests = new Map();

app.post("/register", async (req, res) => {
  const { fullname, email, username, password, deviceId, userAgent } = req.body;

  if (!fullname || !email || !username || !password) {
    return res.status(400).json({ success: false, message: "All fields required" });
  }

  try {
    const [existingUser] = await legendDB.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const code = generateVerificationCode();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10);

    const tempId = crypto.randomBytes(16).toString("hex");

    pendingVerifications.set(tempId, {
      email,
      username,
      fullname,
      hashedPassword: hashed,
      code,
      codeExpiresAt: expiry,
      deviceId,
      userAgent
    });

    await sendVerificationCode(email, username, code);

    res.json({
      success: true,
      message: "Verification code sent",
      tempUserId: tempId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/verify-code", async (req, res) => {
  const { tempUserId, code } = req.body;

  const data = pendingVerifications.get(tempUserId);

  if (!data) {
    return res.status(400).json({ success: false, message: "Session expired" });
  }

  if (new Date() > new Date(data.codeExpiresAt)) {
    pendingVerifications.delete(tempUserId);
    return res.status(400).json({ success: false, message: "Code expired" });
  }

  if (data.code !== code) {
    return res.status(400).json({ success: false, message: "Invalid code" });
  }

  try {
    await legendDB.query(
      `INSERT INTO users (fullname, email, username, password, is_verified, verified_at)
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [data.fullname, data.email, data.username, data.hashedPassword]
    );

    pendingVerifications.delete(tempUserId);

    res.json({ success: true, message: "Account verified" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  legendDB.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  ).then(async ([rows]) => {

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({ success: false, message: "Verify email first" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    req.session.user = user;

    res.json({ success: true, message: "Login successful" });

  }).catch(err => {
    console.error(err);
    res.status(500).json({ success: false });
  });
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.status(401).send("Unauthorized");

  res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.get("/user-info", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json(req.session.user);
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/businesses", async (req, res) => {
  try {
    const { barangay, type } = req.query;

    let query = "SELECT * FROM businesses WHERE 1=1";
    const params = [];

    if (barangay) {
      query += " AND barangay LIKE ?";
      params.push(`%${barangay}%`);
    }

    if (type) {
      query += " AND line_of_business LIKE ?";
      params.push(`%${type}%`);
    }

    const [rows] = await geoDB.query(query, params);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  const [users] = await legendDB.query(
    "SELECT id, username FROM users WHERE email = ?",
    [email]
  );

  if (users.length === 0) {
    return res.status(404).json({ success: false });
  }

  const code = generateVerificationCode();
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);

  forgotPasswordRequests.set(email, {
    code,
    expiresAt: expiry,
    userId: users[0].id
  });

  await sendVerificationCode(email, users[0].username, code);

  res.json({ success: true });
});

app.post("/verify-forgot-code", (req, res) => {
  const { email, code } = req.body;

  const data = forgotPasswordRequests.get(email);

  if (!data) return res.status(400).json({ success: false });

  if (data.code !== code) {
    return res.status(400).json({ success: false });
  }

  res.json({ success: true });
});

app.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  const hashed = await bcrypt.hash(newPassword, 10);

  await legendDB.query(
    "UPDATE users SET password = ? WHERE email = ?",
    [hashed, email]
  );

  forgotPasswordRequests.delete(email);

  res.json({ success: true });
});

setInterval(() => {
  const now = new Date();

  for (const [id, data] of pendingVerifications.entries()) {
    if (now > new Date(data.codeExpiresAt)) {
      pendingVerifications.delete(id);
    }
  }

  for (const [email, data] of forgotPasswordRequests.entries()) {
    if (now > new Date(data.expiresAt)) {
      forgotPasswordRequests.delete(email);
    }
  }
}, 3600000);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});