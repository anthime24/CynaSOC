"""
ipsum_loader.py — Charge le feed de threat intelligence ipsum.txt
et expose une fonction get_malicious_ip() pour sélectionner
aléatoirement une IP malveillante (score >= 3).
"""

import logging
import random
import os

logger = logging.getLogger(__name__)

# Chemin absolu vers ipsum.txt, calculé depuis la position de ce fichier.
# Security-Log-Generator/ est au même niveau que ipsum/ dans le projet.
_IPSUM_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "ipsum",
    "ipsum.txt",
)

_MIN_SCORE = 3

_malicious_ips: list[str] = []
_loaded = False


def _load() -> None:
    """Parse ipsum.txt et remplit _malicious_ips (score >= _MIN_SCORE)."""
    global _malicious_ips, _loaded

    abs_path = os.path.normpath(_IPSUM_PATH)

    if not os.path.isfile(abs_path):
        logger.warning(
            "ipsum_loader: fichier introuvable : %s — get_malicious_ip() retournera None.",
            abs_path,
        )
        _loaded = True
        return

    ips: list[str] = []
    try:
        with open(abs_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                # Ignore les commentaires et les lignes vides
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) != 2:
                    continue
                ip, score_str = parts
                try:
                    score = int(score_str)
                except ValueError:
                    continue
                if score >= _MIN_SCORE:
                    ips.append(ip.strip())
    except OSError as exc:
        logger.warning(
            "ipsum_loader: impossible de lire %s (%s) — get_malicious_ip() retournera None.",
            abs_path,
            exc,
        )
        _loaded = True
        return

    _malicious_ips = ips
    _loaded = True
    logger.info(
        "ipsum_loader: %d IPs malveillantes chargées (score >= %d) depuis %s.",
        len(_malicious_ips),
        _MIN_SCORE,
        abs_path,
    )


def get_malicious_ip() -> str | None:
    """Retourne une IP malveillante aléatoire depuis le feed ipsum.

    Returns:
        Une chaîne représentant une adresse IP (ex. '185.220.101.34'),
        ou None si le fichier ipsum.txt est absent ou vide après filtrage.
    """
    if not _loaded:
        _load()

    if not _malicious_ips:
        return None

    return random.choice(_malicious_ips)


# Chargement au moment de l'import du module
_load()
