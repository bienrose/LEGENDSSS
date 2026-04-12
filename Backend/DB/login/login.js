console.log("login.js loaded");

function showRegister() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
}

function showLogin() {
  document.getElementById("register-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
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
  const username = document.getElementById("reg-username").value;
  const password = document.getElementById("reg-password").value;

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
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      Swal.fire({
        title: 'Registered!',
        text: data.message || 'Registration successful!',
        icon: 'success',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false
      }).then(() => {
        document.getElementById("reg-username").value = "";
        document.getElementById("reg-password").value = "";
        showLogin();
      });
    } else {
      Swal.fire({
        title: 'Registration Failed!',
        text: data.message || 'Registration failed',
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