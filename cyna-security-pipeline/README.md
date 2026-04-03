# Cyna SOC Security Pipeline

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

Pipeline de cybersécurité complet : ingestion de logs simulés, enrichissement par threat intelligence (ipsum), et dashboard SOC interactif — le tout en une seule commande Docker.

---

## Architecture

```
Security-Log-Generator (ids / access / endpoint)
              │
              │  subprocess × 3 types
              ▼
        ingest_logs.py
              │  INSERT batch (execute_batch, page_size=500)
              ▼
       security_logs (PostgreSQL)
              │
              │                    ipsum GitHub Feed (~129 212 IPs)
              │                              │
              │                     ingest_ipsum.py
              │                    UPSERT batch → malicious_ips
              │                              │
              └──────────┬───────────────────┘
                         │
                     enrich.py
              (JOIN source_ip / dest_ip ↔ malicious_ips)
                         │
                         ▼
                   enriched_logs (PostgreSQL)
                         │
                         ▼
              FastAPI — port 8000 (/api/*)
                         │
                         ▼
           React Dashboard — port 3000
```

---

## Stack technique

| Composant | Technologie | Rôle | Justification |
|-----------|-------------|------|---------------|
| Base de données | PostgreSQL 15 | Stockage, jointures, index | Requêtes SQL complexes avec `INET`, `JSONB`, `DISTINCT` ; robuste et léger |
| Pipeline | Python 3.11 | Ingestion, parsing, enrichissement | Contrôle fin, batch inserts natifs avec psycopg2 |
| API | FastAPI | Endpoints JSON pour le dashboard | Async, auto-doc Swagger, gestion d'erreurs propre |
| Dashboard | React 18 + Recharts | Visualisation interactive | Composants autonomes, rafraîchissement indépendant par panel |
| Build frontend | Vite + Nginx | Bundling + serving statique | Image finale légère, build rapide |
| Orchestration | Docker Compose | Lance tout en une commande | Reproductibilité totale, healthcheck sur la base |
| Logs simulés | Security-Log-Generator | Génère des logs IDS/Access/Endpoint réalistes | Source externe (cruikshank25), modifiée pour injecter des IPs ipsum |
| Threat intel | ipsum (stamparm) | ~129 000 IPs malveillantes agrégées | Domaine public, mise à jour quotidienne, format simple |

---

## Prérequis

- **Docker Desktop** — c'est tout.

Aucune installation Python, Node.js ou PostgreSQL requise en local. Tout tourne dans les containers.

---

## Lancement en une commande

```bash
git clone https://github.com/anthime24/CynaSOC.git
cd CynaSOC/cyna-security-pipeline
cp .env.example .env
docker-compose up --build
```

Le premier build prend environ 3-5 minutes (téléchargement des images, installation des dépendances).

