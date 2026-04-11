function showRegister() {
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
}

function showLogin() {
  document.getElementById("login-form").style.display = "block";
  document.getElementById("register-form").style.display = "none";
}

function login() {
  var user = document.getElementById("login-username").value;
  var pass = document.getElementById("login-password").value;

  if (user === "" || pass === "") {
    alert("Please fill in all fields.");
    return;
  }

  if (user === "admin" && pass === "admin") {
    window.location.href = "dashboard.html";
  } else {
    alert("Wrong username or password.");
  }
}

function register() {
  var user = document.getElementById("reg-username").value;
  var pass = document.getElementById("reg-password").value;

  if (user === "" || pass === "") {
    alert("Please fill in all fields.");
    return;
  }

  alert("Account created!");
  showLogin();
}