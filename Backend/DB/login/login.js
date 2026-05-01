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

  document.getElementById("entrepreneur-industry").selectedIndex = 0;
  document.getElementById("aspiring-industry").selectedIndex = 0;
  document.getElementById("entrepreneur-industry-other").value = "";
  document.getElementById("aspiring-industry-other").value = "";

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
}

function handleAspiringIndustryChange() {
  const val = document.getElementById("aspiring-industry").value;
  const otherDiv = document.getElementById("aspiring-industry-other-div");

  otherDiv.style.display = val === "Others" ? "block" : "none";

  if (val !== "Others") {
    document.getElementById("aspiring-industry-other").value = "";
  }
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
      affiliation
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