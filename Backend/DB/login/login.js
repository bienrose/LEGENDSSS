console.log("login.js loaded");

const SwalFixed = Swal.mixin({
  heightAuto: false,
  scrollbarPadding: false
});

let forgotPendingEmail = null;

function getDeviceId() {
  let deviceId = localStorage.getItem("deviceVerificationId");
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    localStorage.setItem("deviceVerificationId", deviceId);
  }
  return deviceId;
}

function validatePassword(password) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

/* =========================
   FORM SWITCHING
========================= */

function showRegister() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("verification-section").style.display = "none";
  document.getElementById("forgot-password-section").style.display = "none";
  document.getElementById("forgot-verification-section").style.display = "none";
  document.getElementById("reset-password-section").style.display = "none";
  document.getElementById("register-form").style.display = "block";
}

function showForgotPassword() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "none";
  document.getElementById("verification-section").style.display = "none";
  document.getElementById("forgot-password-section").style.display = "block";
  document.getElementById("forgot-verification-section").style.display = "none";
  document.getElementById("reset-password-section").style.display = "none";
}

function showLogin() {
  document.getElementById("register-form").style.display = "none";
  document.getElementById("verification-section").style.display = "none";
  document.getElementById("forgot-password-section").style.display = "none";
  document.getElementById("forgot-verification-section").style.display = "none";
  document.getElementById("reset-password-section").style.display = "none";
  document.getElementById("login-form").style.display = "block";
}

/* =========================
   INDUSTRY HANDLING
========================= */

function handleAffiliationChange() {
  const affiliation = document.getElementById("affiliation").value;

  document.getElementById("entrepreneur-industry-div").style.display = "none";
  document.getElementById("aspiring-industry-div").style.display = "none";
  document.getElementById("entrepreneur-industry-other-div").style.display = "none";
  document.getElementById("aspiring-industry-other-div").style.display = "none";

  document.getElementById("entrepreneur-subcategory-div").style.display = "none";
  document.getElementById("entrepreneur-rec-div").style.display = "none";
  document.getElementById("aspiring-subcategory-div").style.display = "none";
  document.getElementById("aspiring-rec-div").style.display = "none";

  document.getElementById("entrepreneur-industry").selectedIndex = 0;
  document.getElementById("aspiring-industry").selectedIndex = 0;
  document.getElementById("entrepreneur-industry-other").value = "";
  document.getElementById("aspiring-industry-other").value = "";

  document.getElementById("entrepreneur-subcategory").value = "";
  document.getElementById("aspiring-subcategory").value = "";

  if (affiliation === "Entrepreneur") {
    document.getElementById("entrepreneur-industry-div").style.display = "block";
  } else if (affiliation === "Aspiring Entrepreneur") {
    document.getElementById("aspiring-industry-div").style.display = "block";
  }
}

function handleEntrepreneurIndustryChange() {
  const val = document.getElementById("entrepreneur-industry").value;
  const otherDiv = document.getElementById("entrepreneur-industry-other-div");

  otherDiv.style.display = val === "Others" ? "block" : "none";

  if (val !== "Others") {
    document.getElementById("entrepreneur-industry-other").value = "";
  }

  const hasSelection = val !== "";
  document.getElementById("entrepreneur-subcategory-div").style.display = hasSelection ? "block" : "none";
  document.getElementById("entrepreneur-rec-div").style.display = hasSelection ? "block" : "none";

  if (!hasSelection) {
    document.getElementById("entrepreneur-subcategory").value = "";
    document.getElementById("entrepreneur-rec-checkbox").checked = true;
    document.getElementById("entrepreneur-rec-note").style.display = "none";
  }
}

function handleAspiringIndustryChange() {
  const val = document.getElementById("aspiring-industry").value;
  const otherDiv = document.getElementById("aspiring-industry-other-div");

  otherDiv.style.display = val === "Others" ? "block" : "none";

  if (val !== "Others") {
    document.getElementById("aspiring-industry-other").value = "";
  }

  const hasSelection = val !== "";
  document.getElementById("aspiring-subcategory-div").style.display = hasSelection ? "block" : "none";
  document.getElementById("aspiring-rec-div").style.display = hasSelection ? "block" : "none";

  if (!hasSelection) {
    document.getElementById("aspiring-subcategory").value = "";
    document.getElementById("aspiring-rec-checkbox").checked = true;
    document.getElementById("aspiring-rec-note").style.display = "none";
  }
}

/* =========================
   RECOMMENDATION CHECKBOX HANDLERS
========================= */

function handleEntrepreneurRecChange() {
  const checked = document.getElementById("entrepreneur-rec-checkbox").checked;
  document.getElementById("entrepreneur-rec-note").style.display = checked ? "none" : "block";
}

function handleAspiringRecChange() {
  const checked = document.getElementById("aspiring-rec-checkbox").checked;
  document.getElementById("aspiring-rec-note").style.display = checked ? "none" : "block";
}

/* =========================
   INDUSTRY VALUE RESOLVER
========================= */

function resolveIndustry() {
  const affiliation = document.getElementById("affiliation").value;

  if (affiliation === "Entrepreneur") {
    const selected = document.getElementById("entrepreneur-industry").value;
    if (selected === "Others") {
      return document.getElementById("entrepreneur-industry-other").value.trim() || "Others";
    }
    return selected;
  }

  if (affiliation === "Aspiring Entrepreneur") {
    const selected = document.getElementById("aspiring-industry").value;
    if (selected === "Others") {
      return document.getElementById("aspiring-industry-other").value.trim() || "Others";
    }
    return selected;
  }

  return "";
}

/* =========================
   AUTH FUNCTIONS
========================= */

