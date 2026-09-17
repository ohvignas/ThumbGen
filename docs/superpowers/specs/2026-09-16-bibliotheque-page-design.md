# Page Bibliothèque (chantier C)

Date : 2026-09-16
Statut : approuvé en brainstorming
Repo : `/Users/antoinevigneau/thumbgen-real`
Ordre d'exécution : après les chantiers Réglages, A (`2026-09-16-canvas-ajout-etapes-design.md`) et B (`2026-09-16-generateur-ab-design.md`), tous fusionnés dans `main`. Le chantier D (`2026-09-16-chaines-suivies-design.md`) vient après et s'appuie sur la page créée ici.

## Problème

La bibliothèque vit dans un panneau déroulant de la sidebar (`src/components/panels/AppSidebar.tsx`, ~700 lignes) avec quatre entrées : Personnages, Modèles d'image, Inspirations, Logos. On y glisse-dépose des éléments vers le canvas.

- Le panneau est étroit (240–300 px) : impossible de bien organiser, chercher ou gérer beaucoup d'éléments.
- « Modèles d'image » n'a plus d'intérêt : le modèle se choisit dans le générateur et dans Réglages → Génération d'images.
- Les logos ne peuvent qu'être importés à la main ; aucune recherche.
- Les Personnages ne se gèrent pas (renommer, remplacer un angle, supprimer) depuis un endroit clair.

## Décisions prises en brainstorming

- Une seule entrée « Bibliothèque » dans la sidebar, qui ouvre une page dédiée.
- Les éléments arrivent dans une miniature **depuis les nœuds** (bouton « Choisir dans la bibliothèque »), plus par glisser-déposer depuis la sidebar. La page sert à gérer.
- « Modèles d'image » est supprimé.
- Logos : sources **open source sans clé** (Simple Icons, SVGL, Wikimedia Commons), import d'image, et **clé Brandfetch optionnelle** saisie par l'utilisateur dans Réglages. Pas de clé partagée dans le code.
- Brandfetch interdit de stocker ses logos : un logo Brandfetch est enregistré comme **référence distante** (URL), téléchargé au moment où il sert (aperçu, génération), jamais stocké en base.
- Les chaînes suivies, les vues, le score et le classement par type sont le chantier D.

## Design

### 1. Sidebar

