"""
Cyna SOC Dashboard — FastAPI Backend
Provides REST endpoints for the React dashboard.
"""

import json
import logging
import os
import subprocess
import sys
import threading

# S'assurer que le dossier api/ est dans sys.path pour importer pipeline_runner
sys.path.insert(0, os.path.dirname(__file__))
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cyna SOC API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://cyna:cyna_password@db:5432/cyna",
)

PIPELINE_STATUS_FILE = os.path.join(os.path.dirname(__file__), "_pipeline_status.json")
FEED_STATUS_FILE = os.path.join(os.path.dirname(__file__), "_feed_status.json")


def get_db():
    """Open and return a psycopg2 connection."""
    conn = psycopg2.connect(DATABASE_URL)
    return conn


def build_filters(
    from_date: Optional[str],
    to_date: Optional[str],
    types: Optional[str],
    min_confidence: Optional[int],
) -> tuple[list[str], list]:
    """
    Build WHERE clause fragments and parameter list from optional filter args.

    Returns (conditions, params) where conditions are fragments like 'sl.timestamp >= %s'
    and params are the corresponding values.
    """
    conditions: list[str] = []
    params: list = []

    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)
    if min_confidence is not None:
        conditions.append("el.confidence_level >= %s")
        params.append(min_confidence)

    return conditions, params


@app.get("/api/kpis")
def get_kpis(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
):
    """Return aggregate KPI metrics for the SOC overview cards."""
    conditions, params = build_filters(from_date, to_date, types, min_confidence)

    base_conditions = []
    base_params = []
    if from_date:
        base_conditions.append("timestamp >= %s")
        base_params.append(from_date)
    if to_date:
        base_conditions.append("timestamp <= %s")
        base_params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            base_conditions.append(f"log_type IN ({placeholders})")
            base_params.extend(type_list)

    base_where = ("WHERE " + " AND ".join(base_conditions)) if base_conditions else ""

    # Total all types: date-filtered only, no type restriction
    date_conds = []
    date_params = []
    if from_date:
        date_conds.append("timestamp >= %s")
        date_params.append(from_date)
    if to_date:
        date_conds.append("timestamp <= %s")
        date_params.append(to_date)
    date_where = ("WHERE " + " AND ".join(date_conds)) if date_conds else ""

    # For malicious and unique IPs we need the join with enriched_logs
    join_where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"SELECT COUNT(*) AS cnt FROM security_logs {date_where}", date_params)
        total_all_types = cur.fetchone()["cnt"]

        cur.execute(f"SELECT COUNT(*) AS cnt FROM security_logs {base_where}", base_params)
        total_logs = cur.fetchone()["cnt"]

        malicious_query = f"""
            SELECT COUNT(DISTINCT sl.id) AS cnt
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            WHERE el.is_malicious = TRUE
            {"AND " + " AND ".join(conditions) if conditions else ""}
        """
        cur.execute(malicious_query, params)
        malicious_logs = cur.fetchone()["cnt"]

        unique_ips_query = f"""
            SELECT COUNT(DISTINCT el.matched_ip) AS cnt
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            WHERE el.is_malicious = TRUE
            {"AND " + " AND ".join(conditions) if conditions else ""}
        """
        cur.execute(unique_ips_query, params)
        unique_ips = cur.fetchone()["cnt"]

        threat_rate = round((malicious_logs / total_logs * 100), 2) if total_logs > 0 else 0.0

        cur.close()
        conn.close()
        return {
            "total_logs": total_all_types,
            "malicious_logs": malicious_logs,
            "threat_rate": threat_rate,
            "unique_ips": unique_ips,
        }
    except Exception as exc:
        logger.error("KPI query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/timeline")
