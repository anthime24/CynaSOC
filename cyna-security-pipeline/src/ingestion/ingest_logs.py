"""
Ingestion des logs de sécurité vers PostgreSQL.
Lit les fichiers .log, les parse et insère en batch dans security_logs.
"""

import json
import logging
import os
import random
from datetime import datetime, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from parse_logs import parse_ids_file, parse_access_file, parse_endpoint_file

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redistribution des timestamps sur les N derniers jours
# ---------------------------------------------------------------------------

def spread_timestamps(events: list[dict], days: int = 7) -> list[dict]:
    """Redistribue les timestamps sur les N derniers jours avec biais horaire diurne."""
    now = datetime.now()
    start = now - timedelta(days=days)

    for event in events:
        random_offset = random.random() * days * 86400
        new_ts = start + timedelta(seconds=random_offset)

        # Biais vers les heures de bureau (8h-18h) — 60% de redistribution hors plage
        if new_ts.hour < 8 or new_ts.hour > 18:
            if random.random() < 0.6:
                new_ts = new_ts.replace(hour=random.randint(8, 18))

        event["timestamp"] = new_ts

    return sorted(events, key=lambda x: x["timestamp"])


# ---------------------------------------------------------------------------
# Mapping parseur → colonnes PostgreSQL
# ---------------------------------------------------------------------------

def ids_to_row(e: dict) -> tuple:
    """Convertit un événement IDS en ligne pour security_logs."""
    return (
        e["timestamp"],
        "ids",
        e.get("source_ip"),
        e.get("destination_ip"),
        e.get("severity"),
        e.get("alert_type"),
        json.dumps(e, default=str),
    )


def access_to_row(e: dict) -> tuple:
    """Convertit un événement access en ligne pour security_logs."""
    return (
        e["timestamp"],
        "access",
        e.get("client_ip"),   # source_ip
        None,                  # pas de destination_ip dans les logs access
        None,                  # pas de severity
        e.get("method"),       # event_type = méthode HTTP
        json.dumps(e, default=str),
    )


def endpoint_to_row(e: dict) -> tuple:
    """Convertit un événement endpoint en ligne pour security_logs."""
    return (
        e["timestamp"],
        "endpoint",
        None,                      # pas d'IP dans les logs endpoint
        None,
        e.get("severity"),
        e.get("event_type"),
        json.dumps(e, default=str),
    )


# ---------------------------------------------------------------------------
# Insertion batch
# ---------------------------------------------------------------------------

INSERT_SQL = """
    INSERT INTO security_logs (timestamp, log_type, source_ip, dest_ip, severity, event_type, raw_log)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
"""


def insert_batch(cursor, rows: list[tuple]) -> None:
    """Insère une liste de lignes en batch."""
    psycopg2.extras.execute_batch(cursor, INSERT_SQL, rows, page_size=500)


# ---------------------------------------------------------------------------
# Pipeline d'ingestion
# ---------------------------------------------------------------------------

def ingest(log_dir: str, db_url: str) -> None:
    """Ingère les 3 types de logs depuis log_dir vers PostgreSQL."""
    ids_path      = os.path.join(log_dir, "ids.log")
    access_path   = os.path.join(log_dir, "access.log")
    endpoint_path = os.path.join(log_dir, "endpoint.log")

    # Parse
    ids_events      = parse_ids_file(ids_path)        if os.path.exists(ids_path)      else []
    access_events   = parse_access_file(access_path)   if os.path.exists(access_path)   else []
    endpoint_events = parse_endpoint_file(endpoint_path) if os.path.exists(endpoint_path) else []

    # Redistribuer les timestamps sur les 7 derniers jours
    ids_events      = spread_timestamps(ids_events)
    access_events   = spread_timestamps(access_events)
    endpoint_events = spread_timestamps(endpoint_events)

    ids_rows      = [ids_to_row(e)      for e in ids_events]
    access_rows   = [access_to_row(e)   for e in access_events]
    endpoint_rows = [endpoint_to_row(e) for e in endpoint_events]

    total = len(ids_rows) + len(access_rows) + len(endpoint_rows)
    log.info(f"Prêt à insérer : {len(ids_rows)} ids, {len(access_rows)} access, {len(endpoint_rows)} endpoint")

    # Insertion
    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                if ids_rows:
                    insert_batch(cur, ids_rows)
                if access_rows:
                    insert_batch(cur, access_rows)
                if endpoint_rows:
                    insert_batch(cur, endpoint_rows)
        log.info(f"{total} lignes insérées dans security_logs")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Test local
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    LOG_DIR = r"C:\Users\anton\Documents\recherche de stage 2026\Cyna_project\Security-Log-Generator\logs"
    DB_URL  = "postgresql://cyna:cyna_password@localhost:5433/cyna"

    ingest(LOG_DIR, DB_URL)
