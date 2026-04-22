# ThumbGen — Guide d'installation

Générateur de miniatures YouTube IA avec canvas node-based.
Fork modifié pour fonctionner **sans Cloudflare** (stockage local JSON).

---

## Pré-requis

- Docker + Docker Compose
- Une clé API Google Gemini (gratuite : https://aistudio.google.com/apikey)
- Optionnel : clé API Ideogram, Notion, YouTube

---

## 1. Installation locale (Mac / Linux / Windows)

```bash
# Cloner ou copier le projet
cd ~/Desktop/ThumbGen

# Configurer les clés API
cp .env.example .env    # ou éditer le .env existant
# Mettre ta clé GEMINI_API_KEY dans le .env

# Lancer
docker compose up -d

# Ouvrir dans le navigateur
open http://localhost:3000
```

**Arrêter :**
```bash
docker compose down
```

**Voir les logs :**
```bash
docker logs thumbgen -f
```

---

## 2. Installation sur un serveur (VPS / Debian / Ubuntu)

### 2.1 Installer Docker

```bash
# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Se reconnecter pour que le groupe prenne effet
```

### 2.2 Déployer ThumbGen

```bash
# Copier le projet sur le serveur (exemple avec scp)
scp -r ~/Desktop/ThumbGen user@ton-serveur:/opt/thumbgen

# Sur le serveur
ssh user@ton-serveur
cd /opt/thumbgen

# Configurer les clés API
nano .env
# → Renseigner GEMINI_API_KEY=ta_clé_ici

# Lancer
docker compose up -d
```

### 2.3 Accès depuis l'extérieur

Par défaut, l'app écoute sur le port **3000**.

**Option A — Accès direct :**
```
http://ton-serveur:3000
```

**Option B — Avec un reverse proxy nginx (recommandé) :**

```nginx
server {
    listen 80;
    server_name thumbgen.ton-domaine.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
}
```

Puis ajouter HTTPS avec Certbot :
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d thumbgen.ton-domaine.com
```

### 2.4 Protéger l'accès (optionnel)

Ajouter un mot de passe dans le `.env` :
```
SITE_PASSWORD=ton_mot_de_passe_ici
```

Puis redémarrer :
```bash
docker compose down && docker compose up -d
```

---

## 3. Persistence des données

Les projets (nodes, edges) sont sauvegardés dans `./data/projects.json`.

- **En local :** le fichier est dans `ThumbGen/data/`
- **En Docker :** le volume `./data:/app/data` monte ce dossier
- **Backup :** copier le fichier `data/projects.json` suffit

---

## 4. Variables d'environnement

| Variable | Requis | Description |
|----------|--------|-------------|
| `GEMINI_API_KEY` | Oui* | Clé API Google Gemini |
| `IDEOGRAM_API_KEY` | Oui* | Clé API Ideogram v3 |
| `NOTION_API_KEY` | Non | Import de swipe files depuis Notion |
| `YOUTUBE_API_KEY` | Non | Import de miniatures depuis une playlist YouTube |
| `SITE_PASSWORD` | Non | Mot de passe pour protéger l'accès |

*Au moins une clé de modèle IA est requise.

---

## 5. API REST

L'application expose deux endpoints pour la gestion des projets :

### GET /api/project

Charger un projet.

```bash
curl "http://localhost:3000/api/project?id=default"
```

**Réponse :**
```json
{
  "nodes": [
    {
      "id": "abc-123",
      "type": "prompt",
      "position": { "x": 100, "y": 200 },
      "data": { "prompt": "mon texte" }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-a",
      "target": "node-b",
      "sourceHandle": "output",
      "targetHandle": "prompt",
      "type": "custom"
    }
  ]
}
```

### POST /api/project

Sauvegarder un projet.

```bash
curl -X POST "http://localhost:3000/api/project" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "default",
    "nodes": [...],
    "edges": [...]
  }'
```

**Réponse :**
```json
{ "success": true }
```

---

## 6. Modifications par rapport au projet original

Le projet original (https://github.com/per-simmons/thumbgen) utilise **Cloudflare D1** (base de données distante) pour la persistence. Cette version modifiée remplace D1 par un **stockage local JSON**.

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `src/lib/local-storage.ts` | **Nouveau** — Module de stockage fichier JSON local (`data/projects.json`) |
| `src/app/api/project/route.ts` | **Réécrit** — Utilise `local-storage.ts` au lieu de `d1.ts` |
| `next.config.ts` | **Modifié** — Ajout `output: "standalone"` pour le build Docker |
| `.gitignore` | **Modifié** — Ajout `/data/` |
| `Dockerfile` | **Nouveau** — Build multi-stage Node.js Alpine |
| `docker-compose.yml` | **Nouveau** — Orchestration avec volume pour la persistence |
| `.env` | **Nouveau** — Variables d'environnement pour Docker |

### Fichier original non modifié mais plus utilisé

| Fichier | Statut |
|---------|--------|
| `src/lib/d1.ts` | Toujours présent mais plus importé — peut être supprimé |

### Pourquoi ces changements ?

- **Pas besoin de compte Cloudflare** — tout tourne en local
- **Zéro frais** — pas de base de données distante
- **Docker-ready** — un `docker compose up -d` et c'est lancé
- **Portable** — fonctionne sur Mac, Linux, VPS, n'importe où avec Docker
- **Backup simple** — copier `data/projects.json` suffit à sauvegarder tous les projets
