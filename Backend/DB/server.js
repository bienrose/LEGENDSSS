const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();

const db = new sqlite3.Database("./database.db");

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

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login.html"));
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hashed],
    function (err) {
      if (err) {
        return res.status(400).send(err.message);
      }
      res.send("Registered successfully");
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(400).send("Invalid credentials");
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(400).send("Invalid credentials");
      }

      req.session.user = user;
      res.redirect("/dashboard");
    }
  );
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }

  res.sendFile(path.join(dashboardPath, "dashboard.html"));
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.send("Logged out");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});