def get_timeline(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
):
    """Return hourly event counts (total vs malicious) for the timeline chart."""
    base_conditions = []
    base_params = []
    if from_date:
        base_conditions.append("sl.timestamp >= %s")
        base_params.append(from_date)
    if to_date:
        base_conditions.append("sl.timestamp <= %s")
        base_params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            base_conditions.append(f"sl.log_type IN ({placeholders})")
            base_params.extend(type_list)

    base_where = ("WHERE " + " AND ".join(base_conditions)) if base_conditions else ""

    # For malicious, add confidence filter if requested
    mal_conditions = base_conditions[:]
    mal_params = base_params[:]
    if min_confidence is not None:
        mal_conditions.append("el.confidence_level >= %s")
        mal_params.append(min_confidence)
    mal_where = ("WHERE " + " AND ".join(mal_conditions)) if mal_conditions else ""

    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        total_query = f"""
            SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(*) AS total
            FROM security_logs sl
            {base_where}
            GROUP BY hour
            ORDER BY hour
        """
        cur.execute(total_query, base_params)
        total_rows = {str(r["hour"]): r["total"] for r in cur.fetchall()}

        mal_query = f"""
            SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(*) AS malicious
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {mal_where}
            {"AND" if mal_where else "WHERE"} el.is_malicious = TRUE
            GROUP BY hour
            ORDER BY hour
        """
        # Fix the AND/WHERE logic
        if mal_conditions:
            mal_query = f"""
                SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(DISTINCT sl.id) AS malicious
                FROM security_logs sl
                JOIN enriched_logs el ON sl.id = el.log_id
                WHERE {" AND ".join(mal_conditions)} AND el.is_malicious = TRUE
                GROUP BY hour
                ORDER BY hour
            """
        else:
            mal_query = """
                SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(DISTINCT sl.id) AS malicious
                FROM security_logs sl
                JOIN enriched_logs el ON sl.id = el.log_id
                WHERE el.is_malicious = TRUE
                GROUP BY hour
                ORDER BY hour
            """

        cur.execute(mal_query, mal_params)
        mal_rows = {str(r["hour"]): r["malicious"] for r in cur.fetchall()}

        all_hours = sorted(set(list(total_rows.keys()) + list(mal_rows.keys())))
        result = [
            {
                "hour": h,
                "total": total_rows.get(h, 0),
                "malicious": mal_rows.get(h, 0),
            }
            for h in all_hours
        ]

        cur.close()
        conn.close()
        return result
    except Exception as exc:
        logger.error("Timeline query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/top-ips")
def get_top_ips(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
):
    """Return top 10 malicious IPs by hit count."""
    conditions = []
    params = []
    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)
    if min_confidence is not None:
        conditions.append("el.confidence_level >= %s")
        params.append(min_confidence)

    where_clause = ("WHERE " + " AND ".join(conditions) + " AND el.is_malicious = TRUE") if conditions else "WHERE el.is_malicious = TRUE"

    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        query = f"""
            SELECT
                el.matched_ip::text AS ip,
                COUNT(DISTINCT sl.id) AS hits,
                MAX(el.confidence_level) AS confidence,
                MIN(sl.timestamp) AS first_seen,
                MAX(sl.timestamp) AS last_seen
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {where_clause}
            GROUP BY el.matched_ip
            ORDER BY hits DESC
            LIMIT 10
        """
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "ip": r["ip"],
                "hits": r["hits"],
                "confidence": r["confidence"],
                "first_seen": str(r["first_seen"]) if r["first_seen"] else None,
                "last_seen": str(r["last_seen"]) if r["last_seen"] else None,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.error("Top IPs query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/type-severity")
def get_type_severity(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
):
    """Return log counts grouped by log_type and severity."""
    conditions = []
    params = []
    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)

    # For this endpoint we do not join enriched_logs unless min_confidence is set
    use_join = min_confidence is not None
    if use_join:
        conditions.append("el.confidence_level >= %s")
        params.append(min_confidence)

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        if use_join:
            query = f"""
                SELECT sl.log_type, sl.severity, COUNT(DISTINCT sl.id) AS count
                FROM security_logs sl
                JOIN enriched_logs el ON sl.id = el.log_id
                {where_clause}
                GROUP BY sl.log_type, sl.severity
                ORDER BY sl.log_type, sl.severity
            """
        else:
            query = f"""
                SELECT log_type, severity, COUNT(*) AS count
                FROM security_logs sl
                {where_clause}
                GROUP BY log_type, severity
                ORDER BY log_type, severity
            """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"log_type": r["log_type"], "severity": r["severity"], "count": r["count"]} for r in rows]
    except Exception as exc:
        logger.error("Type/severity query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/logs")
