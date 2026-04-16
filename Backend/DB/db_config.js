// db_config.js - MySQL connection for phpMyAdmin
const mysql = require('mysql2');

// Create connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'legendsss_db'
});

// Promise wrapper for async/await
const promisePool = pool.promise();

// Test connection function
async function testConnection() {
    try {
        const [result] = await promisePool.query('SELECT 1');
        console.log('✅ MySQL connected successfully!');
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        console.error('Make sure XAMPP is running!');
        return false;
    }
}

module.exports = { promisePool, testConnection };