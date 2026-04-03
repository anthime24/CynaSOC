# Fonctionnement du dashboard SOC — Cyna Security Pipeline

Ce document explique comment chaque fonctionnalité du dashboard fonctionne et ce qui se passe en arrière-plan, de l'interface utilisateur jusqu'à la base de données.

---

## Architecture générale

```
Navigateur (React) — port 3000
      │
      │  HTTP fetch (JSON)
      ▼
FastAPI — port 8000    ←── DATABASE_URL, IPSUM_PATH, LOG_DIR, GENERATOR_DIR (env vars)
      │
      │  psycopg2 (SQL natif)
      ▼
PostgreSQL — port 5433
      │
      ├── security_logs      (logs bruts IDS / Access / Endpoint)
      ├── malicious_ips      (feed ipsum ~129 000 IPs)
      └── enriched_logs      (résultat de la jointure : log × IP malveillante)
```

Chaque composant React fait ses propres appels HTTP vers FastAPI. Il n'y a pas d'état global centralisé — chaque panneau est autonome et se rafraîchit indépendamment.

---

## Filtres globaux

### Ce que l'utilisateur voit
En haut du dashboard : plage de dates (from / to), cases à cocher **IDS et Access uniquement** (Endpoint exclu des filtres — ses logs n'ont pas d'IP), curseur score de confiance minimum, bouton Réinitialiser.

### Ce qui se passe en arrière-plan
Les filtres sont stockés dans le state React de `App.jsx` avec `types: ['ids', 'access']` par défaut. À chaque modification, les filtres sont convertis en query params et passés en props à tous les composants.

Exemple d'URL générée :
```
GET /api/kpis?from_date=2024-01-01&to_date=2024-01-31&types=ids,access&min_confidence=3
```

Côté FastAPI (`build_filters` dans `main.py`), ces paramètres sont transformés en clauses `WHERE` SQL paramétrées :
```sql
WHERE sl.timestamp >= '2024-01-01'
  AND sl.log_type IN ('ids', 'access')
  AND el.confidence_level >= 3
```

### Auto-refresh
Un `setInterval` dans `App.jsx` déclenche `triggerRefresh()` toutes les 30 secondes, forçant tous les composants à re-fetcher leurs données.

### Dark / Light mode
Un toggle soleil/lune dans le header bascule entre les deux thèmes. Le choix est persisté dans `localStorage`. Le mode est appliqué via la classe `.dark` sur le `<body>` et des CSS variables dans `index.css` :
```css
:root  { --bg-primary: #F5F4F1; --text-primary: #1e1b4b; ... }
.dark  { --bg-primary: #040130; --text-primary: #F8FAFC; ... }
```

---

## Panel 1 — KPI Cards (5 cards)

### Ce que l'utilisateur voit
5 métriques : Total logs, Logs malveillants, Taux de menace (%), IPs malveillantes uniques, et **Endpoint Events** (toujours visible, indépendant des filtres types).

### Ce qui se passe en arrière-plan
`KPICards.jsx` fait 2 appels en parallèle :

**`GET /api/kpis`** — 3 requêtes SQL :
```sql
-- Total (sans jointure)
SELECT COUNT(*) FROM security_logs WHERE ...

-- Malveillants (COUNT DISTINCT pour éviter le double-comptage)
SELECT COUNT(DISTINCT sl.id)
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE el.is_malicious = TRUE AND ...

-- IPs uniques
SELECT COUNT(DISTINCT el.matched_ip)
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE el.is_malicious = TRUE AND ...
```

**`GET /api/endpoint-stats`** — filtres dates uniquement (pas de filtre type) :
```sql
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE event_type ILIKE '%%malware%%'
                        OR event_type ILIKE '%%detection%%') AS malware_detected,
    COUNT(*) FILTER (WHERE event_type ILIKE '%%scan%%') AS scans_performed
FROM security_logs
WHERE log_type = 'endpoint' AND ...
```