def get_logs(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    sort_field: Optional[str] = Query(None),
    sort_dir: Optional[str] = Query("desc"),
    filter_type: Optional[str] = Query(None),
    filter_severity: Optional[str] = Query(None),
):
    """Return paginated list of enriched logs."""
    conditions = ["el.is_malicious = TRUE"]
    params = []

    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)
    if min_confidence is not None:
        conditions.append("el.confidence_level >= %s")
        params.append(min_confidence)
    if filter_type:
        conditions.append("sl.log_type = %s")
        params.append(filter_type)
    if filter_severity:
        conditions.append("sl.severity = %s")
        params.append(filter_severity)

    where_clause = "WHERE " + " AND ".join(conditions)

    # Whitelist sort fields to prevent SQL injection
    allowed_sort_fields = {
        "timestamp": "sl.timestamp",
        "log_type": "sl.log_type",
        "severity": "sl.severity",
        "confidence_level": "el.confidence_level",
        "matched_ip": "el.matched_ip",
    }
    sort_sql = allowed_sort_fields.get(sort_field, "sl.timestamp")
    sort_dir_sql = "ASC" if sort_dir and sort_dir.lower() == "asc" else "DESC"

    offset = (page - 1) * limit

    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        count_query = f"""
            SELECT COUNT(DISTINCT sl.id) AS cnt
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {where_clause}
        """
        cur.execute(count_query, params)
        total = cur.fetchone()["cnt"]

        data_query = f"""
            SELECT
                sl.timestamp,
                el.matched_ip::text AS matched_ip,
                sl.log_type,
                sl.severity,
                el.confidence_level,
                sl.event_type
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {where_clause}
            ORDER BY {sort_sql} {sort_dir_sql}
            LIMIT %s OFFSET %s
        """
        cur.execute(data_query, params + [limit, offset])
        rows = cur.fetchall()
        cur.close()
        conn.close()

        data = [
            {
                "timestamp": str(r["timestamp"]) if r["timestamp"] else None,
                "matched_ip": r["matched_ip"],
                "log_type": r["log_type"],
                "severity": r["severity"],
                "confidence_level": r["confidence_level"],
                "event_type": r["event_type"],
            }
            for r in rows
        ]
        return {"data": data, "total": total, "page": page}
    except Exception as exc:
        logger.error("Logs query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/pipeline/status")
def get_pipeline_status():
    """Return the last pipeline run status from /tmp/pipeline_status.json."""
    try:
        if os.path.exists(PIPELINE_STATUS_FILE):
            with open(PIPELINE_STATUS_FILE, "r") as f:
                return json.load(f)
        return {"last_run": None, "status": "never_run"}
    except Exception as exc:
        logger.error("Status read failed: %s", exc)
        return {"last_run": None, "status": "error", "detail": str(exc)}


def _write_status(path: str, status: str, detail: str = None):
    payload = {"status": status, "last_run": datetime.now(timezone.utc).isoformat()}
    if detail:
        payload["detail"] = detail
    with open(path, "w") as f:
        json.dump(payload, f)


def _run_pipeline_task():
    """Background thread: runs the full pipeline and writes the final status."""
    try:
        from pipeline_runner import run_full_pipeline
        run_full_pipeline()
        _write_status(PIPELINE_STATUS_FILE, "completed")
    except Exception as exc:
        logger.error("Pipeline error: %s", exc)
        _write_status(PIPELINE_STATUS_FILE, "error", str(exc))
    logger.info("Pipeline finished with status: %s", json.load(open(PIPELINE_STATUS_FILE))["status"])


@app.post("/api/pipeline/run")
def run_pipeline():
    """Launch the full pipeline in a background thread and track its status."""
    try:
        with open(PIPELINE_STATUS_FILE, "w") as f:
            json.dump({"status": "running", "last_run": datetime.now(timezone.utc).isoformat()}, f)
        thread = threading.Thread(target=_run_pipeline_task, daemon=True)
        thread.start()
        return {"status": "started"}
    except Exception as exc:
        logger.error("Pipeline run failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


def _run_feed_task():
    """Background thread: updates the ipsum feed and writes status."""
    try:
        from pipeline_runner import run_feed_update
        run_feed_update()
        _write_status(FEED_STATUS_FILE, "completed")
    except Exception as exc:
        logger.error("Feed update error: %s", exc)
        _write_status(FEED_STATUS_FILE, "error", str(exc))


@app.post("/api/pipeline/update-feed")
def update_feed():
    """Download and ingest the latest ipsum threat feed."""
    try:
        _write_status(FEED_STATUS_FILE, "running")
        thread = threading.Thread(target=_run_feed_task, daemon=True)
        thread.start()
        return {"status": "started"}
    except Exception as exc:
        logger.error("Feed update failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/pipeline/feed-status")
def get_feed_status():
    """Return the last feed update status."""
    try:
        if os.path.exists(FEED_STATUS_FILE):
            with open(FEED_STATUS_FILE, "r") as f:
                return json.load(f)
        return {"last_run": None, "status": "never_run"}
    except Exception as exc:
        return {"last_run": None, "status": "error", "detail": str(exc)}


@app.post("/api/reset")
def reset_data():
    """Truncate security_logs and enriched_logs, restart sequences."""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("TRUNCATE enriched_logs, security_logs RESTART IDENTITY CASCADE")
        conn.commit()
        cur.close()
        conn.close()
        _write_status(PIPELINE_STATUS_FILE, "never_run")
        logger.info("Database reset: security_logs and enriched_logs truncated")
        return {"status": "reset"}
    except Exception as exc:
        logger.error("Reset failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/refresh")
def refresh():
    """Health check / manual refresh trigger."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/critical-alerts")
def get_critical_alerts(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
):
    """Return the 5 most recent malicious logs with confidence >= 6."""
    conditions = ["el.is_malicious = TRUE", "el.confidence_level >= 6"]
    params = []
    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)
    where_clause = "WHERE " + " AND ".join(conditions)
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(f"""
            SELECT sl.timestamp, sl.log_type, sl.source_ip::text,
                   el.matched_ip::text, el.confidence_level,
                   sl.event_type, sl.raw_log
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {where_clause}
            ORDER BY sl.timestamp DESC
            LIMIT 5
        """, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [
            {
                "timestamp": str(r["timestamp"]) if r["timestamp"] else None,
                "log_type": r["log_type"],
                "source_ip": r["source_ip"],
                "matched_ip": r["matched_ip"],
                "confidence_level": r["confidence_level"],
                "event_type": r["event_type"],
                "raw_log": r["raw_log"],
            }
            for r in rows
        ]
    except Exception as exc:
        logger.error("Critical alerts query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/feed-stats")
def get_feed_stats():
    """Return aggregate stats from the malicious_ips table."""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                COUNT(*) AS total_ips,
                COUNT(*) FILTER (WHERE confidence_level >= 6) AS high_confidence,
                COUNT(*) FILTER (WHERE confidence_level BETWEEN 3 AND 5) AS medium_confidence,
                COUNT(*) FILTER (WHERE confidence_level <= 2) AS low_confidence,
                MAX(last_updated) AS last_updated
            FROM malicious_ips
        """)
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {
            "total_ips": row["total_ips"],
            "high_confidence": row["high_confidence"],
            "medium_confidence": row["medium_confidence"],
            "low_confidence": row["low_confidence"],
            "last_updated": str(row["last_updated"]) if row["last_updated"] else None,
        }
    except Exception as exc:
        logger.error("Feed stats query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/endpoint-stats")
