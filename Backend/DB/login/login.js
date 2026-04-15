console.log("login.js loaded");

// ========== Device ID Management ==========
function getDeviceId() {
  let deviceId = localStorage.getItem('deviceVerificationId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceVerificationId', deviceId);
  }
  return deviceId;
}

function showRegister() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
  document.getElementById("verification-section").style.display = "none";
}

function showLogin() {
  document.getElementById("register-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
  document.getElementById("verification-section").style.display = "none";
}

async function verifyCode() {
  const code = document.getElementById('verification-code-input').value;
  const tempUserId = localStorage.getItem('tempUserId');
  
  if (!code || code.length !== 6) {
    Swal.fire({
      title: 'Invalid Code',
      text: 'Please enter the 6-digit verification code',
      icon: 'error',
      confirmButtonText: 'OK'
    });
    return;
  }
  
  Swal.fire({
    title: 'Verifying...',
    text: 'Please wait',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const res = await fetch("/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tempUserId, code })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      Swal.fire({
        title: 'Success!',
        text: 'Email verified successfully! You can now login.',
        icon: 'success',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false
      }).then(() => {
        localStorage.removeItem('tempUserId');
        document.getElementById("verification-section").style.display = "none";
        document.getElementById("verification-code-input").value = "";
        showLogin();
        // Clear registration form
        document.getElementById("reg-fullname").value = "";
        document.getElementById("reg-email").value = "";
        document.getElementById("reg-username").value = "";
        document.getElementById("reg-password").value = "";
      });
    } else {
      Swal.fire({
        title: 'Verification Failed',
        text: data.message || 'Invalid or expired code',
        icon: 'error',
        confirmButtonText: 'Try Again'
      });
    }
  } catch (error) {
    console.error("Verification error:", error);
    Swal.fire({
      title: 'Error',
      text: 'Network error. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}

async function resendVerificationCode() {
  const email = document.getElementById("reg-email").value;
  
  if (!email) {
    Swal.fire({
      title: 'Email Required',
      text: 'Please enter your email address first',
      icon: 'warning',
      confirmButtonText: 'OK'
    });
    return;
  }
  
  Swal.fire({
    title: 'Resending Code...',
    text: 'Please wait',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const res = await fetch("/resend-verification-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    
    if (res.ok && data.success) {
      Swal.fire({
        title: 'Code Sent!',
        text: 'A new verification code has been sent to your email.',
        icon: 'success',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false
      });
    } else {
      Swal.fire({
        title: 'Failed',
        text: data.message || 'Could not resend verification code',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  } catch (error) {
    console.error("Resend error:", error);
    Swal.fire({
      title: 'Error',
      text: 'Network error. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}

async function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  Swal.fire({
    title: 'Logging in...',
    text: 'Please wait',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    
    console.log("Response data:", data); 

    if (res.ok && data.success) {
      Swal.fire({
        title: 'Success!',
        text: data.message || 'Login successful!', 
        icon: 'success',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
        willClose: () => {
          window.location.href = "/dashboard";
        }
      });
    } else {
      Swal.fire({
        title: 'Error!',
        text: data.message || 'Login failed',
        icon: 'error',
        confirmButtonText: 'Try Again'
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    Swal.fire({
      title: 'Error!',
      text: 'Network error. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}

async function register() {
  const fullname = document.getElementById("reg-fullname").value;
  const email = document.getElementById("reg-email").value;
  const username = document.getElementById("reg-username").value;
  const password = document.getElementById("reg-password").value;
  
  const deviceId = getDeviceId();
  const userAgent = navigator.userAgent;

  if (!email || !email.includes('@')) {
    Swal.fire({
      title: 'Invalid Email!',
      text: 'Please enter a valid email address',
      icon: 'error',
      confirmButtonText: 'OK'
    });
    return;
  }

  Swal.fire({
    title: 'Creating account...',
    text: 'Please wait',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        fullname,
        email,
        username, 
        password,
        deviceId,
        userAgent
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      localStorage.setItem('tempUserId', data.tempUserId);
      
      Swal.fire({
        title: 'Verification Code Sent!',
        text: data.message || 'Please check your email for the verification code.',
        icon: 'success',
        confirmButtonText: 'OK'
      }).then(() => {
        document.getElementById("login-form").style.display = "none";
        document.getElementById("register-form").style.display = "none";
        document.getElementById("verification-section").style.display = "block";
      });
    } else {
      Swal.fire({
        title: 'Registration Failed!',
        text: data.message || 'Registration failed. Email might already be registered.',
        icon: 'error',
        confirmButtonText: 'Try Again'
      });
    }
  } catch (error) {
    console.error("Register error:", error);
    Swal.fire({
      title: 'Error!',
      text: 'Network error. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}