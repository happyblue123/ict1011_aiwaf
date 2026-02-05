-- Disable FK checks so we can drop tables in any order
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS neurowaf_db;
USE neurowaf_db;

-- Drop tables (order doesn't matter with FK checks off)
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS crawler_settings;
DROP TABLE IF EXISTS event_logs;
DROP TABLE IF EXISTS ip_policy_rules;
DROP TABLE IF EXISTS ddos_settings;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS waf_instances;

-- ==========================================
-- 1. WAF INSTANCES TABLE (PARENT)
-- ==========================================
CREATE TABLE waf_instances (
    waf_id INT AUTO_INCREMENT PRIMARY KEY,
    target_host VARCHAR(255) NOT NULL,
    proxy_port INT DEFAULT 8000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. USERS TABLE (CHILD of waf_instances)
-- Deleting a WAF deletes its user(s)
-- ==========================================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    waf_id INT NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'analyst',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (waf_id) REFERENCES waf_instances(waf_id) ON DELETE CASCADE
);

-- ==========================================
-- 3. CRAWLER SETTINGS TABLE (CHILD of waf_instances)
-- Deleting a WAF deletes crawler settings
-- ==========================================
CREATE TABLE crawler_settings (
    setting_id INT AUTO_INCREMENT PRIMARY KEY,
    waf_id INT NOT NULL,
    login_endpoint VARCHAR(255),
    login_payload TEXT,
    excluded_endpoints TEXT,
    last_crawled DATETIME NULL,
    FOREIGN KEY (waf_id) REFERENCES waf_instances(waf_id) ON DELETE CASCADE
);

-- ==========================================
-- 4. EVENT LOGS TABLE
-- ==========================================
CREATE TABLE event_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    raw_log JSON NOT NULL
);

-- ==========================================
-- 5. IP POLICY RULES TABLE
-- ==========================================
CREATE TABLE ip_policy_rules (
    rule_id INT AUTO_INCREMENT PRIMARY KEY,
    list_type ENUM('whitelist', 'blacklist') NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    reason VARCHAR(255),
    created_by VARCHAR(100),
    expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip_policy_ip (ip_address),
    INDEX idx_ip_policy_list (list_type)
);

-- 6. DDOS SETTINGS TABLE
-- ==========================================
CREATE TABLE ddos_settings (
    id INT PRIMARY KEY,
    is_active BOOLEAN DEFAULT TRUE,
    mode VARCHAR(100) DEFAULT 'Adaptive AI Rate-Limiting',
    modules JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 7. SESSIONS TABLE (CHILD of users)
-- Deleting a user deletes sessions
-- ==========================================
CREATE TABLE sessions (
    session_id CHAR(64) PRIMARY KEY,          -- store hash of token (sha256 hex)
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_seen DATETIME NULL,
    user_agent VARCHAR(255) NULL,
    ip_address VARCHAR(45) NULL,
    is_revoked BOOLEAN DEFAULT FALSE,

    UNIQUE KEY uniq_sessions_user_id (user_id),
    INDEX idx_sessions_expires (expires_at),

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================
-- MOCK DATA (Optional)
-- ==========================================
-- 1) Create WAF instance first
-- INSERT INTO waf_instances (target_host, proxy_port)
-- VALUES ('http://localhost:3000', 8000);

-- 2) Create admin user tied to waf_id = 1
-- INSERT INTO users (waf_id, username, password_hash, role)
-- VALUES (1, 'Admin', '$2b$10$YourHashedPasswordHere...', 'admin');

-- 3) Create crawler settings tied to waf_id = 1
-- INSERT INTO crawler_settings (waf_id, login_endpoint, excluded_endpoints)
-- VALUES (1, '/login', '/logout');
