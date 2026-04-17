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

async function verifyCode() {
  const code = document.getElementById("verification-code-input").value.trim();
  const tempUserId = localStorage.getItem("tempUserId");

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
      text: "Account verified!",
      icon: "success"
    }).then(() => {
      showLogin();
    });

  } else {
    SwalFixed.fire({
      title: "Error",
      text: data.message || "Invalid code",
      icon: "error"
    });
  }
}

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
      window.location.href = "/dashboard";
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
  const affiliation = document.getElementById("affiliation").value.trim();

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

async function sendForgotCode() {
  const email = document.getElementById("forgot-email").value.trim();

  if (!email) {
    SwalFixed.fire({ title: "Error", text: "Please enter an email", icon: "error" });
    return;
  }

  SwalFixed.fire({
    title: "Sending code...",
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

    SwalFixed.fire({
      title: "Sent",
      text: data.message || "Check your email for code",
      icon: "success"
    });

    document.getElementById("forgot-password-section").style.display = "none";
    document.getElementById("forgot-verification-section").style.display = "block";

  } else {
    SwalFixed.fire({
      title: "Error",
      text: data.message || "Email not found",
      icon: "error"
    });
  }
}

async function verifyForgotCode() {
  const code = document.getElementById("forgot-code-input").value.trim();

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
    SwalFixed.fire({
      title: "Error",
      text: "Invalid code",
      icon: "error"
    });
  }
}

async function resetPassword() {
  const newPassword = document.getElementById("new-password").value;

  const res = await fetch("/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: forgotPendingEmail, newPassword })
  });

  const data = await res.json();

  if (res.ok && data.success) {
    SwalFixed.fire({
      title: "Success",
      text: "Password reset complete",
      icon: "success"
    }).then(() => {
      showLogin();
    });

  } else {
    SwalFixed.fire({
      title: "Error",
      text: "Reset failed",
      icon: "error"
    });
  }
}