> **Note `%%`** : dans psycopg2, le caractère `%` dans une requête SQL doit être doublé en `%%` quand il ne représente pas un paramètre, pour ne pas être confondu avec un placeholder `%s`.

---

## Panel 2 — Alertes critiques (live monitoring)

### Ce que l'utilisateur voit
Un encart sombre avec bordure rouge gauche, placé entre les KPIs et la Timeline. Affiche les 5 derniers logs malveillants ayant un **score de confiance ≥ 6**, avec :
- Point rouge clignotant (animation CSS `pulse-dot`)
- Temps relatif ("il y a 3 min")
- IP malveillante en monospace rouge
- Badge type (IDS / Access)
- Badge score de confiance
- Event type si disponible

### Ce qui se passe en arrière-plan
`CriticalAlerts.jsx` appelle `GET /api/critical-alerts` :
```sql
SELECT sl.timestamp, sl.log_type, sl.source_ip::text,
       el.matched_ip::text, el.confidence_level, sl.event_type, sl.raw_log
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE el.is_malicious = TRUE AND el.confidence_level >= 6
  AND ...  -- filtres dates et types
ORDER BY sl.timestamp DESC
LIMIT 5
```

Se rafraîchit avec le `refreshToken` (toutes les 30s). Si 0 alertes → message "Aucune alerte critique — système sain ✓" en vert.

---

## Panel 3 — Timeline (Area Chart)

### Ce que l'utilisateur voit
Graphique de surface double : zone grise (tous les événements IDS+Access) et zone rouge (malveillants), groupés par heure.

### Ce qui se passe en arrière-plan
`Timeline.jsx` appelle `GET /api/timeline`. Deux requêtes fusionnées :

```sql
-- Total par heure
SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(*) AS total
FROM security_logs sl WHERE ...
GROUP BY hour ORDER BY hour

-- Malveillants par heure (COUNT DISTINCT pour éviter surestimation)
SELECT DATE_TRUNC('hour', sl.timestamp) AS hour, COUNT(DISTINCT sl.id) AS malicious
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE el.is_malicious = TRUE AND ...
GROUP BY hour ORDER BY hour
```

> **Pourquoi `COUNT(DISTINCT sl.id)` ?** Un même log peut avoir plusieurs entrées dans `enriched_logs` (matched sur source_ip ET dest_ip). Sans `DISTINCT`, la courbe malveillants dépasserait le total.

---

## Panel 4 — Top 10 IPs malveillantes

### Ce que l'utilisateur voit
Bar chart horizontal. Les 10 IPs les plus fréquentes triées par hits. Hauteur dynamique : 42px par barre (toutes les IPs sont visibles, aucune étiquette masquée).

### Ce qui se passe en arrière-plan
`TopIPs.jsx` appelle `GET /api/top-ips` :
```sql
SELECT
    el.matched_ip::text AS ip,
    COUNT(DISTINCT sl.id) AS hits,   -- DISTINCT pour éviter le double-comptage
    MAX(el.confidence_level) AS confidence,
    MIN(sl.timestamp) AS first_seen,
    MAX(sl.timestamp) AS last_seen
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE el.is_malicious = TRUE AND ...
GROUP BY el.matched_ip
ORDER BY hits DESC
LIMIT 10
```

---

## Panel 5 — Répartition types et sévérités