async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  SwalFixed.fire({
    title: "Logging in...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    SwalFixed.fire({
      title: "Success",
      text: "Login successful",
      icon: "success"
    }).then(() => {
      window.location.href = data.redirect || "/dashboard";
    });
  } else {
    SwalFixed.fire({
      title: "Error",
      text: data.message || "Login failed",
      icon: "error"
    });
  }
}

async function register() {
  const fullname = document.getElementById("reg-fullname").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const affiliation = document.getElementById("affiliation").value;

  const checks = validatePassword(password);
  const passwordInput = document.getElementById("reg-password");
  const requirementsBox = document.getElementById("reg-password-requirements");

  if (!checks.length || !checks.upper || !checks.lower || !checks.number) {
    passwordInput.classList.add("input-error");
    requirementsBox.style.display = "block";
    return;
  }

  passwordInput.classList.remove("input-error");
  requirementsBox.style.display = "none";

  const industry = resolveIndustry();

  let industry_specific = "";
  let industryRecommendations = true;

  if (affiliation === "Entrepreneur") {
    industry_specific = document.getElementById("entrepreneur-subcategory").value.trim();
    industryRecommendations = document.getElementById("entrepreneur-rec-checkbox").checked;
  } else if (affiliation === "Aspiring Entrepreneur") {
    industry_specific = document.getElementById("aspiring-subcategory").value.trim();
    industryRecommendations = document.getElementById("aspiring-rec-checkbox").checked;
  }

  SwalFixed.fire({
    title: "Creating account...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullname,
      email,
      username,
      password,
      deviceId: getDeviceId(),
      userAgent: navigator.userAgent,
      affiliation,
      industry,
      industry_specific,
      industryRecommendations
    })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    localStorage.setItem("tempUserId", data.tempUserId);

    SwalFixed.fire({
      title: "Success",
      text: "Verification code sent",
      icon: "success"
    });

    document.getElementById("register-form").style.display = "none";
    document.getElementById("verification-section").style.display = "block";

  } else {
    SwalFixed.fire({
      title: "Error",
      text: data.message || "Registration failed",
      icon: "error"
    });
  }
}

async function verifyCode() {
  const code = document.getElementById("verification-code-input").value.trim();
  const tempUserId = localStorage.getItem("tempUserId");

  if (!tempUserId) {
    SwalFixed.fire({ title: "Error", text: "Session expired. Please register again.", icon: "error" });
    showRegister();
    return;
  }

  if (!code || code.length !== 6) {
    SwalFixed.fire({ title: "Error", text: "Please enter the 6-digit code.", icon: "error" });
    return;
  }

  SwalFixed.fire({
    title: "Verifying...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempUserId, code })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    localStorage.removeItem("tempUserId");
    SwalFixed.fire({
      title: "Success",
      text: "Account verified! You can now log in.",
      icon: "success"
    }).then(() => {
      showLogin();
    });
  } else {
    SwalFixed.fire({
      title: "Error",
      text: data.message || "Verification failed",
      icon: "error"
    });
  }
}

async function resendVerificationCode() {
  SwalFixed.fire({
    title: "Info",
    text: "Please check your email for the verification code. If you don't see it, check your spam folder.",
    icon: "info"
  });
}

async function sendForgotCode() {
  const email = document.getElementById("forgot-email").value.trim();

  if (!email) {
    SwalFixed.fire({ title: "Error", text: "Please enter your email.", icon: "error" });
    return;
  }

  SwalFixed.fire({
    title: "Sending...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    forgotPendingEmail = email;
    document.getElementById("forgot-password-section").style.display = "none";
    document.getElementById("forgot-verification-section").style.display = "block";
    SwalFixed.fire({ title: "Success", text: "Reset code sent to your email.", icon: "success" });
  } else {
    SwalFixed.fire({ title: "Error", text: data.message || "Failed to send code", icon: "error" });
  }
}

async function verifyForgotCode() {
  const code = document.getElementById("forgot-code-input").value.trim();

  if (!forgotPendingEmail) {
    SwalFixed.fire({ title: "Error", text: "Session expired. Please try again.", icon: "error" });
    showForgotPassword();
    return;
  }

  if (!code || code.length !== 6) {
    SwalFixed.fire({ title: "Error", text: "Please enter the 6-digit code.", icon: "error" });
    return;
  }

  SwalFixed.fire({
    title: "Verifying...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/verify-forgot-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: forgotPendingEmail, code })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    document.getElementById("forgot-verification-section").style.display = "none";
    document.getElementById("reset-password-section").style.display = "block";
  } else {
    SwalFixed.fire({ title: "Error", text: data.message || "Invalid code", icon: "error" });
  }
}

async function resetPassword() {
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    SwalFixed.fire({ title: "Error", text: "Passwords do not match.", icon: "error" });
    return;
  }

  const checks = validatePassword(newPassword);
  if (!checks.length || !checks.upper || !checks.lower || !checks.number) {
    SwalFixed.fire({ title: "Error", text: "Password does not meet requirements.", icon: "error" });
    return;
  }

  if (!forgotPendingEmail) {
    SwalFixed.fire({ title: "Error", text: "Session expired. Please try again.", icon: "error" });
    showForgotPassword();
    return;
  }

  SwalFixed.fire({
    title: "Resetting...",
    allowOutsideClick: false,
    didOpen: () => SwalFixed.showLoading()
  });

  const res = await fetch("/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: forgotPendingEmail, newPassword })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    forgotPendingEmail = null;
    SwalFixed.fire({
      title: "Success",
      text: "Password reset successfully. You can now log in.",
      icon: "success"
    }).then(() => {
      showLogin();
    });
  } else {
    SwalFixed.fire({ title: "Error", text: data.message || "Reset failed", icon: "error" });
  }
}