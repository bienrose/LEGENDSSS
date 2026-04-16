console.log("login.js loaded");

function getDeviceId() {
  let deviceId = localStorage.getItem('deviceVerificationId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('deviceVerificationId', deviceId);
  }
  return deviceId;
}

function showRegister() {
    // Hide all sections
    document.getElementById("login-form").style.display = "none";
    document.getElementById("verification-section").style.display = "none";
    document.getElementById("forgot-password-section").style.display = "none";
    document.getElementById("forgot-verification-section").style.display = "none";
    document.getElementById("reset-password-section").style.display = "none";
    
    // Show only register form
    document.getElementById("register-form").style.display = "block";
    
    // Clear forgot password data
    forgotPendingEmail = null;
}

function showForgotPassword() {
    // Hide all other sections
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("verification-section").style.display = "none";
    document.getElementById("forgot-verification-section").style.display = "none";
    document.getElementById("reset-password-section").style.display = "none";
    
    // Show only forgot password section
    document.getElementById("forgot-password-section").style.display = "block";
    
    document.getElementById("forgot-email").value = "";
    document.getElementById("forgot-code-input").value = "";
    document.getElementById("new-password").value = "";
    document.getElementById("confirm-password").value = "";
    
    forgotPendingEmail = null;
    forgotPendingCode = null;
    forgotPendingExpiry = null;
}

function showLogin() {
    // Hide all sections
    document.getElementById("register-form").style.display = "none";
    document.getElementById("verification-section").style.display = "none";
    document.getElementById("forgot-password-section").style.display = "none";
    document.getElementById("forgot-verification-section").style.display = "none";
    document.getElementById("reset-password-section").style.display = "none";
    
    // Show only login form
    document.getElementById("login-form").style.display = "block";
    
    // Clear forgot password data
    forgotPendingEmail = null;
    forgotPendingCode = null;
    forgotPendingExpiry = null;
    
    // Clear forgot password inputs
    if (document.getElementById("forgot-email")) {
        document.getElementById("forgot-email").value = "";
        document.getElementById("forgot-code-input").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";
    }
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

let forgotPendingEmail = null;
let forgotPendingCode = null;
let forgotPendingExpiry = null;
let forgotPendingUserId = null;

function showForgotPassword() {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("verification-section").style.display = "none";
    document.getElementById("forgot-password-section").style.display = "block";
    document.getElementById("forgot-verification-section").style.display = "none";
    document.getElementById("reset-password-section").style.display = "none";
    
    document.getElementById("forgot-email").value = "";
    document.getElementById("forgot-code-input").value = "";
    document.getElementById("new-password").value = "";
    document.getElementById("confirm-password").value = "";
}

async function sendForgotPasswordCode() {
    const email = document.getElementById("forgot-email").value;
    
    if (!email || !email.includes('@')) {
        Swal.fire({
            title: 'Invalid Email',
            text: 'Please enter a valid email address',
            icon: 'error',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    Swal.fire({
        title: 'Sending Code...',
        text: 'Please wait',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        const res = await fetch("/forgot-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            
            forgotPendingEmail = email;
            
            Swal.fire({
                title: 'Code Sent!',
                text: 'A verification code has been sent to your email.',
                icon: 'success',
                confirmButtonText: 'OK'
            }).then(() => {
                document.getElementById("forgot-password-section").style.display = "none";
                document.getElementById("forgot-verification-section").style.display = "block";
            });
        } else {
            Swal.fire({
                title: 'Failed',
                text: data.message || 'Email not found',
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        Swal.fire({
            title: 'Error',
            text: 'Network error. Please try again.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}

async function verifyForgotCode() {
    const code = document.getElementById("forgot-code-input").value;
    
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
        const res = await fetch("/verify-forgot-code", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                email: forgotPendingEmail, 
                code: code 
            })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            Swal.fire({
                title: 'Verified!',
                text: 'You can now reset your password.',
                icon: 'success',
                confirmButtonText: 'OK'
            }).then(() => {
                document.getElementById("forgot-verification-section").style.display = "none";
                document.getElementById("reset-password-section").style.display = "block";
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
        console.error("Verify forgot code error:", error);
        Swal.fire({
            title: 'Error',
            text: 'Network error. Please try again.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}

async function resetPassword() {
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    
    if (!newPassword || !confirmPassword) {
        Swal.fire({
            title: 'Missing Fields',
            text: 'Please fill in both password fields',
            icon: 'error',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    if (newPassword.length < 6) {
        Swal.fire({
            title: 'Weak Password',
            text: 'Password must be at least 6 characters',
            icon: 'error',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    if (newPassword !== confirmPassword) {
        Swal.fire({
            title: 'Password Mismatch',
            text: 'Passwords do not match',
            icon: 'error',
            confirmButtonText: 'OK'
        });
        return;
    }
    
    Swal.fire({
        title: 'Resetting Password...',
        text: 'Please wait',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        const res = await fetch("/reset-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                email: forgotPendingEmail, 
                newPassword: newPassword 
            })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            Swal.fire({
                title: 'Success!',
                text: 'Password reset successfully! You can now login.',
                icon: 'success',
                timer: 2000,
                timerProgressBar: true,
                showConfirmButton: false
            }).then(() => {
                // Clear all forgot password data
                forgotPendingEmail = null;
                forgotPendingCode = null;
                forgotPendingExpiry = null;
                
                // Clear all input fields
                document.getElementById("forgot-email").value = "";
                document.getElementById("forgot-code-input").value = "";
                document.getElementById("new-password").value = "";
                document.getElementById("confirm-password").value = "";
                
                // HIDE ALL FORGOT PASSWORD SECTIONS
                document.getElementById("forgot-password-section").style.display = "none";
                document.getElementById("forgot-verification-section").style.display = "none";
                document.getElementById("reset-password-section").style.display = "none";
                
                // SHOW ONLY LOGIN FORM
                document.getElementById("login-form").style.display = "block";
                document.getElementById("register-form").style.display = "none";
                document.getElementById("verification-section").style.display = "none";
            });
        } else {
            Swal.fire({
                title: 'Failed',
                text: data.message || 'Could not reset password',
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }
    } catch (error) {
        console.error("Reset password error:", error);
        Swal.fire({
            title: 'Error',
            text: 'Network error. Please try again.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}