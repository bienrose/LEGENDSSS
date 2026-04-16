const mysql = require("mysql2");

const legendPool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "legendsss_db"
});

const geoPool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "geocoding_db"
});

const legendDB = legendPool.promise();
const geoDB = geoPool.promise();

async function testConnection() {
    try {
        await legendDB.query("SELECT 1");
        await geoDB.query("SELECT 1");
        console.log("Connected to legendsss_db");
        console.log("Connected to geocoding_db");
    } catch (err) {
        console.error("DB ERROR:", err.message);
    }
}

module.exports = {
    legendDB,
    geoDB,
    testConnection
};