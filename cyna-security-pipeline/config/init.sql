-- Schéma PostgreSQL — Cyna Security Pipeline

CREATE TABLE IF NOT EXISTS security_logs (
    id          SERIAL PRIMARY KEY,
    timestamp   TIMESTAMPTZ NOT NULL,
    log_type    VARCHAR(50) NOT NULL,
    source_ip   INET,
    dest_ip     INET,
    severity    VARCHAR(20),
    event_type  VARCHAR(100),
    raw_log     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS malicious_ips (
    ip               INET PRIMARY KEY,
    confidence_level INTEGER NOT NULL,
    last_updated     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enriched_logs (
    id               SERIAL PRIMARY KEY,
    log_id           INTEGER REFERENCES security_logs(id),
    matched_ip       INET,
    confidence_level INTEGER,
    is_malicious     BOOLEAN DEFAULT FALSE,
    enriched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_source_ip  ON security_logs(source_ip);
CREATE INDEX IF NOT EXISTS idx_logs_dest_ip    ON security_logs(dest_ip);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp  ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_type       ON security_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_malicious_ip    ON malicious_ips(ip);
