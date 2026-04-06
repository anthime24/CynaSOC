#!/usr/bin/env bash
# Orchestrateur du pipeline Cyna
# Usage : bash scripts/run_pipeline.sh
set -e

DB_URL="${DATABASE_URL:-postgresql://cyna:cyna_password@db:5432/cyna}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
IPSUM_PATH="${IPSUM_PATH:-$PROJECT_ROOT/../ipsum/ipsum.txt}"
GENERATOR_DIR="${GENERATOR_DIR:-$PROJECT_ROOT/../Security-Log-Generator}"

echo "[pipeline] Démarrage — $(date)"
echo "[pipeline] PROJECT_ROOT=$PROJECT_ROOT"
echo "[pipeline] GENERATOR_DIR=$GENERATOR_DIR"
echo "[pipeline] LOG_DIR=$LOG_DIR"
echo "[pipeline] IPSUM_PATH=$IPSUM_PATH"

mkdir -p "$LOG_DIR"
mkdir -p "$GENERATOR_DIR/logs"

# Étape 0 — Génération des logs
echo "[pipeline] Étape 0/3 : génération des logs (ids, access, endpoint)"
cd "$GENERATOR_DIR"
for LOG_TYPE in ids access endpoint; do
    echo "[pipeline]   → génération $LOG_TYPE"
    python -c "
import yaml, sys
with open('config.yaml', 'r') as f:
    cfg = yaml.safe_load(f)
cfg['config']['log_type'] = '$LOG_TYPE'
cfg['config']['no_events'] = 500
cfg['config']['write_time'] = 0
with open('config.yaml', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False)
"
    python main.py
    cp "logs/$LOG_TYPE.log" "$LOG_DIR/$LOG_TYPE.log"
done

# Étape 1 — Ingestion des logs
echo "[pipeline] Étape 1/3 : ingestion des logs"
cd "$PROJECT_ROOT/src/ingestion"
DATABASE_URL="$DB_URL" LOG_DIR="$LOG_DIR" python -c "
import os, sys
sys.path.insert(0, '.')
from ingest_logs import ingest
ingest(os.environ['LOG_DIR'], os.environ['DATABASE_URL'])
"

# Étape 2 — Ingestion ipsum
echo "[pipeline] Étape 2/3 : ingestion ipsum"
DATABASE_URL="$DB_URL" IPSUM_PATH="$IPSUM_PATH" python -c "
import os, sys
sys.path.insert(0, '.')
from ingest_ipsum import ingest_ipsum
ingest_ipsum(os.environ['IPSUM_PATH'], os.environ['DATABASE_URL'])
"

# Étape 3 — Enrichissement
echo "[pipeline] Étape 3/3 : enrichissement"
cd "$PROJECT_ROOT/src/enrichment"
DATABASE_URL="$DB_URL" python -c "
import os, sys
sys.path.insert(0, '.')
from enrich import enrich
enrich(os.environ['DATABASE_URL'])
"

echo "[pipeline] Terminé — $(date)"