def get_endpoint_stats(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
):
    """Return endpoint event counts: total, malware detections, scans."""
    conditions = ["log_type = 'endpoint'"]
    params = []
    if from_date:
        conditions.append("timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("timestamp <= %s")
        params.append(to_date)
    where_clause = "WHERE " + " AND ".join(conditions)
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(f"""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE event_type ILIKE '%%malware%%'
                                    OR event_type ILIKE '%%detection%%') AS malware_detected,
                COUNT(*) FILTER (WHERE event_type ILIKE '%%scan%%') AS scans_performed
            FROM security_logs
            {where_clause}
        """, params)
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {
            "total": row["total"],
            "malware_detected": row["malware_detected"],
            "scans_performed": row["scans_performed"],
        }
    except Exception as exc:
        logger.error("Endpoint stats query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/logs/export")
def export_logs(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    types: Optional[str] = Query(None),
    min_confidence: Optional[int] = Query(None),
    filter_type: Optional[str] = Query(None),
    filter_severity: Optional[str] = Query(None),
):
    """Stream all matching logs as a CSV file (max 50 000 rows)."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    conditions = ["el.is_malicious = TRUE"]
    params = []
    if from_date:
        conditions.append("sl.timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("sl.timestamp <= %s")
        params.append(to_date)
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip()]
        if type_list:
            placeholders = ",".join(["%s"] * len(type_list))
            conditions.append(f"sl.log_type IN ({placeholders})")
            params.extend(type_list)
    if min_confidence is not None:
        conditions.append("el.confidence_level >= %s")
        params.append(min_confidence)
    if filter_type:
        conditions.append("sl.log_type = %s")
        params.append(filter_type)
    if filter_severity:
        conditions.append("sl.severity = %s")
        params.append(filter_severity)

    where_clause = "WHERE " + " AND ".join(conditions)
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(f"""
            SELECT sl.timestamp, sl.log_type, sl.source_ip::text, sl.dest_ip::text,
                   sl.severity, sl.event_type, el.matched_ip::text, el.confidence_level
            FROM security_logs sl
            JOIN enriched_logs el ON sl.id = el.log_id
            {where_clause}
            ORDER BY sl.timestamp DESC
            LIMIT 50000
        """, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp", "log_type", "source_ip", "dest_ip",
                         "severity", "event_type", "matched_ip", "confidence_level"])
        for r in rows:
            writer.writerow([r["timestamp"], r["log_type"], r["source_ip"], r["dest_ip"],
                             r["severity"], r["event_type"], r["matched_ip"], r["confidence_level"]])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=security_logs_export.csv"},
        )
    except Exception as exc:
        logger.error("Export query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
