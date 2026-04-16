-- =============================================
-- SIMPLE DATABASE SCHEMA FOR EMAIL VERIFICATION
-- NO INDEXES, JUST BASIC TABLES
-- =============================================

-- Create the database
CREATE DATABASE IF NOT EXISTS legendsss_db;
USE legendsss_db;

-- Create users table (simple version)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fullname VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at DATETIME NULL DEFAULT NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create registration devices table (simple version)
CREATE TABLE IF NOT EXISTS registration_devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    user_agent TEXT,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- All done!
SELECT 'Database setup complete!' AS status;