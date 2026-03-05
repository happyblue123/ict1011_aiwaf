-- ==========================================
-- NeuroWAF schema (SAFE / idempotent)
-- Will NOT drop tables or delete data.
-- ==========================================
-- DROP DATABASE neurowaf_db;
CREATE DATABASE IF NOT EXISTS neurowaf_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE neurowaf_db;

-- ==========================================
-- 1. WAF INSTANCES TABLE (PARENT)
-- ==========================================
CREATE TABLE IF NOT EXISTS waf_instances (
    waf_id INT AUTO_INCREMENT PRIMARY KEY,
    target_host VARCHAR(255) NOT NULL,        -- canonical key: host:port
    waf_mode ENUM('shadow','protect') NOT NULL DEFAULT 'protect',
    proxy_port INT DEFAULT 8000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_waf_target_host (target_host)
) ENGINE=InnoDB;

-- ==========================================
-- 2. USERS TABLE (CHILD of waf_instances)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    waf_id INT NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'analyst',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_waf
      FOREIGN KEY (waf_id) REFERENCES waf_instances(waf_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- 4. EVENT LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS event_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    raw_log JSON NOT NULL
) ENGINE=InnoDB;

-- ==========================================
-- 5. IP POLICY RULES TABLE
-- (indexes defined inline so CREATE TABLE IF NOT EXISTS is enough)
-- ==========================================
CREATE TABLE IF NOT EXISTS ip_policy_rules (
    rule_id INT AUTO_INCREMENT PRIMARY KEY,
    list_type ENUM('whitelist', 'blacklist') NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    reason VARCHAR(255),
    created_by VARCHAR(100),
    expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip_policy_ip (ip_address),
    INDEX idx_ip_policy_list (list_type),
    -- enforce at the database level that a given IP can only appear once
    -- per list_type.  existing installations will need to run an ALTER
    -- table manually if duplicates already exist; for new databases the
    -- constraint is created automatically.
    UNIQUE KEY uniq_ip_policy (ip_address, list_type)
) ENGINE=InnoDB;

-- ==========================================
-- 6. DDOS SETTINGS TABLE
-- Ensure there's always 1 row with id=1 (optional).
-- ==========================================
CREATE TABLE IF NOT EXISTS ddos_settings (
    id INT PRIMARY KEY,
    is_active BOOLEAN DEFAULT TRUE,
    mode VARCHAR(100) DEFAULT 'Adaptive AI Rate-Limiting',
    modules JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Optional: seed default row safely (won't overwrite existing)
INSERT INTO ddos_settings (id, is_active, mode, modules)
VALUES (1, TRUE, 'Adaptive AI Rate-Limiting', NULL)
ON DUPLICATE KEY UPDATE id = id;

-- ==========================================
-- 7. WAF SETTINGS TABLE (global toggles)
-- Single-row table (id=1) like ddos_settings.
-- ==========================================
CREATE TABLE IF NOT EXISTS waf_settings (
    id INT PRIMARY KEY,
    geo_blocking BOOLEAN DEFAULT TRUE,
    rate_limiting BOOLEAN DEFAULT TRUE,
    error_enabled BOOLEAN DEFAULT FALSE,
    error_html TEXT DEFAULT NULL,
    bot_enabled BOOLEAN DEFAULT FALSE,
    bot_html TEXT DEFAULT NULL,
    custom_404_enabled BOOLEAN DEFAULT FALSE,
    custom_404_html TEXT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO waf_settings (id, geo_blocking, rate_limiting)
VALUES (1, TRUE, TRUE)
ON DUPLICATE KEY UPDATE id = id;

-- ==========================================
-- 8. SESSIONS TABLE (CHILD of users)
-- ==========================================
CREATE TABLE IF NOT EXISTS sessions (
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

    CONSTRAINT fk_sessions_user
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- 9. REPORT SETTINGS TABLE (auto email reports)
-- Single-row table (id=1) like waf_settings.
-- ==========================================
CREATE TABLE IF NOT EXISTS report_settings (
    id INT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    recipient_email VARCHAR(255) DEFAULT '',
    frequency ENUM('daily','weekly','monthly') DEFAULT 'daily',
    schedule_time TIME DEFAULT '00:00',          -- time of day to send
    schedule_dow TINYINT NULL,                   -- 0=Mon..6=Sun for weekly
    schedule_dom TINYINT NULL,                   -- 1-31 for monthly
    last_sent_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO report_settings (id) VALUES (1)
ON DUPLICATE KEY UPDATE id = id;

-- make sure any older databases get our new scheduling columns
ALTER TABLE report_settings
    ADD COLUMN IF NOT EXISTS schedule_time TIME DEFAULT '00:00',
    ADD COLUMN IF NOT EXISTS schedule_dow TINYINT NULL,
    ADD COLUMN IF NOT EXISTS schedule_dom TINYINT NULL;

-- ==========================================
-- 10. ANALYST FEEDBACK TABLE
-- Human-in-the-loop learning: analysts mark
-- AI detections as correct or false positive.
-- ==========================================
CREATE TABLE IF NOT EXISTS analyst_feedback (
    feedback_id  INT AUTO_INCREMENT PRIMARY KEY,
    log_id       INT NOT NULL,
    user_id      INT NOT NULL,
    label        ENUM('correct','false_positive','false_negative') NOT NULL,
    notes        TEXT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_fb_log   (log_id),
    INDEX idx_fb_label (label),

    CONSTRAINT fk_fb_user
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
