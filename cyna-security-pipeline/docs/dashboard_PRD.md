# PRD — Cyna SOC Dashboard

## Vision

Un analyste sécurité ouvre le dashboard et comprend en 5 secondes si la situation est grave ou normale. Le dashboard est le livrable visible du pipeline — il transforme 129 000 IPs malveillantes et des centaines de logs en décisions actionnables.

---

## Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Frontend | React + Vite | Rapide à builder, hot reload, écosystème riche |
| Graphiques | Recharts | Plus léger et plus joli que Chart.js, natif React |
| Styling | Tailwind CSS | Utility-first, pas de CSS à écrire, dark mode facile |
| API | FastAPI (Python) | Cohérent avec le reste du projet, Swagger auto, async |
| Base de données | PostgreSQL 15 | Existant dans le pipeline |
| Orchestration | Docker Compose | Services `api` + `frontend` ajoutés aux services existants |

---

## Architecture

```
React Dashboard (port 3000)
        │
        │  fetch /api/...
        ▼
FastAPI (port 8000)
        │
        │  SQL queries (psycopg2)
        ▼
PostgreSQL (port 5433)
```

---

## Panels — Spécifications détaillées

### 1. KPI Cards (haut de page, 4 colonnes)

| Card | Valeur | Couleur |
|------|--------|---------|
| Total logs ingérés | `COUNT(*) FROM security_logs` | Neutre (blanc/gris) |
| Logs malveillants | `COUNT(*) FROM enriched_logs WHERE is_malicious` | Rouge si > 10%, orange si 5-10%, vert si < 5% |
| Taux de menace | `malveillants / total * 100` | Code couleur identique |
| IPs malveillantes uniques | `COUNT(DISTINCT matched_ip) FROM enriched_logs` | Neutre |

Design : cards avec fond sombre, chiffre large en blanc, label petit en gris, icône à gauche (shield, alert, percent, fingerprint).

---

### 2. Timeline — Area Chart (centre, pleine largeur)

