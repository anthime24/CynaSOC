"""
Pipeline runner — importe et exécute les scripts existants directement en Python.
Évite les problèmes de chemins subprocess cross-platform (Windows/Docker).
"""

import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

log = logging.getLogger(__name__)

# Détection automatique du PROJECT_ROOT :
# - En Docker : pipeline_runner.py est copié dans /app/ (même niveau que src/)
# - En local  : pipeline_runner.py est dans api/ (src/ est dans le dossier parent)
_here = Path(__file__).parent
if (_here / "src").exists():
    _default_root = str(_here)          # Docker : /app/
else:
    _default_root = str(_here.parent)   # local  : cyna-security-pipeline/

PROJECT_ROOT = Path(os.getenv("PROJECT_ROOT", _default_root))

DB_URL = os.getenv("DATABASE_URL", "postgresql://cyna:cyna_password@localhost:5433/cyna")

# Chemin vers ipsum.txt — à côté du projet (../ipsum/ipsum.txt) ou via var d'env
IPSUM_PATH = os.getenv(
    "IPSUM_PATH",
    str(PROJECT_ROOT.parent / "ipsum" / "ipsum.txt"),
)

LOG_DIR = os.getenv("LOG_DIR", str(PROJECT_ROOT / "logs"))

GENERATOR_DIR = os.getenv(
    "GENERATOR_DIR",
    str(PROJECT_ROOT.parent / "Security-Log-Generator"),
)

LOG_EVENTS = int(os.getenv("LOG_EVENTS", "500"))


def _add_src_to_path():
    """Ajoute src/ingestion et src/enrichment au sys.path pour les imports."""
    ingestion_dir = str(PROJECT_ROOT / "src" / "ingestion")
    enrichment_dir = str(PROJECT_ROOT / "src" / "enrichment")
    if ingestion_dir not in sys.path:
        sys.path.insert(0, ingestion_dir)
    if enrichment_dir not in sys.path:
        sys.path.insert(0, enrichment_dir)


def generate_logs():
    """Lance le Security-Log-Generator pour les 3 types puis copie les fichiers dans LOG_DIR."""
    import yaml

    gen_dir = Path(GENERATOR_DIR)
    if not gen_dir.exists():
        log.warning("Security-Log-Generator introuvable à %s — génération ignorée", gen_dir)
        return

    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(str(gen_dir / "logs"), exist_ok=True)
    config_path = gen_dir / "config.yaml"

    for log_type in ["ids", "access", "endpoint"]:
        log.info("Génération de %d événements %s...", LOG_EVENTS, log_type)

        # Lire et surcharger la config pour ce type
        with open(config_path, "r") as f:
            cfg = yaml.safe_load(f)
        cfg["config"]["log_type"] = log_type
        cfg["config"]["event_distribution"] = "linear"
        cfg["config"]["no_events"] = LOG_EVENTS
        cfg["config"]["write_time"] = 0
        with open(config_path, "w") as f:
            yaml.dump(cfg, f)

        result = subprocess.run(
            [sys.executable, "main.py"],
            cwd=str(gen_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            log.error("Génération %s échouée : %s", log_type, result.stderr[-300:])
        else:
            log.info("Génération %s terminée", log_type)

    # Copier les fichiers générés vers LOG_DIR
    gen_logs = gen_dir / "logs"
    for fname in ["ids.log", "access.log", "endpoint.log"]:
        src = gen_logs / fname
        if src.exists():
            shutil.copy(str(src), os.path.join(LOG_DIR, fname))
            log.info("Copié %s → %s", src, LOG_DIR)
        else:
            log.warning("Fichier %s non trouvé après génération", src)


def run_full_pipeline():
    """Exécute les 3 étapes du pipeline : ingest_logs → ingest_ipsum → enrich."""
    _add_src_to_path()

    from ingest_logs import ingest
    from ingest_ipsum import ingest_ipsum
    from enrich import enrich

    log.info("=== Étape 0/3 : génération des logs ===")
    generate_logs()

    log.info("=== Étape 1/3 : ingestion des logs depuis %s ===", LOG_DIR)
    ingest(LOG_DIR, DB_URL)

    log.info("=== Étape 2/3 : ingestion ipsum depuis %s ===", IPSUM_PATH)
    ingest_ipsum(IPSUM_PATH, DB_URL)

    log.info("=== Étape 3/3 : enrichissement (jointure logs × IPs) ===")
    enrich(DB_URL)

    log.info("=== Pipeline terminé avec succès ===")


IPSUM_URL = "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt"


def run_feed_update():
    """Télécharge ipsum.txt depuis GitHub puis ingère les IPs dans malicious_ips."""
    import requests
    import tempfile

    _add_src_to_path()
    from ingest_ipsum import ingest_ipsum

    log.info("=== Téléchargement du feed ipsum depuis %s ===", IPSUM_URL)
    response = requests.get(IPSUM_URL, timeout=60)
    response.raise_for_status()

    # Écrire dans un fichier temporaire
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tmp:
        tmp.write(response.text)
        tmp_path = tmp.name

    lines = sum(1 for l in response.text.splitlines() if l and not l.startswith("#"))
    log.info("=== %d IPs téléchargées, ingestion en cours ===", lines)

    try:
        ingest_ipsum(tmp_path, DB_URL)
    finally:
        os.unlink(tmp_path)

    log.info("=== Feed mis à jour depuis internet ===")
