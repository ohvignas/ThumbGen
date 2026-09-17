# Audit de parcours — gestion des assets & vision produit

**Date:** 2026-09-15
**Méthode:** navigation live de l'app réelle (conteneur Docker `localhost:3000`, celui que l'utilisateur utilise), captures d'écran à chaque étape, clics réels (pas de lecture de code seule), auto-critique façon utilisateur avec les heuristiques de Nielsen. Pas de skill externe installé (candidats trouvés sur le web : [EliaAlberti/ux-audit-skill](https://github.com/EliaAlberti/ux-audit-skill), [gotalab/uxaudit](https://github.com/gotalab/uxaudit), [mastepanoski/claude-skills](https://github.com/mastepanoski/claude-skills) — non installés, code tiers non vérifié, audit fait directement à la place).

## Constats vérifiés en live (pas seulement en lisant le code)

1. **Recherche fantôme, confirmé en direct.** Tapé "zzz_nomatch" dans le champ "Rechercher" en haut du panneau Personnages → la persona "Antoine" reste affichée (aucun filtrage). Même champ visible sur Modèles/Logos, jamais branché. *Severité : moyenne — le champ le plus visible du panneau ne fait rien, sur 3 des 4 onglets.*
2. **Doublon de recherche sur Inspirations.** Ce même onglet a EN PLUS son propre champ "Rechercher des miniatures…", fonctionnel celui-là. Résultat : deux barres de recherche empilées, une morte + une vivante, sans que rien ne les distingue visuellement. *Sévérité : basse mais déroutant (violation heuristique Nielsen #4, cohérence/standards).*
3. **Création de Personnage = webcam obligatoire, aucune alternative visible.** Clic "Nouveau" → wizard 3 étapes, demande direct l'accès caméra. Sur un poste sans webcam ou accès refusé (testé : refus), le champ affiche "Accès webcam refusé…" mais le bouton "Capturer" reste actif/cliquable (pas désactivé, pas de retry clair), et je n'ai trouvé aucun bouton de fermeture visible dans le wizard lui-même (fermeture obtenue seulement en tâtonnant, pas une affordance claire). *Sévérité : haute — cul-de-sac possible pour l'utilisateur sans webcam fonctionnelle.*
4. **Réglages = panneau étroit (240-300px) avec 7 champs de clé API + sélecteurs empilés verticalement**, scroll long avant d'atteindre MCP et le bouton Enregistrer. Fonctionnel mais serré pour ce qu'il contient. *Déjà couvert par le plan en cours (conversion en Dialog).*
5. **Page Usage affiche $0.00 / 0 partout** (period "All time") sur le conteneur réel que l'utilisateur utilise. Soit la donnée est légitimement vide sur cette instance, soit ça recoupe la corruption SQLite déjà signalée cette session (`data/thumbgen.db`, fichier de récupération préparé à `/tmp/thumbgen_recovered.db`, jamais appliqué — toujours en attente de ta décision). À vérifier avant de considérer la page "juste moche" — elle pourrait être *cassée*.

## Points positifs à préserver (pas juste des critiques)

- Statut de connexion des clés API (pastille verte/grise + valeur masquée tronquée) — pattern clair, à garder.
- Intégration playlist YouTube dans Inspirations (30 vidéos, vignettes, drag-and-drop direct vers le canvas) — fonctionnalité riche et déjà bien pensée.
- Distinction visuelle nette entre les modèles d'image actifs vs inactifs (Ideogram/Grok grisés "(inactif)") dans le sélecteur du Composer.

## Vision produit — "plusieurs outils interconnectés pour une vidéo YouTube"

Aujourd'hui, l'app est structurée comme **un éditeur (canvas) + un tiroir d'assets (Sidebar) + un agent (chat)** — trois panneaux qui coexistent mais ne se répondent pas vraiment : le chat peut manipuler des outils, mais rien ne dit à l'utilisateur "voici les briques disponibles pour CETTE vidéo" de façon unifiée. Les futurs outils que tu as mentionnés (veille concurrentielle, suivi de projet vidéo, test titres/miniatures, stats) auraient besoin d'un point d'ancrage commun — probablement la notion de **Projet** (qui existe déjà via `ProjectBar` mais sert aujourd'hui uniquement à nommer/switcher un canvas, pas à regrouper "tout ce qui concerne cette vidéo").

Recommandation (réflexion, pas une tâche à lancer maintenant — tu as été clair : thumbnails d'abord) : quand ces outils arriveront, la Sidebar sidebar-07 qu'on construit maintenant (groupes de navigation extensibles) est le bon point d'ancrage — chaque futur outil devient un nouveau `SidebarGroup`, et le `Projet` actuel devient le conteneur naturel qui les relie tous pour une vidéo donnée. Rien à faire aujourd'hui, juste confirmer que la structure en cours ne ferme pas cette porte — elle ne la ferme pas.

## Ce qui rentre dans le plan en cours vs. ce qui attend

**Déjà couvert par le plan (Task 3b) :** grille Visages unifiée, entrée de création unique webcam/upload, recherche branchée, renommage inline.

**Nouveau, à ajouter à Task 3b :** désactiver "Capturer" quand l'accès webcam est refusé + s'assurer qu'un bouton de fermeture clair existe dans `WebcamCaptureModal` à toute étape.

**Nouveau, à ajouter au périmètre général (petit) :** supprimer le champ de recherche générique en haut du panneau pour les onglets où il ne filtre rien (Modèles n'en a pas besoin, Logos/Visages l'auront via Task 3b), pour ne pas dupliquer avec celui d'Inspirations qui reste tel quel.

**Hors scope, en attente de ta décision (déjà signalé, pas nouveau) :** la corruption `data/thumbgen.db` — le $0.00 sur Usage pourrait en être un symptôme direct.

**Hors scope, vision long terme (pas maintenant) :** unifier Projet ↔ futurs outils (veille/stats/etc).