### Ce que l'utilisateur voit
- **Donut** : répartition IDS / Access (Endpoint exclu des filtres globaux mais peut apparaître dans le donut si des données existent)
- **Bar chart empilé "Sévérité par type"** : **Access exclu** (les logs access n'ont pas de sévérité pertinente — code HTTP ≠ niveau de menace). Seul IDS est affiché.

### Ce qui se passe en arrière-plan
`TypeSeverityCharts.jsx` appelle `GET /api/type-severity`. Le filtre Access est appliqué **côté frontend** lors de la construction du bar chart :
```js
for (const row of data) {
  if (row.log_type === 'access') continue  // exclu du bar chart uniquement
  ...
}
```

Quand `min_confidence` est actif, la requête SQL utilise `COUNT(DISTINCT sl.id)` pour éviter le surestimation :
```sql
SELECT sl.log_type, sl.severity, COUNT(DISTINCT sl.id) AS count
FROM security_logs sl
JOIN enriched_logs el ON sl.id = el.log_id
WHERE ...
GROUP BY sl.log_type, sl.severity
```

---

## Panel 6 — Tableau des logs malveillants

### Ce que l'utilisateur voit
- Onglets **Tous / IDS / Access** (Endpoint retiré)
- Tableau paginé 20 lignes/page avec colonnes triables
- Filtres dropdown type et sévérité
- Bouton **Export CSV** en haut à droite
- Badges colorés sévérité et score de confiance

### Ce qui se passe en arrière-plan
`LogsTable.jsx` appelle `GET /api/logs?page=1&limit=20&...`.

**Pagination** : `COUNT(DISTINCT sl.id)` pour le total (évite surestimation), puis `LIMIT/OFFSET` pour la page.

**Onglets** : l'onglet actif envoie un filtre `types=ids` ou `types=access` en plus des filtres globaux. Changer d'onglet remet la pagination à la page 1.

**Export CSV** : appelle `GET /api/logs/export` avec les mêmes filtres mais sans pagination (max 50 000 lignes). Le navigateur reçoit un `StreamingResponse` CSV et déclenche un téléchargement via `URL.createObjectURL`.

---

## Barre d'actions

### Bouton "Reset"
Bouton rouge foncé en premier à gauche. Au clic, une **modal de confirmation** s'affiche (fond semi-transparent, message d'avertissement, boutons Annuler / Oui tout supprimer).

Si confirmé :
```
POST /api/reset
  └── TRUNCATE enriched_logs, security_logs RESTART IDENTITY CASCADE
  └── Remet le statut pipeline à "never_run"
        │
        ▼
POST /api/pipeline/run (automatique)
  └── Relance le pipeline complet
  └── Poll toutes les 5s → toast "Reset terminé — données régénérées"
```

### Bouton "Refresh Data"
Appelle `GET /api/refresh` puis `triggerRefresh()` → tous les composants re-fetchent.

### Bouton "Run Pipeline"
Appelle `POST /api/pipeline/run`. Thread Python → `pipeline_runner.run_full_pipeline()` :
```
Étape 0 — generate_logs()        : Security-Log-Generator × 3 types → /app/logs/
Étape 1 — ingest_logs()          : .log → security_logs (INSERT batch)
Étape 2 — ingest_ipsum()         : ipsum.txt → malicious_ips (UPSERT batch)
Étape 3 — enrich()               : JOIN → enriched_logs
```
Statut suivi via `api/_pipeline_status.json`. Poll frontend toutes les 5s (max 10 min).

### Bouton "Update Feed"
Appelle `POST /api/pipeline/update-feed`. Thread Python → `pipeline_runner.run_feed_update()` :
```
1. GET https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt
   └── Télécharge la liste fraîche (~129 000 IPs, mise à jour quotidienne)
2. Écrit dans un fichier temporaire
3. ingest_ipsum() → UPSERT dans malicious_ips
4. Supprime le fichier temporaire
```
Statut suivi via `api/_feed_status.json` + `GET /api/pipeline/feed-status`.

> **Important** : Update Feed seul ne met pas à jour les graphiques. Il faut relancer Run Pipeline pour recalculer `enriched_logs` avec les nouvelles IPs.

---

## Flux de données complet — de A à Z

