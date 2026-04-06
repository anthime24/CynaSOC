# Cyna SOC Security Pipeline

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

Pipeline de cybersécurité complet : ingestion de logs simulés, enrichissement par threat intelligence, et dashboard SOC interactif — le tout en une seule commande Docker.

> Les dossiers `ipsum/` et `Security-Log-Generator/` sont des copies locales des repos originaux ([ipsum](https://github.com/stamparm/ipsum), [Security-Log-Generator](https://github.com/cruikshank25/Security-Log-Generator)), inclus directement dans le repo pour simplifier le déploiement.

---

# PARTIE 1 — Installation et utilisation

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

## Le Dashboard — ce qu'il affiche et comment l'utiliser

### Filtres globaux

En haut du dashboard, une barre de filtres permet d'affiner tous les panels en même temps :
- **Plage de dates** : restreint les données à une période précise
- **Type de log** : IDS, Access (Endpoint est exclu des panels liés à l'enrichissement — j'explique pourquoi dans la Partie 2)
- **Score de confiance minimum** : filtre les IPs par leur score ipsum (1 = suspecte, 8 = très dangereuse)

Le dashboard se rafraîchit automatiquement toutes les 30 secondes. Un toggle Dark/Light mode est disponible en haut à droite.

### Panel 1 — KPI Cards

5 métriques visibles d'un coup d'œil :

| Métrique | Ce que ça veut dire |
|----------|-------------------|
| Total logs | Nombre total de logs ingérés (IDS + Access + Endpoint) |
| Logs malveillants | Nombre de logs dont une IP correspond à la blacklist ipsum |
| Taux de menace | Pourcentage de logs malveillants parmi les logs IDS + Access uniquement |
| IPs malveillantes uniques | Combien d'IPs différentes de la blacklist ont été détectées |
| Endpoint Events | Nombre d'événements endpoint avec le détail malwares/scans |

Le taux de menace change de couleur : vert si < 5%, orange entre 5-10%, rouge au-delà de 10%.

### Panel 2 — Alertes critiques

Un encart qui affiche les 5 derniers logs avec un score de confiance **≥ 6**. Chaque alerte montre le temps écoulé ("il y a 3 min"), l'IP en rouge, le type (IDS/Access), le score, et le type d'événement. Un point rouge clignote pour attirer l'attention. Si aucune alerte critique n'est détectée, le panneau affiche "Système sain" en vert.

### Panel 3 — Timeline

Un graphique à double surface groupé par heure. La zone grise représente tous les événements, la zone rouge les événements malveillants. Un pic rouge visible indique une vague d'attaques. C'est le panel le plus utile pour repérer les anomalies temporelles.

### Panel 4 — Top 10 IPs malveillantes

Un graphique à barres horizontal montrant les 10 IPs les plus actives dans les logs enrichis, triées par nombre de détections. Chaque barre a un badge coloré selon le score de confiance (rouge ≥ 6, orange 3-5, jaune 1-2).

### Panel 5 — Répartition types et sévérités

Deux graphiques : un donut pour la répartition IDS/Access/Endpoint, et un bar chart empilé pour la sévérité par type de log.

### Panel 6 — Tableau des logs malveillants

Un tableau paginé (20 lignes par page) avec des onglets "Tous / IDS / Access" pour filtrer rapidement. Les colonnes sont triables, et un bouton **Export CSV** permet de télécharger les données filtrées.

### Boutons d'action

| Bouton | Ce qu'il fait |
|--------|--------------|
| **Run Pipeline** | Vide les tables, régénère les logs, ingère, enrichit — suivi par polling toutes les 5s |
| **Update Feed** | Télécharge la dernière version d'ipsum depuis GitHub et met à jour la blacklist |
| **Refresh Data** | Force le re-fetch de tous les panels sans relancer le pipeline |
| **Reset** | Modal de confirmation → vide tout et relance le pipeline |

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

# PARTIE 2 — Ce que j'ai compris et construit

---

## Contexte du projet

Cyna est une entreprise de cybersécurité qui protège les PME contre les cyberattaques. Le but de ce test technique était de construire un pipeline de données capable d'ingérer des logs de sécurité, de les croiser avec une base de threat intelligence, et de produire des dashboards exploitables pour une équipe SOC (Security Operations Center — le centre de surveillance cyber d'une entreprise).

---

## Les deux sources de données

### Le Security-Log-Generator — les "caméras de surveillance" du réseau

Ce repo simule ce que produisent les outils de sécurité d'une entreprise. J'ai travaillé avec trois types de logs, chacun surveillant un aspect différent du réseau :

**Les logs IDS (Intrusion Detection System)** surveillent le trafic réseau entre machines. Le système analyse les connexions et déclenche des alertes quand il détecte un comportement suspect. Chaque log contient une IP source (l'attaquant potentiel), une IP destination (la cible), le protocole utilisé, un niveau de sévérité, et le type d'alerte ("Port scanning", "SQL injection", "Worm Propagation Attempt"…). C'est comme un vigile qui surveille les entrées d'un immeuble et signale tout comportement anormal.

**Les logs Access** enregistrent toutes les requêtes HTTP vers les serveurs web de l'entreprise. Chaque visite est loggée avec l'IP du visiteur, la page demandée, la méthode HTTP (GET, POST…), le code de réponse (200 = OK, 403 = interdit, 404 = pas trouvé) et le navigateur utilisé. C'est comme le cahier du vigile à l'accueil : il note qui entre, ce qu'il demande, et ce qu'on lui répond. En cybersécurité, c'est utile pour repérer des attaques par force brute (même IP qui tente /admin/login 500 fois) ou de la reconnaissance (scan de toutes les URLs).

**Les logs Endpoint** viennent des postes de travail individuels. Ils enregistrent l'activité de l'antivirus sur chaque machine : scans effectués, malwares détectés, exceptions configurées, mises à jour. Il n'y a pas d'IP car ce n'est pas une histoire de réseau — c'est ce qui se passe à l'intérieur d'une machine, pas entre deux machines. C'est comme un gardien personnel installé dans chaque bureau de l'immeuble.

**La différence clé :** Access = qui frappe à la porte du site web depuis l'extérieur. Endpoint = ce qui se passe sur chaque ordinateur à l'intérieur. IDS = qui communique avec qui sur le réseau. Les trois sont complémentaires : un hacker peut d'abord apparaître dans les logs access (il tente de rentrer), puis dans les logs IDS (il scanne le réseau), puis dans les logs endpoint (il lance un malware sur un poste).

### Le feed ipsum — la "liste noire" des criminels connus

En cybersécurité, des organisations collectent et partagent des listes d'adresses IP connues pour être malveillantes (serveurs de hackers, machines piratées, centres de commande de botnets). Le repo ipsum agrège plus de 30 de ces blacklists en un seul fichier, mis à jour quotidiennement.

Chaque IP a un **score de confiance** (1 à 8) : plus le chiffre est élevé, plus l'IP apparaît dans de nombreuses listes différentes, donc plus on est certain qu'elle est dangereuse. Une IP à score 2 est suspecte, une IP à score 8 est quasiment certainement un serveur d'attaquant.

Le fichier contient environ **129 212 IPs** et est téléchargeable gratuitement (domaine public).

---

## Architecture technique

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

### Pourquoi cette stack ?

| Choix | Justification |
|-------|---------------|
| **PostgreSQL** | J'avais besoin de jointures SQL performantes entre les logs et la blacklist. PostgreSQL supporte nativement le type `INET` pour les adresses IP et `JSONB` pour stocker les logs bruts dans leur format original. C'est robuste et léger — adapté à la contrainte de 8 Go RAM. |
| **Python** | Cohérent avec le générateur de logs (Python), permet un contrôle fin du parsing et des insertions batch. |
| **FastAPI** | API REST rapide avec documentation Swagger auto-générée. Chaque panel du dashboard a son propre endpoint, ce qui rend l'architecture modulaire. |
| **React + Recharts** | Dashboard custom plus professionnel qu'un Streamlit basique. Composants autonomes, chacun gère ses propres appels API. |
| **Docker Compose** | Tout tourne en une commande, reproductible sur n'importe quelle machine. |

---

## Le pipeline — comment ça fonctionne étape par étape

### Étape 0 — Génération des logs

Le pipeline lance le Security-Log-Generator trois fois (une fois par type de log), en modifiant `config.yaml` à la volée. Chaque run produit ~500 événements.

**Modification clé du générateur :** j'ai créé un module `ipsum_loader.py` qui charge les IPs malveillantes d'ipsum en mémoire. Dans les générateurs IDS et access, 20% des IPs sont piochées depuis cette liste au lieu d'être générées aléatoirement par Faker. J'explique pourquoi dans la section "Défis rencontrés".

### Étape 1 — Ingestion des logs

Trois parseurs distincts lisent les fichiers `.log` car chaque type a un format différent :
- IDS et access : une ligne par événement, parsable directement
- Endpoint : format multi-lignes (blocs commençant par `Date:`), nécessite un parsing spécial

Chaque log est inséré dans la table `security_logs` avec ses champs clés extraits (timestamp, IPs, sévérité, type d'événement) et le log brut complet en JSONB.

### Étape 2 — Ingestion ipsum

Le script télécharge (ou lit localement) le fichier `ipsum.txt`, parse chaque ligne `IP\tscore`, et fait un UPSERT dans `malicious_ips`. L'UPSERT (`ON CONFLICT DO UPDATE`) permet de mettre à jour les scores si le feed est rechargé.

### Étape 3 — Enrichissement

C'est le cœur du projet. Le script effectue une jointure SQL entre `security_logs` et `malicious_ips` :

```sql
SELECT sl.id, m.ip, m.confidence_level
FROM security_logs sl
JOIN malicious_ips m
    ON sl.source_ip = m.ip OR sl.dest_ip = m.ip
```

Pour chaque log dont l'IP source OU destination apparaît dans la blacklist, une entrée est créée dans `enriched_logs` avec le flag `is_malicious = TRUE` et le score de confiance.

Cela détecte deux scénarios : soit une IP malveillante nous attaque (elle est en source_ip), soit une machine de notre réseau communique avec une IP malveillante (elle est en dest_ip). Les deux sont des signaux d'alerte.

Les logs endpoint ne participent pas à l'enrichissement puisqu'ils n'ont pas d'IP — c'est logique car ils surveillent l'activité locale d'une machine, pas le réseau.

---

## Le schéma de base de données

### Pourquoi une seule table pour trois types de logs ?

J'ai fait le choix de stocker les trois types (IDS, access, endpoint) dans une même table `security_logs`. Les colonnes communes (`timestamp`, `source_ip`, `dest_ip`, `severity`, `event_type`) servent aux jointures et aux filtres. Les champs spécifiques à chaque type sont conservés dans la colonne `raw_log` (JSONB).

Ça veut dire que pour les logs endpoint, `source_ip`, `dest_ip` et `severity` sont à NULL — c'est normal et attendu. Le JSONB permet de requêter les champs spécifiques quand on en a besoin :

```sql
-- Récupérer le protocole des logs IDS
SELECT raw_log->>'protocol', raw_log->>'flag' FROM security_logs WHERE log_type = 'ids';

-- Récupérer les malwares détectés sur les endpoints
SELECT raw_log->>'computer', raw_log->>'malware_found' FROM security_logs WHERE log_type = 'endpoint';
```

C'est un pattern classique en data engineering pour gérer des données hétérogènes dans une même table : colonnes communes pour les opérations fréquentes, JSONB pour le détail.

### Tables

```sql
security_logs   -- logs bruts de tous types (colonnes communes + raw_log JSONB)
malicious_ips   -- IPs du feed ipsum (~129 212 entrées, score 1-8)
enriched_logs   -- résultat du croisement (log_id + matched_ip + score)
```

### Index

```sql
CREATE INDEX idx_logs_source_ip  ON security_logs(source_ip);
CREATE INDEX idx_logs_dest_ip    ON security_logs(dest_ip);
CREATE INDEX idx_logs_timestamp  ON security_logs(timestamp);
CREATE INDEX idx_logs_type       ON security_logs(log_type);
CREATE INDEX idx_malicious_ip    ON malicious_ips(ip);
```

Les index sur `source_ip` et `dest_ip` sont essentiels — sans eux, la jointure d'enrichissement sur 129 000 IPs serait très lente.

---

## Sévérité vs Score de confiance — deux mesures différentes

Un point important que j'ai compris en construisant ce projet : la **sévérité IDS** et le **score ipsum** mesurent des choses complètement différentes.

La **sévérité** (low, medium, high) est attribuée par le capteur IDS au moment de la détection. Elle décrit la gravité de l'action : un port scanning est "low", une tentative de SQL injection est "high". Elle répond à la question "ce qui se passe, c'est grave ?".

Le **score de confiance** (1 à 8) est calculé par ipsum en comptant dans combien de blacklists une IP apparaît. Il décrit la réputation de l'attaquant : score 2 = suspect, score 8 = attaquant confirmé par 8 sources. Il répond à la question "cette IP, on est sûr qu'elle est malveillante ?".

L'intérêt de croiser les deux dans le dashboard :

| Sévérité | Score ipsum | Interprétation |
|----------|------------|----------------|
| High | ≥ 6 | Attaque grave par un attaquant connu → **alerte maximale** |
| High | 1-2 | Attaque grave mais IP peu connue → possible nouvel attaquant |
| Low | ≥ 6 | Action banale par un attaquant très connu → reconnaissance avant une vraie attaque |
| Low | 1-2 | Action banale, IP peu connue → probablement du bruit |

C'est exactement ce que le panneau "Alertes critiques" exploite en filtrant sur `confidence_level >= 6`.

---

## Pourquoi les logs Endpoint ne sont pas dans les graphiques d'enrichissement

Les logs endpoint n'ont aucune IP (ni source, ni destination). Ils enregistrent l'activité locale d'un poste de travail (scans antivirus, malwares détectés, exceptions), pas des connexions réseau. La jointure avec ipsum ne peut donc jamais les matcher.

Dans le dashboard, je les ai traités séparément avec une KPI card dédiée ("Endpoint Events") qui affiche le nombre de malwares détectés et de scans effectués. C'est un complément utile pour un analyste SOC, mais c'est indépendant de l'enrichissement par threat intelligence.

Pour les panels liés à l'enrichissement (timeline, top IPs, alertes critiques, tableau des logs), seuls les logs IDS et access sont pertinents. Le taux de menace est calculé uniquement sur la base IDS + access pour ne pas être artificiellement dilué par les logs endpoint qui ne peuvent jamais être "malveillants".

---

## Défis rencontrés

### 1. IPs Faker vs IPs réelles ipsum — 0 correspondance initiale

**Le problème :** quand j'ai lancé l'enrichissement pour la première fois, j'ai obtenu 0 correspondance. C'est logique : le Security-Log-Generator utilise Faker pour générer des IPs aléatoires (ex: `61.72.88.110`), qui n'ont aucune chance de correspondre aux vraies IPs malveillantes d'ipsum (ex: `185.220.101.34`). C'est comme chercher un numéro de téléphone inventé dans un vrai annuaire.

**Les options envisagées :**
- **Option A** — Injecter des IPs ipsum directement dans la table `security_logs` après coup. Rapide mais artificiel.
- **Option B** — Modifier le générateur pour qu'il utilise de vraies IPs ipsum. Plus réaliste de bout en bout.
- **Option C** — Créer une fausse blacklist correspondant aux plages Faker. Perd l'intérêt du feed réel.

**Solution retenue (Option B) :** j'ai créé un module `ipsum_loader.py` qui charge les IPs malveillantes en mémoire au démarrage du générateur. Dans les générateurs IDS et access, 20% des IPs sont piochées depuis cette liste (score ≥ 4), le reste est toujours généré par Faker. Résultat : environ 25% des logs IDS/access matchent lors de l'enrichissement, ce qui donne des données réalistes pour le dashboard.

Les logs endpoint n'ont pas été modifiés car ils ne contiennent pas d'IP.

### 2. Surestimation des métriques — la courbe rouge qui dépasse le total

**Le problème :** sur la timeline, la courbe des événements malveillants dépassait parfois la courbe du total. En investiguant avec des requêtes SQL, j'ai découvert que certains logs avaient jusqu'à 6 entrées dans `enriched_logs` (match sur source_ip ET dest_ip, multiplié par les runs successifs). Un `COUNT(*)` avec JOIN comptait chaque log plusieurs fois.

**Vérification :**
```sql
SELECT log_id, COUNT(*) as nb FROM enriched_logs GROUP BY log_id HAVING COUNT(*) > 1;
-- Résultat : certains log_id avec 2, 3, 4, voire 6 entrées
```

**Solution :** remplacement de `COUNT(*)` par `COUNT(DISTINCT sl.id)` sur tous les endpoints qui joignent avec `enriched_logs` (KPIs, timeline, top IPs, type/severity, pagination). Le double-comptage a disparu.

### 3. Accumulation des données entre les runs

**Le problème :** chaque clic sur "Run Pipeline" ajoutait de nouveaux logs sans vider les anciens. Le total gonflait à chaque run (40 800 → 48 900 → 53 280…), et les timestamps s'étalaient sur des années si les premiers tests dataient de 2023.

**Solution :** ajout d'un `TRUNCATE enriched_logs, security_logs RESTART IDENTITY CASCADE` au début de chaque run. Le pipeline repart de zéro à chaque exécution. En production, les logs seraient accumulés avec une politique de rétention, mais pour la démo c'est plus clair et prévisible.

### 4. Port PostgreSQL déjà occupé

**Le problème :** un PostgreSQL local sur le port 5432 empêchait le container de s'exposer.

**Solution :** PostgreSQL exposé sur `5433` en local (`5433:5432` dans `docker-compose.yml`). Internalement, les containers communiquent toujours sur le port `5432` standard via le réseau Docker.

### 5. Timeline inutilisable — tous les logs au même instant

**Le problème :** le Security-Log-Generator est configuré avec `write_time: 0` dans `config.yaml`, ce qui produit les 500 événements quasi simultanément. Combiné avec le `TRUNCATE` qui repart de zéro à chaque run, la timeline n'affichait qu'un seul point isolé — aucune évolution visible, aucun historique exploitable pour un analyste SOC.

**Solution :** j'ai ajouté une étape de redistribution des timestamps après le parsing et avant l'insertion en base. Les timestamps sont répartis aléatoirement sur les 7 derniers jours avec un biais vers les heures de bureau (8h–18h) pour simuler un trafic réaliste. Résultat : la timeline affiche une semaine d'activité avec des variations crédibles, permettant de repérer visuellement les pics d'activité suspecte.
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
│   │   └── hooks/
│   └── package.json
│
├── scripts/
│   └── run_pipeline.sh         # Orchestrateur bash (étapes 0 à 3)
│
├── Security-Log-Generator/     # Copie locale (modifiée pour injecter des IPs ipsum)
├── ipsum/                      # Copie locale du feed de threat intelligence
├── logs/                       # Fichiers .log générés (ignorés par git)
│
└── docs/
    ├── progression.md
    └── dashboard_fonctionnement.md
```

---

## Améliorations possibles

Si j'avais plus de temps, voici ce que j'ajouterais :

- **Pool de connexions** : actuellement chaque requête API ouvre et ferme une connexion psycopg2. En production, j'utiliserais `psycopg2.pool` ou `asyncpg` pour de meilleures performances sous charge.
- **Streaming temps réel** : remplacer la génération batch par une ingestion continue (Kafka, Filebeat) pour un vrai pipeline temps réel.
- **Alerting automatique** : des notifications (email, webhook Slack) déclenchées quand le taux de menace dépasse un seuil configurable.
- **Machine learning** : détection d'anomalies sur les patterns de trafic pour identifier des attaques inconnues (pas couvertes par ipsum).
- **Authentification** : l'API et le dashboard sont actuellement ouverts. En contexte SOC réel, un mécanisme JWT ou OAuth2 serait indispensable.
- **Géolocalisation** : une carte affichant l'origine géographique des IPs malveillantes pour visualiser d'où viennent les attaques.

---

## Licence

Test technique — Cyna, 2026. Projet non destiné à la production.

Sources externes utilisées :
- [Security-Log-Generator](https://github.com/cruikshank25/Security-Log-Generator) — licence MIT
- [ipsum](https://github.com/stamparm/ipsum) — The Unlicense (domaine public)
