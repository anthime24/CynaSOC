"""
Enrichissement des logs de sécurité par croisement avec les IPs malveillantes.
Effectue une jointure entre security_logs et malicious_ips sur source_ip et dest_ip.
"""

import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# Jointure : on cherche les logs dont source_ip OU dest_ip est dans malicious_ips
ENRICH_SQL = """
    INSERT INTO enriched_logs (log_id, matched_ip, confidence_level, is_malicious)
    SELECT
        sl.id,
        m.ip,
        m.confidence_level,
        TRUE
    FROM security_logs sl
    JOIN malicious_ips m
        ON sl.source_ip = m.ip OR sl.dest_ip = m.ip
    ON CONFLICT DO NOTHING
"""

STATS_SQL = """
    SELECT
        COUNT(*)                                        AS total_enriched,
        COUNT(DISTINCT matched_ip)                      AS unique_malicious_ips,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM security_logs), 2) AS pct_malicious
    FROM enriched_logs
    WHERE is_malicious = TRUE
"""


def enrich(db_url: str) -> None:
    """Croise security_logs avec malicious_ips et remplit enriched_logs."""
    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(ENRICH_SQL)
                inserted = cur.rowcount
        log.info(f"{inserted} correspondances insérées dans enriched_logs")

        # Afficher les stats
        with conn.cursor() as cur:
            cur.execute(STATS_SQL)
            row = cur.fetchone()
            if row:
                log.info(f"Total enrichis : {row[0]} | IPs malveillantes uniques : {row[1]} | Taux : {row[2]}%")
    finally:
        conn.close()


if __name__ == "__main__":
    DB_URL = "postgresql://cyna:cyna_password@localhost:5433/cyna"
    enrich(DB_URL)