```
[Clic Run Pipeline]
        │
        ▼
POST /api/pipeline/run → Thread Python
        │
        ├─ 0. Security-Log-Generator (subprocess × 3)
        │      config.yaml → ids / access / endpoint
        │      → ids.log, access.log, endpoint.log dans /app/logs/
        │
        ├─ 1. ingest_logs.py
        │      parse_logs.py → INSERT batch → security_logs
        │
        ├─ 2. ingest_ipsum.py
        │      ipsum.txt → UPSERT batch → malicious_ips
        │
        ├─ 3. enrich.py
        │      JOIN source_ip OR dest_ip → enriched_logs
        │
        └─ {"status": "completed"} → _pipeline_status.json
                │
                ▼
        React poll → toast vert → triggerRefresh()
                │
                ▼
        Tous les panels re-fetchent leurs endpoints
        → Recharts redessine les graphiques
```

---

## Correction surestimation (COUNT DISTINCT)

Un log peut matcher plusieurs IPs malveillantes (source_ip ET dest_ip dans ipsum). Cela crée plusieurs lignes dans `enriched_logs` pour le même `log_id`. Sans précaution, les `COUNT(*)` avec JOIN surestiment les chiffres et la courbe malveillants peut dépasser le total.

**Règle appliquée** : tous les endpoints qui font un JOIN avec `enriched_logs` utilisent `COUNT(DISTINCT sl.id)` au lieu de `COUNT(*)`.

| Endpoint | Fix appliqué |
|----------|-------------|
| `/api/kpis` — malicious_logs | `COUNT(DISTINCT sl.id)` |
| `/api/timeline` — malicious par heure | `COUNT(DISTINCT sl.id)` |
| `/api/top-ips` — hits par IP | `COUNT(DISTINCT sl.id)` |
| `/api/type-severity` — avec min_confidence | `COUNT(DISTINCT sl.id)` |
| `/api/logs` — pagination total | `COUNT(DISTINCT sl.id)` |

---

## Gestion des erreurs

| Niveau | Comportement |
|--------|-------------|
| FastAPI | `try/except` sur chaque endpoint → HTTP 500 avec le message |
| Thread pipeline | `try/except` global → `{"status": "error", "detail": "..."}` |
| Frontend poll | `status === "error"` → toast rouge avec le `detail` |
| Fetch React | `fetchApi()` lève si `!res.ok` → composant affiche l'erreur |
| Update Feed réseau | `timeout=60` + `raise_for_status()` → échec propre |
| Reset DB | `try/except` psycopg2 → HTTP 500 si TRUNCATE échoue |

---

## Détection du contexte Docker vs local

```python
_here = Path(__file__).parent
if (_here / "src").exists():
    PROJECT_ROOT = _here          # Docker : /app/
else:
    PROJECT_ROOT = _here.parent   # Local  : api/../
```

| Variable | Docker | Local (défaut) |
|----------|--------|---------------|
| `DATABASE_URL` | `postgresql://...@db:5432/cyna` | `...@localhost:5433/cyna` |
| `IPSUM_PATH` | `/app/ipsum/ipsum.txt` | `../ipsum/ipsum.txt` |
| `LOG_DIR` | `/app/logs` | `./logs` |
| `GENERATOR_DIR` | `/app/generator` | `../Security-Log-Generator` |

---

## Performance et limites

- **Pas de pool de connexions** : chaque requête ouvre et ferme une connexion psycopg2. En production : utiliser `psycopg2.pool` ou `asyncpg`.
- **Index SQL** : jointures sur `source_ip`, `dest_ip`, `timestamp` couvertes par les index de `init.sql`.
- **Pas de cache** : chaque appel re-interroge la base. Rafraîchissement géré par l'auto-refresh 30s.
- **Pagination serveur** : tableau charge 20 lignes max via `LIMIT/OFFSET`.
- **Export CSV** limité à 50 000 lignes pour éviter les timeouts mémoire.
- **Reset irréversible** : `TRUNCATE ... RESTART IDENTITY CASCADE` supprime définitivement toutes les données de `security_logs` et `enriched_logs`.
