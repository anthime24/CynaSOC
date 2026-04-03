"""
Ingestion du feed ipsum (threat intelligence) vers PostgreSQL.
Lit ipsum.txt depuis le disque et insère les IPs en batch dans malicious_ips.
"""

import logging
from pathlib import Path

import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def parse_ipsum(ipsum_path: str) -> list[tuple]:
    """Lit ipsum.txt et retourne la liste de tuples (ip, score)."""
    rows = []
    with Path(ipsum_path).open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            ip, score = parts[0].strip(), parts[1].strip()
            if not score.isdigit():
                continue
            rows.append((ip, int(score)))
    log.info(f"{len(rows)} IPs parsées")
    return rows


INSERT_SQL = """
    INSERT INTO malicious_ips (ip, confidence_level)
    VALUES (%s, %s)
    ON CONFLICT (ip) DO UPDATE SET
        confidence_level = EXCLUDED.confidence_level,
        last_updated     = NOW()
"""


def ingest_ipsum(ipsum_path: str, db_url: str) -> None:
    """Lit ipsum.txt et insère les IPs dans malicious_ips."""
    rows = parse_ipsum(ipsum_path)

    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, INSERT_SQL, rows, page_size=1000)
        log.info(f"{len(rows)} IPs insérées dans malicious_ips")
    finally:
        conn.close()


if __name__ == "__main__":
    IPSUM_PATH = r"C:\Users\anton\Documents\recherche de stage 2026\Cyna_project\ipsum\ipsum.txt"
    DB_URL     = "postgresql://cyna:cyna_password@localhost:5433/cyna"
    ingest_ipsum(IPSUM_PATH, DB_URL)
