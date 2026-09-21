# ThumbGen — installation (Docker)

Interface en français. Clés API **optionnelles au démarrage** : l’UI s’ouvre sans clés ; tu les colles ensuite dans **Réglages → Connexions des modèles**. Ne committe jamais le vrai `.env`. `.env.example` (placeholders vides) est versionné.

## Nouvelle machine

Les commentaires sont sur leur propre ligne : un `#` après `cp` est lu par zsh comme un argument (`cp: vides: Not a directory`).

```bash
git clone https://github.com/ohvignas/ThumbGen.git
cd ThumbGen
cp .env.example .env
docker compose up -d --build
```

`.env` est un fichier vide, sans clés — tu peux le laisser tel quel et coller les clés dans Réglages.

Si `git clone` échoue parce que le dossier `ThumbGen` existe déjà, ne reclones pas :

```bash
cd ThumbGen
git pull
docker compose up -d --build
```

Ouvre **http://localhost:3000**.

Si tu utilises des **git worktrees**, lance Compose depuis le **dépôt principal** (`git worktree list`), pas depuis un worktree lié : `./data` est relatif à ce dossier.

## Dans l’app

- **Miniatures** — projets canvas (nœuds → générateur). Accueil : `/miniatures`.
- **Vidéos** — studio d’écriture : script, titres, description YouTube, kanban.
- **Inspirations** — recherche YouTube et chaînes suivies (onglet de la Bibliothèque).
- **Bibliothèque** — personnages, logos, images d’inspiration.
- **Réglages** — clés dans **Connexions des modèles** (pas requises pour démarrer).

## Retrouver le fichier `.env`

Il est **à côté de** `docker-compose.yml` (pas dans `src/`, pas dans le conteneur).

```bash
npm run where-env
```

Sans Node : `sh scripts/where-env.sh`.

La commande affiche les chemins **absolus** de `.env` et `.env.example`, et s’ils existent.

Créer le fichier s’il manque :

```bash
cp .env.example .env
```

## Données

Tout vit dans `./data/` (SQLite `thumbgen.db`), monté dans le conteneur. `docker compose down` ne l’efface pas. Ne lance pas un second Next.js sur le même fichier.

## Commandes utiles

| Commande | Effet |
|----------|--------|
| `docker compose up -d --build` | Build + démarre (après un `git pull` ou un changement de `.env`) |
| `docker logs -f thumbgen` | Logs |
| `docker compose down` | Stoppe le conteneur, garde `./data/` |
| `npm run where-env` | Chemin du `.env` |

Le guide complet (MCP, clés, dépannage) est dans [README.md](README.md).
