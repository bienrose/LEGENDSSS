const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { promisePool, testConnection } = require("./db_config");

const app = express();

// Test MySQL connection on startup
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

// ========== CORRECT PATHS ==========
const frontendPath = path.join(__dirname, "login");
const dashboardPath = path.join(__dirname, "..", "dashboard");

console.log("Frontend path:", frontendPath);
console.log("Dashboard path:", dashboardPath);

app.use(express.static(frontendPath));
app.use("/dashboard", express.static(dashboardPath));
// ========== END PATHS ==========

// ========== EMAIL CONFIGURATION ==========
async function sendVerificationCode(email, username, code) {
  console.log("\n========== VERIFICATION CODE ==========");
  console.log(`To: ${email}`);
  console.log(`For: ${username}`);
  console.log(`CODE: ${code}`);
  console.log(`This code expires in 10 minutes`);
  console.log("========================================\n");
  return true;
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
// ========== END EMAIL CONFIG ==========

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

// ========== REGISTRATION ==========
const pendingVerifications = new Map();

app.post("/register", async (req, res) => {
  const { fullname, email, username, password, deviceId, userAgent } = req.body;
  
  if (!fullname || !email || !username || !password) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format"
    });
  }

  try {
    // Check if email or username already exists
    const [existingUser] = await promisePool.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email or username already registered"
      });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const codeExpiry = new Date();
    codeExpiry.setMinutes(codeExpiry.getMinutes() + 10);
    
    const tempUserId = crypto.randomBytes(16).toString("hex");
    
    pendingVerifications.set(tempUserId, {
      email,
      username,
      fullname,
      hashedPassword: hashed,
      code: verificationCode,
      codeExpiresAt: codeExpiry,
      deviceId,
      userAgent,
      createdAt: new Date()
    });
    
    try {
      await sendVerificationCode(email, username, verificationCode);
      res.status(200).json({
        success: true,
        message: "Verification code sent to your email!",
        tempUserId: tempUserId
      });
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      pendingVerifications.delete(tempUserId);
      res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again."
      });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration"
    });
  }
});
// ========== END REGISTRATION ==========

// ========== VERIFY CODE ==========
app.post("/verify-code", async (req, res) => {
  const { tempUserId, code } = req.body;
  
  if (!tempUserId || !code) {
    return res.status(400).json({
      success: false,
      message: "Missing verification data"
    });
  }
  
  const pending = pendingVerifications.get(tempUserId);
  
  if (!pending) {
    return res.status(400).json({
      success: false,
      message: "Verification session expired or not found. Please register again."
    });
  }
  
  if (new Date() > new Date(pending.codeExpiresAt)) {
    pendingVerifications.delete(tempUserId);
    return res.status(400).json({
      success: false,
      message: "Verification code has expired. Please register again."
    });
  }
  
  if (pending.code !== code) {
    return res.status(400).json({
      success: false,
      message: "Invalid verification code. Please try again."
    });
  }
  
  try {
    const [result] = await promisePool.query(
      `INSERT INTO users (fullname, email, username, password, is_verified, verified_at) 
       VALUES (?, ?, ?, ?, TRUE, NOW())`,
      [pending.fullname, pending.email, pending.username, pending.hashedPassword]
    );
    
    const userId = result.insertId;
    
    if (pending.deviceId) {
      await promisePool.query(
        `INSERT INTO registration_devices (user_id, device_id, user_agent) 
         VALUES (?, ?, ?)`,
        [userId, pending.deviceId, pending.userAgent || null]
      );
    }
    
    pendingVerifications.delete(tempUserId);
    
    res.json({
      success: true,
      message: "Email verified successfully! You can now login."
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during verification"
    });
  }
});
// ========== END VERIFY CODE ==========

// ========== RESEND VERIFICATION CODE ==========
app.post("/resend-verification-code", async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required"
    });
  }
  
  let foundTempId = null;
  let pendingData = null;
  
  for (const [tempId, data] of pendingVerifications.entries()) {
    if (data.email === email) {
      foundTempId = tempId;
      pendingData = data;
      break;
    }
  }
  
  if (!pendingData) {
    return res.status(404).json({
      success: false,
      message: "No pending verification found for this email. Please register again."
    });
  }
  
  const newCode = generateVerificationCode();
  const newExpiry = new Date();
  newExpiry.setMinutes(newExpiry.getMinutes() + 10);
  
  pendingData.code = newCode;
  pendingData.codeExpiresAt = newExpiry;
  pendingVerifications.set(foundTempId, pendingData);
  
  try {
    await sendVerificationCode(email, pendingData.username, newCode);
    res.json({
      success: true,
      message: "New verification code sent to your email!"
    });
  } catch (emailError) {
    console.error("Resend email error:", emailError);
    res.status(500).json({
      success: false,
      message: "Failed to send verification code"
    });
  }
});
// ========== END RESEND CODE ==========

// ========== LOGIN ==========
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  promisePool.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  ).then(async ([results]) => {
    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const user = results[0];

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before logging in.",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    req.session.user = user;

    res.status(200).json({
      success: true,
      message: `Welcome back, ${username}!`,
    });
  }).catch(err => {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  });
});
// ========== END LOGIN ==========

app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }
  
  if (!req.session.user.is_verified) {
    req.session.destroy();
    return res.status(403).send("Please verify your email first");
  }

  res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.send("Logged out");
});

app.get("/user-info", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  
  res.json({
    id: req.session.user.id,
    fullname: req.session.user.fullname,
    email: req.session.user.email,
    username: req.session.user.username,
    isVerified: req.session.user.is_verified === 1
  });
});

// Clean up expired pending verifications every hour
setInterval(() => {
  const now = new Date();
  for (const [tempId, data] of pendingVerifications.entries()) {
    if (now > new Date(data.codeExpiresAt)) {
      pendingVerifications.delete(tempId);
    }
  }
}, 60 * 60 * 1000);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});