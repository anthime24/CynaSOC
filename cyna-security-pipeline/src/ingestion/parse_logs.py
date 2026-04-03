"""
Parseurs de logs pour Security-Log-Generator.
Supporte 3 types : ids, access, endpoint.
"""

import re
from datetime import datetime
from pathlib import Path


# ---------------------------------------------------------------------------
# IDS
# Format : timestamp - logger_id - severity - protocol - src_ip:port --> dst_ip:port - flag - alert_type
# ---------------------------------------------------------------------------

IDS_PATTERN = re.compile(
    r"(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)"
    r" - \S+"
    r" - (?P<severity>\w+)"
    r" - (?P<protocol>\w+)"
    r" - (?P<source_ip>[\d.]+):(?P<source_port>\d+)"
    r" --> "
    r"(?P<destination_ip>[\d.]+):(?P<destination_port>\d+)"
    r" - (?P<flag>\w+)"
    r" - (?P<alert_type>.+)"
)


def parse_ids_line(line: str) -> dict | None:
    line = line.strip()
    match = IDS_PATTERN.match(line)
    if not match:
        return None
    data = match.groupdict()
    data["timestamp"] = datetime.strptime(data["timestamp"].replace(",", "."), "%Y-%m-%d %H:%M:%S.%f")
    data["severity"] = data["severity"].replace("_severity", "")
    data["source_port"] = int(data["source_port"])
    data["destination_port"] = int(data["destination_port"])
    return data


def parse_ids_file(log_path: str) -> list[dict]:
    path = Path(log_path)
    events, errors = [], 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            result = parse_ids_line(line)
            if result:
                events.append(result)
            elif line.strip():
                errors += 1
    print(f"[ids] {len(events)} événements parsés, {errors} lignes ignorées")
    return events


# ---------------------------------------------------------------------------
# ACCESS
# Format : [timestamp] - logger_id - client_ip - username "METHOD url HTTP/x.x status bytes referer" "user_agent"
# ---------------------------------------------------------------------------

ACCESS_PATTERN = re.compile(
    r"\[(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)\]"
    r" - \S+"
    r" - (?P<client_ip>[\d.]+)"
    r" - (?P<username>\S+)"
    r' "(?P<method>\w+) (?P<url>\S+) (?P<protocol>HTTPS?)/(?P<http_version>[\d.]+)'
    r' (?P<status_code>\d+) (?P<bytes>\d+) (?P<referer>.+?)"'
    r' "(?P<user_agent>.+)"'
)


def parse_access_line(line: str) -> dict | None:
    line = line.strip()
    match = ACCESS_PATTERN.match(line)
    if not match:
        return None
    data = match.groupdict()
    data["timestamp"] = datetime.strptime(data["timestamp"].replace(",", "."), "%Y-%m-%d %H:%M:%S.%f")
    data["status_code"] = int(data["status_code"])
    data["bytes"] = int(data["bytes"])
    # Nettoyer les guillemets doubles autour du user_agent (ex: ""Googlebot..."")
    data["user_agent"] = data["user_agent"].strip('"')
    return data


def parse_access_file(log_path: str) -> list[dict]:
    path = Path(log_path)
    events, errors = [], 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            result = parse_access_line(line)
            if result:
                events.append(result)
            elif line.strip():
                errors += 1
    print(f"[access] {len(events)} événements parsés, {errors} lignes ignorées")
    return events


# ---------------------------------------------------------------------------
# ENDPOINT
# Format multi-lignes : blocs séparés par une ligne "Date: ..."
# Champs variables selon Event Type
# ---------------------------------------------------------------------------

def parse_endpoint_file(log_path: str) -> list[dict]:
    path = Path(log_path)
    events = []
    current: dict = {}

    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            # Chaque nouveau bloc commence par "Date:"
            if line.startswith("Date:"):
                if current:
                    events.append(current)
                raw_ts = line.split("Date:", 1)[1].strip()
                current = {
                    "timestamp": datetime.strptime(raw_ts.replace(",", "."), "%Y-%m-%d %H:%M:%S.%f")
                }
            elif ":" in line:
                key, _, value = line.partition(":")
                current[key.strip().lower().replace(" ", "_").replace("/", "_")] = value.strip()

        if current:  # dernier bloc
            events.append(current)

    print(f"[endpoint] {len(events)} événements parsés")
    return events


# ---------------------------------------------------------------------------
# Test rapide
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json

    BASE = r"C:\Users\anton\Documents\recherche de stage 2026\Cyna_project\Security-Log-Generator\logs"

    print("=== IDS ===")
    ids_events = parse_ids_file(f"{BASE}\\ids.log")
    for e in ids_events[:2]:
        print(json.dumps(e, default=str, indent=2))

    print("\n=== ACCESS ===")
    access_events = parse_access_file(f"{BASE}\\access.log")
    for e in access_events[:2]:
        print(json.dumps(e, default=str, indent=2))

    print("\n=== ENDPOINT ===")
    endpoint_events = parse_endpoint_file(f"{BASE}\\endpoint.log")
    for e in endpoint_events[:2]:
        print(json.dumps(e, default=str, indent=2))
