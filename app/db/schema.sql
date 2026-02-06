-- ==========================================
-- NeuroWAF schema (SAFE / idempotent)
-- Will NOT drop tables or delete data.
-- ==========================================

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
-- 3. CRAWLER SETTINGS TABLE (CHILD of waf_instances)
-- ==========================================
CREATE TABLE IF NOT EXISTS crawler_settings (
    setting_id INT AUTO_INCREMENT PRIMARY KEY,
    waf_id INT NOT NULL,
    login_endpoint VARCHAR(255),
    login_payload TEXT,
    excluded_endpoints TEXT,
    last_crawled DATETIME NULL,
    CONSTRAINT fk_crawler_settings_waf
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
    INDEX idx_ip_policy_list (list_type)
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
-- 7. SESSIONS TABLE (CHILD of users)
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