| Service | URL |
|---------|-----|
| Dashboard SOC | http://localhost:3000 |
| API REST (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5433 (user/pass dans `.env`) |

Une fois les containers démarrés, cliquer sur **Run Pipeline** dans le dashboard pour lancer la génération, l'ingestion et l'enrichissement.

---

## Ce que fait le pipeline — 4 étapes

### Etape 0 — Génération des logs

Le service `pipeline` lance `Security-Log-Generator` trois fois via subprocess, en modifiant `config.yaml` à la volée pour chaque type :

| Type | Fichier | Volume | Champs clés |
|------|---------|--------|-------------|
| `ids` | `ids.log` | ~500 événements | timestamp, source_ip, dest_ip, protocol, severity, alert_type |
| `access` | `access.log` | ~500 événements | timestamp, client_ip, method, url, status_code, user_agent |
| `endpoint` | `endpoint.log` | ~500 événements | timestamp, host_ip, event_type, process, severity |

**Injection d'IPs malveillantes :** environ 20 % des IPs générées dans les logs `ids` et `access` sont remplacées par des IPs réelles extraites du feed ipsum (score >= 4). C'est la condition nécessaire pour que l'enrichissement produise des résultats (voir section "Défis rencontrés").

### Etape 1 — Ingestion des logs (`ingest_logs.py`)

- Trois parseurs distincts selon le format de chaque type de log
- Le format `endpoint` est multi-lignes (blocs `Date:`) — parsé différemment des deux autres
- Insertion en batch via `execute_batch` (page_size=500)
- Résultat : ~1 500 lignes dans `security_logs` (500 × 3 types)

### Etape 2 — Ingestion ipsum (`ingest_ipsum.py`)

- Lecture du fichier `ipsum/ipsum.txt` (monté en lecture seule dans le container)
- Parsing des lignes `IP\tscore`, commentaires ignorés
- `INSERT ... ON CONFLICT DO UPDATE` pour permettre les mises à jour incrémentales
- **129 212 IPs** insérées dans `malicious_ips`

### Etape 3 — Enrichissement (`enrich.py`)

- Jointure SQL entre `security_logs` et `malicious_ips` sur `source_ip` OU `dest_ip`
- Un même log peut générer deux entrées dans `enriched_logs` (match sur source ET destination)
- `is_malicious = TRUE` positionné sur chaque correspondance
- Les KPIs et graphiques utilisent `COUNT(DISTINCT sl.id)` pour éviter le double-comptage

---

## Dashboard SOC — 6 panels

### Filtres globaux (sidebar)

| Filtre | Type | Détail |
|--------|------|--------|
| Plage de dates | Date pickers | Appliqué à tous les panels |
| Type de log | Cases à cocher | IDS / Access (Endpoint exclu — pas d'IP à corréler) |
| Score de confiance minimum | Slider 1-10 | Filtre les IPs ipsum par score |

Auto-refresh toutes les 30 secondes. Dark / Light mode avec persistance `localStorage`.

---

### Panel 1 — KPI Cards

5 métriques instantanées :

| Métrique | Source |
|----------|--------|
| Total logs | `COUNT(*) FROM security_logs` |
| Logs malveillants | `COUNT(DISTINCT sl.id)` avec JOIN enriched_logs |
| Taux de menace (%) | malveillants / total × 100 |
| IPs malveillantes uniques | `COUNT(DISTINCT matched_ip)` |
| Endpoint Events | Total / malware détectés / scans (filtre séparé) |

### Panel 2 — Alertes critiques (live)

Encart mis à jour en temps réel. Affiche les 5 derniers logs dont le score de confiance ipsum est **>= 6**, avec :
- Point rouge clignotant
- Temps relatif ("il y a 3 min")
- IP malveillante en monospace rouge
- Badge type (IDS / Access) et score de confiance

Si aucune alerte : message "Système sain" en vert.

### Panel 3 — Timeline Area Chart

Graphique de surface double, groupé par heure :
- Zone grise : tous les événements (IDS + Access)
- Zone rouge : événements malveillants uniquement

Visualise les pics d'activité et la proportion de trafic suspect au fil du temps.

### Panel 4 — Top 10 IPs malveillantes

Bar chart horizontal trié par nombre de hits. Pour chaque IP : hits (`COUNT(DISTINCT sl.id)`), score de confiance maximum, première et dernière occurrence.

### Panel 5 — Répartition types et sévérités

- **Donut** : répartition IDS / Access / Endpoint
- **Bar chart empilé** : sévérités par type (Access exclu — les codes HTTP ne constituent pas un niveau de menace pertinent ; filtré côté frontend)

### Panel 6 — Tableau des logs malveillants

- Onglets Tous / IDS / Access
- Pagination serveur : 20 lignes par page via `LIMIT/OFFSET`
- Filtres dropdown type et sévérité
- **Export CSV** : téléchargement via `StreamingResponse` FastAPI, limité à 50 000 lignes

---

## Boutons d'action

| Bouton | Action |
|--------|--------|
| **Run Pipeline** | Génère les logs, ingère, enrichit — suivi de progression par polling toutes les 5s |
| **Update Feed** | Télécharge la dernière version d'ipsum depuis GitHub et met à jour `malicious_ips` |
| **Refresh Data** | Force le re-fetch de tous les panels sans relancer le pipeline |
| **Reset** | Modal de confirmation → `TRUNCATE` des 3 tables + relance automatique du pipeline |

---

## Schéma PostgreSQL

### Table `security_logs`

```sql
id          SERIAL PRIMARY KEY
timestamp   TIMESTAMPTZ NOT NULL
log_type    VARCHAR(50)          -- 'ids', 'access', 'endpoint'
source_ip   INET
dest_ip     INET
severity    VARCHAR(20)
event_type  VARCHAR(100)
raw_log     JSONB                -- log brut complet
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### Table `malicious_ips`

```sql
ip               INET PRIMARY KEY
confidence_level INTEGER NOT NULL   -- score ipsum 1-10
last_updated     TIMESTAMPTZ DEFAULT NOW()
```

### Table `enriched_logs`

```sql
id               SERIAL PRIMARY KEY
log_id           INTEGER REFERENCES security_logs(id)
matched_ip       INET
confidence_level INTEGER
is_malicious     BOOLEAN DEFAULT FALSE
enriched_at      TIMESTAMPTZ DEFAULT NOW()
```

### Index

```sql
CREATE INDEX idx_logs_source_ip  ON security_logs(source_ip);
CREATE INDEX idx_logs_dest_ip    ON security_logs(dest_ip);
CREATE INDEX idx_logs_timestamp  ON security_logs(timestamp);
CREATE INDEX idx_logs_type       ON security_logs(log_type);
CREATE INDEX idx_malicious_ip    ON malicious_ips(ip);
```

---

## Structure du repo

```
cyna-security-pipeline/
│
├── docker-compose.yml          # 4 services : db, pipeline, api, frontend
├── Dockerfile                  # Image Python commune (pipeline)
├── requirements.txt            # Dépendances Python communes
├── .env.example                # Template des variables d'environnement
├── .gitignore
│
├── config/
│   └── init.sql                # Schéma PostgreSQL + index (exécuté au démarrage de la db)
│
├── src/
│   ├── ingestion/
│   │   ├── parse_logs.py       # 3 parseurs (ids, access, endpoint multi-lignes)
│   │   ├── ingest_logs.py      # Orchestre le parsing et les batch inserts
│   │   └── ingest_ipsum.py     # Lit ipsum.txt → UPSERT malicious_ips
│   └── enrichment/
│       └── enrich.py           # JOIN security_logs ↔ malicious_ips → enriched_logs
│
├── api/
│   ├── Dockerfile              # Image FastAPI
│   ├── main.py                 # Tous les endpoints /api/* + build_filters()
│   ├── pipeline_runner.py      # Orchestration Python du pipeline complet
│   └── requirements.txt
│
├── frontend/
│   ├── Dockerfile              # Build Vite + Nginx
│   ├── nginx.conf              # Proxy /api → FastAPI
│   ├── src/
│   │   ├── App.jsx             # Filtres globaux, auto-refresh, dark mode
│   │   ├── components/
│   │   │   ├── KPICards.jsx
│   │   │   ├── CriticalAlerts.jsx
│   │   │   ├── Timeline.jsx
│   │   │   ├── TopIPs.jsx
│   │   │   ├── TypeSeverityCharts.jsx
│   │   │   ├── LogsTable.jsx
│   │   │   ├── ActionBar.jsx
│   │   │   └── FeedStats.jsx
│   │   └── hooks/              # Hooks React custom (fetch, refresh)
│   └── package.json
│
├── scripts/
│   └── run_pipeline.sh         # Orchestrateur bash (étapes 0 à 3)
│
├── logs/                       # Fichiers .log générés (ignorés par git)
│
└── docs/
    ├── progression.md          # Historique de développement
    └── dashboard_fonctionnement.md
```

---

## Commandes utiles

```bash
# Lancer tout le projet
docker-compose up --build

# Voir les logs du pipeline
docker-compose logs pipeline
docker-compose logs api

# Se connecter à PostgreSQL
docker exec -it cyna-db psql -U cyna -d cyna

# Vérifier les données en base
docker exec -it cyna-db psql -U cyna -d cyna -c "SELECT COUNT(*) FROM security_logs;"
docker exec -it cyna-db psql -U cyna -d cyna -c "SELECT COUNT(*) FROM malicious_ips;"
docker exec -it cyna-db psql -U cyna -d cyna -c "SELECT COUNT(*) FROM enriched_logs WHERE is_malicious = TRUE;"

# Reset complet (supprime les volumes)
docker-compose down -v
docker-compose up --build

# Monitorer la consommation RAM
docker stats --no-stream
```

---

## Défis rencontrés

### 1. IPs Faker vs IPs réelles ipsum — 0 correspondance initiale

**Problème :** Security-Log-Generator utilise la librairie Faker pour générer des IPs aléatoires. Ces IPs fictives n'ont aucune chance de correspondre aux 129 212 IPs réelles du feed ipsum. La jointure produisait systématiquement 0 résultat.

```
security_logs.source_ip  →  ex: 61.72.88.110   (générée par Faker)
malicious_ips.ip         →  ex: 185.220.101.34 (vraie IP recensée)
```

**Solution retenue :** modification du générateur pour injecter ~20 % d'IPs réelles extraites de `malicious_ips` (score >= 4) dans les logs `ids` et `access`. Cette manipulation est intentionnelle et documentée — c'est un compromis inhérent à tout projet qui croise des données simulées avec une threat intelligence réelle.

---

### 2. Port 5432 déjà occupé en local

**Problème :** un PostgreSQL local tournant sur le port 5432 empêchait le container de s'exposer sur ce port.

**Solution :** PostgreSQL exposé sur `5433` en local (`5433:5432` dans `docker-compose.yml`). Internalement, les containers communiquent toujours sur le port `5432` standard via le réseau Docker.

---

### 3. Surestimation des métriques avec `COUNT(*)`

**Problème :** un même log peut matcher deux IPs malveillantes (source_ip ET dest_ip présentes dans ipsum), créant deux lignes dans `enriched_logs` pour le même `log_id`. Un `COUNT(*)` naif avec JOIN donnait des chiffres gonflés, et la courbe "malveillants" pouvait dépasser le "total" sur la timeline.

**Solution :** `COUNT(DISTINCT sl.id)` systématique sur tous les endpoints qui joignent `enriched_logs` :

| Endpoint | Fix |
|----------|-----|
| `/api/kpis` | `COUNT(DISTINCT sl.id)` |
| `/api/timeline` | `COUNT(DISTINCT sl.id)` par heure |
| `/api/top-ips` | `COUNT(DISTINCT sl.id)` par IP |
| `/api/type-severity` | `COUNT(DISTINCT sl.id)` |
| `/api/logs` (pagination) | `COUNT(DISTINCT sl.id)` pour le total |

---

## Améliorations possibles

- **Pool de connexions** : psycopg2 ouvre et ferme une connexion par requête. En production, utiliser `psycopg2.pool` ou migrer vers `asyncpg` pour des performances meilleures sous charge.

- **Streaming de logs réels** : remplacer la génération batch par une ingestion continue (fichiers rotatifs, syslog, ou Filebeat) pour un pipeline orienté temps réel.

- **Alerting** : ajouter un système de notifications (email, webhook Slack) déclenché quand le taux de menace dépasse un seuil configurable.

- **Authentification** : l'API et le dashboard sont actuellement ouverts sans auth. En contexte de production SOC, ajouter un mécanisme d'authentification (JWT, OAuth2) est indispensable.

---

## Variables d'environnement

Copier `.env.example` en `.env` avant le premier lancement :

```bash
cp .env.example .env
```

| Variable | Valeur par défaut | Rôle |
|----------|------------------|------|
| `POSTGRES_DB` | `cyna` | Nom de la base |
| `POSTGRES_USER` | `cyna` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | `cyna_password` | Mot de passe (à changer en prod) |
| `DATABASE_URL` | auto-construit | URL de connexion psycopg2 |
| `IPSUM_PATH` | `/app/ipsum/ipsum.txt` | Chemin vers le feed ipsum |
| `LOG_DIR` | `/app/logs` | Répertoire des fichiers .log générés |
| `GENERATOR_DIR` | `/app/generator` | Répertoire Security-Log-Generator |

---

## Licence

Test technique — Cyna, 2026. Projet non destiné à la production.

Sources externes utilisées :
- [Security-Log-Generator](https://github.com/cruikshank25/Security-Log-Generator) — licence MIT
- [ipsum](https://github.com/stamparm/ipsum) — The Unlicense (domaine public)