- **X** : heure (`DATE_TRUNC('hour', timestamp)`)
- **Y** : nombre d'événements
- **Série 1** : tous les événements — area gris clair (#374151), opacité 40%
- **Série 2** : événements malveillants — area rouge (#EF4444), opacité 70%
- **Tooltip** : au hover, affiche heure + total + malveillants + taux
- **Comportement** : si un pic de rouge apparaît, c'est visuellement immédiat

Query :
```sql
SELECT
    DATE_TRUNC('hour', sl.timestamp) AS hour,
    COUNT(sl.id)                     AS total,
    COUNT(el.id)                     AS malicious
FROM security_logs sl
LEFT JOIN enriched_logs el ON sl.id = el.log_id AND el.is_malicious = TRUE
GROUP BY 1 ORDER BY 1
```

---

### 3. Top 10 IPs malveillantes (colonne gauche)

- Bar chart horizontal, trié par hits décroissant
- Chaque barre affiche : IP + badge score confiance
  - Score 6-8 → badge rouge `#EF4444`
  - Score 3-5 → badge orange `#F97316`
  - Score 1-2 → badge jaune `#EAB308`
- Tooltip : IP, hits, score, première et dernière détection

Query :
```sql
SELECT
    el.matched_ip::text,
    COUNT(*)              AS hits,
    MAX(el.confidence_level) AS confidence,
    MIN(sl.timestamp)     AS first_seen,
    MAX(sl.timestamp)     AS last_seen
FROM enriched_logs el
JOIN security_logs sl ON el.log_id = sl.id
WHERE el.is_malicious = TRUE
GROUP BY el.matched_ip
ORDER BY hits DESC
LIMIT 10
```

---

### 4. Répartition types et sévérités (colonne droite)

**Donut chart** — répartition IDS / Access / Endpoint :
- IDS → bleu `#3B82F6`
- Access → violet `#8B5CF6`
- Endpoint → vert `#10B981`
- Centre du donut : total logs

**Bar chart empilé** — sévérité par type :
- Low → vert `#22C55E`
- Medium → orange `#F97316`
- High → rouge `#EF4444`
- X : type de log, Y : nombre, couleur : sévérité

---

### 5. Tableau des derniers logs malveillants (bas de page)

Colonnes :
| Timestamp | IP malveillante | Type | Sévérité | Score ipsum | Event type |
|-----------|----------------|------|----------|-------------|------------|

- Paginé (20 lignes par page)
- Triable par colonne
- Filtrable par type et sévérité via dropdowns
- Sévérité affichée en badge coloré
- Score ipsum affiché en badge coloré (même code couleur que panel 3)

---

### 6. Barre d'actions (haut à droite)

| Bouton | Action | Endpoint API |
|--------|--------|--------------|
| Refresh Data | Recharge les données depuis l'API | `GET /api/refresh` |
| Run Pipeline | Lance ingestion + enrichissement | `POST /api/pipeline/run` |
| Update Threat Feed | Recharge ipsum.txt | `POST /api/pipeline/update-feed` |
| Statut pipeline | Badge vert (OK) / rouge (erreur) + timestamp dernier run | `GET /api/pipeline/status` |

---

## Endpoints FastAPI

```
GET  /api/kpis                  → 4 métriques KPI
GET  /api/timeline              → données timeline par heure
GET  /api/top-ips               → top 10 IPs malveillantes
GET  /api/type-severity         → répartition type × sévérité
GET  /api/logs?page=1&limit=20  → tableau paginé des logs malveillants
POST /api/pipeline/run          → lance run_pipeline.sh
POST /api/pipeline/update-feed  → relance ingest_ipsum.py
GET  /api/pipeline/status       → statut et timestamp dernier run
```

Tous les endpoints retournent du JSON. FastAPI génère automatiquement la doc Swagger sur `/docs`.

---

## Filtres globaux (sidebar ou topbar)

- **Plage de dates** — date range picker
- **Type de log** — checkboxes : ids / access / endpoint
- **Score de confiance minimum** — slider 1 à 8

Les filtres sont passés en query params à chaque endpoint : `?from=2023-07-23&to=2023-07-24&types=ids,access&min_confidence=3`

---

## Design système

- **Thème** : dark mode exclusivement (fond `#0F172A`, cards `#1E293B`, bordures `#334155`)
- **Typographie** : Inter ou system-ui, titres en blanc `#F8FAFC`, labels en gris `#94A3B8`
- **Espacement** : grille 12 colonnes, gap 16px
- **Responsive** : desktop-first, breakpoint à 1280px

---

## Docker Compose — Services à ajouter

```yaml
api:
  build: ./api
  container_name: cyna-api
  depends_on:
    db:
      condition: service_healthy
  environment:
    DATABASE_URL: postgresql://cyna:cyna_password@db:5432/cyna
  ports:
    - "8000:8000"
  command: uvicorn main:app --host 0.0.0.0 --port 8000

frontend:
  build: ./frontend
  container_name: cyna-frontend
  depends_on:
    - api
  ports:
    - "3000:3000"
  environment:
    VITE_API_URL: http://localhost:8000
```

---

## Structure des fichiers à créer

```
cyna-security-pipeline/
├── api/
│   ├── Dockerfile
│   ├── requirements.txt        # fastapi, uvicorn, psycopg2-binary
│   └── main.py                 # tous les endpoints FastAPI
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── KPICards.jsx
        │   ├── Timeline.jsx
        │   ├── TopIPs.jsx
        │   ├── TypeSeverityCharts.jsx
        │   ├── LogsTable.jsx
        │   └── ActionBar.jsx
        └── hooks/
            └── useApi.js       # fetch wrapper avec refresh
```

---

## Prompt de génération

Voici le prompt à utiliser pour générer l'implémentation complète :

```
Tu es un développeur fullstack senior. Tu dois construire un dashboard SOC (Security Operations Center)
pour le projet Cyna Security Pipeline.

STACK :
- Backend : FastAPI (Python), psycopg2 pour PostgreSQL
- Frontend : React + Vite, Recharts pour les graphiques, Tailwind CSS
- Base de données : PostgreSQL avec ces tables :
    - security_logs(id, timestamp, log_type, source_ip, dest_ip, severity, event_type, raw_log)
    - malicious_ips(ip, confidence_level, last_updated)
    - enriched_logs(id, log_id, matched_ip, confidence_level, is_malicious, enriched_at)
- PostgreSQL sur DATABASE_URL (variable d'environnement), port 5433 en local

BACKEND — Crée api/main.py avec FastAPI :
- GET /api/kpis → {total_logs, malicious_logs, threat_rate, unique_ips}
- GET /api/timeline → [{hour, total, malicious}] groupé par heure
- GET /api/top-ips → [{ip, hits, confidence, first_seen, last_seen}] top 10
- GET /api/type-severity → [{log_type, severity, count}]
- GET /api/logs → {data: [{timestamp, matched_ip, log_type, severity, confidence_level, event_type}], total, page}
  avec query params : page (défaut 1), limit (défaut 20), types (csv), min_confidence (int)
- GET /api/pipeline/status → {last_run, status}
- POST /api/pipeline/run → lance subprocess run_pipeline.sh, retourne {status}
- Tous les endpoints acceptent query params : from_date, to_date, types, min_confidence
- CORS activé pour http://localhost:3000
- Créer api/requirements.txt : fastapi, uvicorn, psycopg2-binary, python-dotenv

FRONTEND — Crée le projet React avec cette structure :
src/
  App.jsx          — layout principal, gestion des filtres globaux
  components/
    KPICards.jsx   — 4 cards : total, malveillants, taux (couleur selon seuil), IPs uniques
    Timeline.jsx   — AreaChart Recharts : area gris (tous) + area rouge (malveillants)
    TopIPs.jsx     — BarChart horizontal + badge score (rouge 6+, orange 3-5, jaune 1-2)
    TypeSeverity.jsx — PieChart donut (types) + BarChart empilé (sévérités)
    LogsTable.jsx  — tableau paginé, triable, avec badges sévérité et score
    ActionBar.jsx  — boutons Refresh/Run Pipeline/Update Feed + badge statut pipeline
  hooks/
    useApi.js      — wrapper fetch vers http://localhost:8000/api

DESIGN SYSTEM :
- Dark mode exclusif : bg #0F172A, cards #1E293B, borders #334155
- Texte : blanc #F8FAFC, labels gris #94A3B8
- Couleurs données : IDS #3B82F6, Access #8B5CF6, Endpoint #10B981
- Sévérités : low #22C55E, medium #F97316, high #EF4444
- Scores ipsum : 6-8 → #EF4444, 3-5 → #F97316, 1-2 → #EAB308

DOCKERFILES :
- api/Dockerfile : FROM python:3.11-slim, COPY requirements.txt, pip install, COPY main.py, CMD uvicorn
- frontend/Dockerfile : FROM node:20-alpine, npm install, npm run build, serve avec nginx

Génère tous les fichiers complets, sans placeholder. Le code doit fonctionner tel quel.
```
