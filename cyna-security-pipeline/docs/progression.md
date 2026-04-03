# Progression du projet — Cyna Security Pipeline

## Ce qu'on a construit

### 1. Parseurs de logs (`src/ingestion/parse_logs.py`)

Trois parseurs couvrant les formats produits par Security-Log-Generator :

| Type | Format | Champs extraits |
|------|--------|-----------------|
| `ids` | Une ligne par événement | timestamp, severity, protocol, source_ip, source_port, dest_ip, dest_port, flag, alert_type |
| `access` | Une ligne par événement | timestamp, client_ip, username, method, url, protocol, status_code, bytes, referer, user_agent |
| `endpoint` | Multi-lignes (blocs `Date:`) | timestamp, event_type, scan_type, malware_found, file_name, threat_name, action_taken, user, computer |

Résultats de parsing : **180 ids / 220 access / 120 endpoint** — 0 erreur.

---

### 2. Infrastructure Docker + PostgreSQL

- `docker-compose.yml` — 3 services : `db`, `pipeline`, `dashboard`
- `config/init.sql` — schéma PostgreSQL avec 3 tables et 5 index
- PostgreSQL exposé sur `localhost:5433` (5432 déjà occupé par un PostgreSQL local)
- Schéma vérifié via pgAdmin

**Tables créées :**

```sql
security_logs   -- logs bruts de tous types
malicious_ips   -- IPs du feed ipsum
enriched_logs   -- résultat du croisement
```

---

### 3. Ingestion des logs (`src/ingestion/ingest_logs.py`)

- Parse les 3 fichiers `.log`
- Mappe chaque type vers les colonnes de `security_logs`
- Insertion en batch via `execute_batch` (page_size=500)
- **520 lignes insérées** (180 ids + 220 access + 120 endpoint)

---

### 4. Ingestion ipsum (`src/ingestion/ingest_ipsum.py`)

- Lit `ipsum/ipsum.txt` depuis le disque (fichier local, pas de téléchargement)
- Parse les lignes `IP\tscore`, ignore les commentaires
- `ON CONFLICT DO UPDATE` pour permettre les mises à jour futures
- **129 212 IPs malveillantes insérées** dans `malicious_ips`

---

### 5. Enrichissement (`src/enrichment/enrich.py`)

- Jointure SQL entre `security_logs` et `malicious_ips` sur `source_ip` et `dest_ip`
- Résultat : **0 correspondance**

---

## Le problème actuel

### Pourquoi 0 correspondance ?

Le Security-Log-Generator utilise **Faker** pour générer des IPs aléatoires. Ces IPs sont fictives et ne correspondent à aucune des 129 212 IPs réelles du feed ipsum.

```
security_logs.source_ip  →  ex: 61.72.88.110   (générée aléatoirement par Faker)
malicious_ips.ip         →  ex: 185.220.101.34 (vraie IP malveillante recensée)
```

Le croisement ne produit aucun résultat car les deux datasets n'ont aucune IP en commun.

C'est un problème inhérent au projet : **des données simulées ne matchent pas des données réelles**.

---

## Options pour résoudre le problème

### Option A — Injecter des IPs ipsum dans `security_logs` (recommandée)

Écrire un script one-shot qui :
1. Pioche N IPs depuis `malicious_ips` (ex: les 100 avec le score le plus élevé)
2. Les insère comme logs IDS fictifs dans `security_logs`

**Avantages :** rapide, ne touche pas au générateur, données contrôlées  
**Inconvénients :** données artificielles, clairement à documenter dans le README

---

### Option B — Modifier le générateur de logs

Modifier `Security-Log-Generator/config.yaml` ou `generators/` pour forcer une partie des IPs générées à être des IPs connues d'ipsum.

**Avantages :** pipeline plus réaliste de bout en bout  
**Inconvénients :** nécessite de comprendre et modifier le code du générateur externe

---

### Option C — Abaisser le seuil / utiliser des IPs privées communes

Créer une liste d'IPs "malveillantes" fictives correspondant aux plages utilisées par Faker, et les insérer dans `malicious_ips` à la place d'ipsum.

**Avantages :** garder les logs intacts  
**Inconvénients :** perd l'intérêt du feed ipsum réel, peu convaincant techniquement

---

## État des fichiers

```
cyna-security-pipeline/
├── docker-compose.yml          ✅
├── Dockerfile                  ✅
├── requirements.txt            ✅
├── .env / .env.example         ✅
├── .gitignore                  ✅
├── config/
│   └── init.sql                ✅
├── src/
│   ├── ingestion/
│   │   ├── __init__.py         ✅
│   │   ├── parse_logs.py       ✅
│   │   ├── ingest_logs.py      ✅
│   │   └── ingest_ipsum.py     ✅
│   ├── enrichment/
│   │   ├── __init__.py         ✅
│   │   └── enrich.py           ✅
│   └── dashboard/
│       └── app.py              ❌ à faire
└── scripts/
    └── run_pipeline.sh         ❌ à faire
```