- Le groupe « Bibliothèque » (Personnages, Modèles d'image, Inspirations, Logos) et tout le panneau déroulant disparaissent de `AppSidebar.tsx`, avec leur état et leurs chargements.
- Nouvelle entrée « Bibliothèque » (icône `Library`) juste sous « Mes miniatures », active sur `/bibliotheque`.
- Restent inchangés : « Mes miniatures », « Usage », « Réglages », le lien actif, le déclencheur de repli de la sidebar.
- `src/store/library-store.ts` (onglet du panneau) est supprimé ou remplacé par la navigation vers la page ; le nœud Personnage ne l'utilise plus (§5).
- Le glisser-déposer « sidebar → canvas » (`onDrop` de `Canvas.tsx` lisant `application/reactflow-type` / `application/reactflow-data`) est retiré s'il n'a plus d'autre source ; les autres chemins de création de nœuds (panneau « Ajouter une étape », clic droit, agent) gardent les réglages par défaut du générateur.

### 2. Page `/bibliotheque`

- Route `src/app/bibliotheque/page.tsx`, même coque que `/miniatures` (sidebar + en-tête avec titre « Bibliothèque »).
- Trois onglets shadcn `Tabs` : **Personnages**, **Logos**, **Inspirations**. L'onglet actif est dans l'URL (`?onglet=personnages|logos|inspirations`, défaut `personnages`) pour pouvoir y renvoyer depuis un nœud.
- Chaque onglet : barre de recherche locale (filtre par nom, insensible aux accents et à la casse), grille responsive de cartes, état vide avec action principale.
- Composants shadcn uniquement (Card, Button, Input, Dialog, AlertDialog/ConfirmDialog, DropdownMenu, Badge, Skeleton), textes en français.

### 3. Onglet Personnages

- Carte par personnage : les 3 angles (Face, Profil gauche, Profil droit ; case vide « — » si absent), nom, compteur « n/3 ».
- Bouton « Nouveau personnage » : choix « Capturer avec la webcam » (composant existant `WebcamCaptureModal`) ou « Importer une photo par angle » (composant existant `PersonaImportDialog`). Création via `POST /api/personas`.
- Menu « … » par carte :
  - « Renommer » → `PATCH /api/personas/[id]`.
  - « Remplacer un angle » → choix de l'angle puis import d'une image → `POST /api/personas/[id]/photos`.
  - « Supprimer » → confirmation (`ConfirmDialog`) → `DELETE /api/personas/[id]`.
- La création exige au moins la photo de face (comme `PersonaImportDialog` aujourd'hui) ; le serveur refuse aussi un personnage sans aucune photo (correction de la limite relevée au chantier A).

### 4. Onglet Logos

#### Recherche

- Barre « Chercher un logo » (au moins 2 caractères, anti-rebond ~300 ms) ; les résultats des sources sont fusionnés dans une grille, chaque carte indique la source (badge) et la variante (Clair / Sombre / Couleur quand connue).
- Route serveur `GET /api/logos/search?q=` qui interroge les sources en parallèle avec un délai maximum par source (~4 s) ; une source en erreur est ignorée et signalée discrètement (« SVGL indisponible »), pas d'échec global.
- Sources :
  - **Simple Icons** — dépendance npm (`simple-icons`), recherche locale par titre et alias, SVG + couleur de marque. Aucune requête réseau.
  - **SVGL** — API publique sans clé (`https://api.svgl.app?search=`), variantes claire/sombre quand fournies. Réponses mises en cache côté serveur quelques minutes.
  - **Wikimedia Commons** — API MediaWiki sans clé (recherche de fichiers `File:` contenant « logo », SVG/PNG), en-tête `User-Agent` identifiant ThumbGen comme l'exige Wikimedia. Rendu PNG via les vignettes Commons à la largeur voulue.
  - **Brandfetch** — uniquement si `brandfetchApiKey` est configurée : Brand Search API par nom, logos via le CDN Brandfetch avec la clé de l'utilisateur.

#### Ajouter un résultat

- Bouton « Ajouter » sur une carte :
  - Simple Icons / SVGL / Wikimedia : le serveur télécharge le fichier, convertit un SVG en **PNG 1024 px de large, fond transparent**, et l'enregistre dans la table `logos` (même stockage qu'un import). Le libellé par défaut est le nom de la marque.
  - Brandfetch : enregistrement d'une **référence distante** (URL CDN + nom), sans fichier. La table `logos` gagne une colonne `remote_url` (nullable, ajoutée par migration défensive comme les autres colonnes de `src/lib/db.ts`). `GET /api/logos/image` d'un logo distant va chercher l'image à la volée (sans la stocker) et la renvoie ; la génération passe par la même route, donc le modèle reçoit bien le logo.
- Import manuel : bouton « Importer une image » (flux d'upload existant `POST /api/logos`).

#### Logos enregistrés

- Sous la recherche, section « Mes logos » : grille des logos enregistrés, badge « Brandfetch » pour les références distantes, menu « … » Renommer (`POST /api/logos/rename`) / Supprimer (confirmation, `DELETE /api/logos`).

#### Réglages

- `brandfetchApiKey` rejoint `SECRET_KEYS` dans `src/lib/settings-schema.ts` (masquée, variable d'environnement `BRANDFETCH_API_KEY` en secours) et une carte dans Réglages → Connexions avec lien « Obtenir une clé gratuite » et bouton « Tester » (une recherche Brandfetch minimale via `src/lib/connection-tests.ts`).

### 5. Onglet Inspirations (partie C)

- Section « Mes images » : grille des images importées (`swipe_files`), bouton « Importer des images » (upload multiple existant), menu « … » Renommer (nouvelle route `POST /api/swipe-files/rename`) / Supprimer (confirmation).
- Section « Chaînes suivies » : état « Bientôt » tant que le chantier D n'est pas livré. Le fil « Ma chaîne » actuel du panneau (via `/api/youtube/playlist`) est affiché ici en lecture seule en attendant, pour ne rien perdre ; l'écouteur `youtube-channel-saved` (rechargement après sauvegarde de « Ma chaîne ») déménage avec ce fil.

### 6. Choisir dans la bibliothèque depuis un nœud

- Composant partagé `LibraryPickerDialog` (évolution de `src/components/panels/chat/LibraryPickerModal.tsx`, qui garde son usage dans le chat) : `Dialog` avec recherche et grille, ouvert sur un type (`personnages`, `logos`, `inspirations`).
- **Nœud Image de référence / Logo** (`SwipeFileNode.tsx`) : à côté de l'import de fichier existant, bouton « Choisir dans la bibliothèque » → dialog sur `inspirations` ou `logos` selon `data.kind`. Pour `logos`, le dialog propose aussi un onglet « Chercher en ligne » (même recherche qu'au §4) : un résultat choisi est d'abord ajouté à la bibliothèque puis placé dans le nœud.
- Choisir un élément remplit le nœud comme aujourd'hui depuis le glisser-déposer (`imageUrl` vers la route image de la bibliothèque, `label`), sans dupliquer le fichier.
- **Nœud Personnage** (`FaceReferenceNode.tsx`) : garde sa liste déroulante des personnages ; « Créer un personnage » ouvre `/bibliotheque?onglet=personnages` dans un nouvel onglet du navigateur (la miniature en cours reste ouverte) et la liste se recharge quand la fenêtre reprend le focus.

### 7. Agent

- Aucun changement d'outil : `list_personas`, `list_logos`, `list_swipe_files` gardent leur contrat. `list_logos` expose les logos distants avec la même forme (source `stored:` identique) ; l'image est servie par la route qui récupère le distant.

## Gestion des erreurs

- Recherche de logos : délai par source, source en échec ignorée et signalée ; aucune source disponible → message « Recherche indisponible, importe une image ».
- Conversion SVG → PNG en échec (SVG invalide) → erreur claire, rien n'est enregistré.
- Logo distant Brandfetch introuvable ou clé retirée → la route image renvoie 404, la carte affiche « Logo indisponible » avec « Supprimer ».
- Suppression d'un personnage ou logo utilisé par un nœud : le nœud affiche son état vide au prochain chargement (pas de cascade dans les canvas).

## Tests

- Fusion et normalisation des résultats de recherche (Simple Icons local ; SVGL, Wikimedia, Brandfetch avec `fetch` simulé) ; source en erreur ignorée ; délai respecté.
- Ajout d'un logo : SVG converti en PNG transparent 1024 px ; logo Brandfetch enregistré sans fichier avec `remote_url` ; route image d'un logo distant (fetch simulé, aucun stockage).
- Migration `logos.remote_url` idempotente.
- `POST /api/personas` refuse zéro photo ; renommer / remplacer un angle / supprimer.
- `POST /api/swipe-files/rename`.
- Réglages : `brandfetchApiKey` masquée, test de connexion avec fetch simulé.
- Aucun test n'appelle un service réel.

## Vérifications manuelles

- Sidebar : une seule entrée « Bibliothèque » ; plus de panneau ni de « Modèles d'image ».
- Page : onglets et URL, recherche locale, états vides.
- Personnages : créer (webcam et import), renommer, remplacer un angle, supprimer.
- Logos : chercher « nike », « notion », « youtube » ; ajouter un résultat de chaque source disponible ; importer ; renommer ; supprimer ; avec une clé Brandfetch, ajouter un logo distant et le voir dans un nœud Logo.
- Nœuds : « Choisir dans la bibliothèque » sur Image de référence et Logo, « Chercher en ligne » depuis un nœud Logo ; « Créer un personnage » depuis un nœud Personnage.

## Hors champ

- Chaînes suivies, vues, score de surperformance, classement par type (chantier D).
- Connexion OAuth YouTube et statistiques privées (chantier « Ma chaîne » ultérieur).
- Nouveaux outils agent.
