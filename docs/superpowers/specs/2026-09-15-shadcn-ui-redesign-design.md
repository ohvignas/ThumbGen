# Refonte UI 100% shadcn — Design Spec

**Date:** 2026-09-15
**Repo:** `/Users/antoinevigneau/thumbgen-real` (Next.js 16 App Router, React 19.2, Zustand, `@xyflow/react`, TypeScript strict, Tailwind v4, shadcn style `base-nova`)

## Goal

Éliminer toute la couche de style maison (CSS/inline-style custom "Atelier Nocturne") de l'app chrome (tout sauf le canvas React Flow et ses nodes), et la remplacer intégralement par des primitives shadcn réelles sur un thème neutre standard (preset b0). La Sidebar — actuellement un panneau d'assets custom — devient une vraie sidebar app façon bloc `sidebar-07` (collapsible, groupes de navigation), prête à accueillir de futures sections produit sans rien construire de plus maintenant.

## Contexte

L'app a deux couches de style qui coexistent aujourd'hui dans `src/app/globals.css` :

1. **Tokens shadcn standard** (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar*`, `--radius`) — déjà présents mais avec des valeurs custom (dark tinté rose, pas le preset b0).
2. **Tokens custom "Atelier Nocturne"** (`--ink-0..3`, `--bone`/`--bone-soft`/`--bone-muted`/`--bone-faint`, `--brand` #E6007E, `--brand-tint`, `--ember`, `--surface`, `--accent`/`--accent-yellow` réutilisés pour le canvas, `--text-primary/secondary/tertiary/muted`, `--line`/`--line-faint`/`--line-strong`, `--canvas-bg`, `--node-bg`/`--node-bg-hover`) — référencés en `style={{ ... }}` inline dans quasiment tous les composants.

32 fichiers référencent ces tokens custom (grep exhaustif) :
`globals.css`, `layout.tsx`, `usage/UsageView.tsx`, `Canvas.tsx`, `edges/CustomEdge.tsx`, `nodes/{FaceReferenceNode,GeneratorNode,NodeShell,PreviewNode,PromptNode,SketchNode,SwipeFileNode,TextOverlayNode}.tsx`, `panels/{ChatPanel,ContextMenu,ProjectBar,SettingsPanel,Sidebar,SidebarRail,SketchEditor,WebcamCaptureModal,ZoomBar}.tsx`, `panels/chat/{AgentActivity,AttachButton,Composer,ConversationList,ImageAnnotateModal,LibraryPickerModal,Message,MessageList,MicButton,PendingUiAction,TextMarkdown,UsageBadge}.tsx`, `panels/chat/tool-renderers/{GeneratedImagePreview,SearchYoutubeGallery,SimpleToolPart}.tsx`, `panels/settings/McpSettingsSection.tsx`.

shadcn déjà installés (`src/components/ui/`) : `alert`, `bubble`, `button`, `card`, `collapsible`, `empty`, `input-group`, `input`, `message-scroller`, `message`, `textarea`, `tooltip`.

## Non-Goals

- **Canvas et nodes React Flow** (`Canvas.tsx`, `edges/CustomEdge.tsx`, `nodes/*.tsx`) : aucun changement visuel. Ce sont l'outil de travail principal, avec des contraintes spécifiques (handles, drag, sélection) — hors périmètre. La seule modification : renommage mécanique de deux variables CSS (voir Fondation ci-dessous), zéro impact visuel.
- **Nouvelles fonctionnalités produit** (veille concurrentielle, suivi de projets vidéo, test titres/miniatures, stats) : pas construites ici. La Sidebar est structurée pour pouvoir en accueillir plus tard, mais un seul groupe de navigation ("Miniatures") existe pour l'instant.
- **Comportement applicatif** : aucun changement, SAUF le parcours de gestion des visages (voir section dédiée ci-dessous) qui corrige des frictions réelles en plus du reskin. Partout ailleurs (Modèles, Logos, Inspirations, ProjectBar, ZoomBar, Settings, modals), tous les appels fetch, la logique d'état (Zustand), le drag-and-drop, les raccourcis clavier restent identiques — réécriture de présentation, pas de logique.
- **Typographie** : reste Arial partout (déjà un système mono-police ; le preset b0 n'impose pas de police).

## Architecture

### 1. Fondation — tokens

**Étape préalable (mécanique, canvas non affecté visuellement) :** `--accent` (#6EDDB3, vert) et `--accent-yellow` (#F7FFA8) sont réutilisés aujourd'hui à la fois comme couleur des handles React Flow/canvas ET comme nom de token shadcn standard (`--color-accent` dans `@theme inline`). Renommer en `--canvas-accent` / `--canvas-accent-yellow` dans `globals.css` et dans les 9 fichiers qui les consomment (`Canvas.tsx`, `edges/CustomEdge.tsx`, les 7 fichiers `nodes/*.tsx`, plus la règle CSS globale `.react-flow__handle`, plus `ZoomBar.tsx` qui utilise `--accent-yellow` pour le mode actif). Résultat : zéro pixel changé sur le canvas, le nom `--accent` est libéré pour le vrai token shadcn.

**Swap thème :** dans `:root` et `.dark` de `globals.css`, remplacer les valeurs des tokens shadcn standard par les valeurs oklch du preset b0 :

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

L'app force la classe `dark` sur `<html>` (`layout.tsx`) — donc le bloc `.dark` s'applique : l'app reste sombre, en gris neutre b0 au lieu de noir/rose custom. Les tokens Atelier Nocturne (`--ink-*`, `--bone*`, `--brand*`, `--ember`, `--surface`, `--text-*`, `--line*`, `--canvas-bg`, `--node-bg*`) restent définis dans `globals.css` (le canvas/nodes en dépendent) mais plus aucun fichier du périmètre ne les référence après cette refonte.

### 2. Primitives shadcn à installer

Manquants aujourd'hui, à installer via `npx shadcn@latest add <name>` (style `base-nova` déjà configuré) : `sidebar`, `dropdown-menu`, `separator`, `breadcrumb`, `avatar`, `dialog`, `select`, `switch`, `label`, `table`, `badge`, `toggle-group`, `skeleton`.

(`tooltip`, `card`, `collapsible`, `button`, `input`, `textarea`, `alert` déjà installés.)

## Composant par composant

### App shell (`layout.tsx`, `page.tsx`)
`layout.tsx` enveloppe `{children}` dans `SidebarProvider` (en plus du `TooltipProvider` déjà en place). `page.tsx` (la page canvas) place `AppSidebar` puis `SidebarInset` autour du contenu existant (Canvas + ProjectBar + ZoomBar + ChatPanel superposés, inchangés en position/logique).

### Sidebar → `AppSidebar.tsx` (remplace `Sidebar.tsx` + `SidebarRail.tsx`)
Structure façon bloc sidebar-07 : `Sidebar collapsible="icon"`. `SidebarHeader` = marque ThumbGen (pas de team-switcher, un seul workspace). `SidebarContent` = un seul `SidebarGroup` "Miniatures" avec `SidebarMenuButton` pour Personnages / Modèles d'image / Inspirations / Logos (comportement inchangé : clic = toggle d'un panneau, comme aujourd'hui). `SidebarFooter` = `SidebarMenuButton` vers Usage (`/usage`) et Réglages (ouvre le nouveau Dialog Settings).

Le panneau qui s'affiche au clic (recherche + grille d'assets + upload + drag-drop + suppression) garde sa logique pour Modèles/Logos/Inspirations (state, fetch, drag handlers inchangés — seul le markup passe de `style={{ background: "var(--surface)" }}` etc à des classes Tailwind liées aux tokens b0, et à de vraies primitives `Input`/`Button`/`Empty`/`EmptyMedia`). L'onglet "Visages" (ex-"Personnages") a un vrai correctif de parcours, détaillé ci-dessous.

#### Parcours — gestion des visages (correctif, pas juste un reskin)

Constat sur le comportement actuel (`Sidebar.tsx`) : deux systèmes de visages empilés sans explication (Personas 3-angles via webcam uniquement, et "Autres visages" 1-photo via upload fichier) ; la barre de recherche en haut du panneau ne filtre rien pour cet onglet (branchée seulement côté Inspirations) ; aucune option d'import de photo pour créer un Persona (webcam obligatoire) ; aucune édition possible (delete-only).

Correctifs (aucun changement d'API/backend — `/api/personas` et `/api/face-reactions` gardent leurs contrats actuels) :
- **Grille unifiée "Visages"** : les entrées Persona (badge `{n}/3`) et les entrées legacy (badge `1 photo`) s'affichent ensemble, triées par date de création, dans la même grille. Clic = ajoute un nœud `faceReference` au canvas (comportement déjà identique pour les deux aujourd'hui — inchangé).
- **Un seul bouton "Nouveau visage"** ouvre un `Dialog` à deux choix clairs : "Capturer avec la webcam" (ouvre `WebcamCaptureModal`, flux 3-angles inchangé, POST `/api/personas`) ou "Importer une photo" (file picker simple, POST `/api/face-reactions`, flux legacy inchangé). Les deux options restent chacune sur leur endpoint actuel — c'est uniquement l'entrée unique + le choix explicite qui est nouveau.
- **Recherche fonctionnelle** : le champ de recherche en haut du panneau filtre désormais la grille Visages (et Modèles, et Logos) par label, en réutilisant le même pattern déjà validé pour Inspirations (`swipeSearch`/`filteredSwipe`) — un state de recherche par onglet, filtre client-side sur le label.
- **Renommage inline** pour les deux types de visages (même pattern `onBlur` déjà utilisé pour les Logos).
- **Hors scope pour cette passe** (fast-follow explicite, pas dans ce plan) : remplacer/recapturer un seul angle d'un Persona existant — nécessiterait un contrat API plus riche, non confirmé. Ne pas l'implémenter maintenant.

### `ProjectBar.tsx`
Le menu custom positionné en absolu (avec listener `mousedown` manuel pour fermer au clic extérieur) devient un `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`. Le renommage inline reste un `Input` contrôlé dans l'item. Le bouton déclencheur devient un `Button variant="outline"`.

### `ZoomBar.tsx`
Toggle Navigate/Pan → `ToggleGroup type="single"` (correspond exactement au pattern actuel). Boutons Auto-layout/Undo/Redo → `Button variant="ghost" size="icon"` + `Tooltip`. Séparateurs verticaux → `Separator orientation="vertical"`. Menu de zoom (%) → `DropdownMenu`.

### `ContextMenu.tsx`
Ce composant est aujourd'hui positionné impérativement à des coordonnées `x, y` arbitraires (appelé depuis divers points du canvas/des nodes avec un point de clic droit déjà capturé), pas via un vrai wrapper `onContextMenu` shadcn. Pour ne pas toucher au canvas/nodes (hors périmètre), il devient un `DropdownMenu` avec `open` contrôlé et positionnement custom via `style` sur `DropdownMenuContent` (`position: fixed; left/top`) plutôt que le primitive `ContextMenu` natif (qui exige un vrai `ContextMenuTrigger` autour de la zone cliquée). Props externes inchangées (`x, y, sections, items, onClose`) — aucun site d'appel ne change.

### Settings (`SettingsPanel.tsx` + `settings/McpSettingsSection.tsx`)
Devient un `Dialog` (déclenché depuis le footer de la Sidebar) plutôt qu'un panneau inline dans la rail. `DialogContent` scrollable contient les mêmes champs (7 clés API en `Input type="password"` + `Label`, sélecteur de modèle agent en `Select`, toggle recherche web en `Switch` remplaçant la checkbox brute, sélecteur de langue en `Select`, champ chaîne YouTube en `Input`). Bouton Enregistrer → `Button` avec état `disabled`/texte inchangés. `McpSettingsSection` : les boutons icône (reveal/copy/régénérer) → `Button variant="ghost" size="icon"` + `Tooltip` ; le bloc `<details>` de config Claude Desktop → `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` (déjà installé) ; le token/code block reste `<code>`/`<pre>` avec classes Tailwind (`bg-muted`, `font-mono`) — pas de composant shadcn dédié pour ça.

### `WebcamCaptureModal.tsx`, `LibraryPickerModal.tsx`, `ImageAnnotateModal.tsx`
Les trois sont déjà des overlays plein écran custom — deviennent des `Dialog`/`DialogContent` (taille large via `className`). Logique interne (capture webcam, sélection depuis bibliothèque, annotation d'image) inchangée.

### `SketchEditor.tsx`
Exception similaire au canvas : la surface de dessin elle-même (probablement un `<canvas>` HTML avec ses propres gestionnaires de pointeur) reste intouchée. Le chrome autour (barre d'outils, bouton fermer, sélecteur de couleur/épaisseur, séparateurs) passe en `Button`/`ToggleGroup`/`Separator` shadcn.

### `usage/UsageView.tsx`
Page la plus travaillée visuellement (gros chiffre serif animé, sparkline quotidienne, barres de répartition par modèle, table de log) via un bloc `<style jsx>` de ~400 lignes utilisant les tokens custom. La hiérarchie d'information et la structure de page (hero number, split images/agent, breakdown par modèle avec barres, table d'activité récente) est conservée — seule l'implémentation change : `<style jsx>` supprimé entièrement, remplacé par Tailwind + primitives :
- Sélecteur de période → `ToggleGroup type="single"`
- Cartes de synthèse (coût images / coût agent) → `Card`/`CardHeader`/`CardContent`
- Barres de répartition par modèle → `div` Tailwind avec largeur calculée en style inline (donnée, pas décoratif — comme le ferait `Progress` en interne) ou composant `Progress` si le style final s'y prête
- Squelette de chargement → `Skeleton` (au lieu du shimmer CSS custom)
- Badge provider/modèle dans la table → `Badge`
- Table d'activité → `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableCell`
- États vides → `Empty`

Compromis assumé : le très gros chiffre serif italique (96–200px, police display) perd son traitement typographique signature puisque la police reste Arial et que le style custom disparaît — il redevient un gros chiffre en style shadcn standard (toujours mis en avant via `text-6xl`/`font-bold` sur `Card`, mais moins "éditorial"). C'est le principal compromis visuel de toute la refonte.

### `ChatPanel.tsx` + `panels/chat/*`
Travail déjà en cours (conversion vers `Card`/`CardHeader`/`CardContent`/`CardFooter`/`Tooltip` sur `ChatPanel.tsx`, `Tooltip` déjà ajouté à `MicButton.tsx`). Cette refonte le complète : `Composer.tsx` (boutons send/stop), `AttachButton.tsx` (son `IconButton` interne) reçoivent le même pattern `Tooltip`. Les fichiers restants qui utilisent encore des tokens custom (`AgentActivity`, `PendingUiAction`, `Message`, `TextMarkdown`, `UsageBadge`, `ConversationList`, `ImageAnnotateModal`, `LibraryPickerModal`, les 3 `tool-renderers/*`) passent leurs `style={{ color: "var(--text-muted)" }}` etc vers des classes Tailwind b0 (`text-muted-foreground`, etc).

## Vérification

Réécriture purement présentationnelle — aucune nouvelle logique testée unitairement. Vérification :
- `npx tsc --noEmit` après chaque tâche (pattern déjà établi dans les plans précédents)
- Suite de tests existante doit rester verte (elle ne couvre pas le style, donc aucun test ne devrait changer)
- Vérification visuelle live via le navigateur (dev server) sur chaque surface convertie : Sidebar (ouverture/fermeture des panneaux, upload, drag-drop vers le canvas), ProjectBar (créer/renommer/supprimer/switcher), ZoomBar (zoom/pan/undo-redo/auto-layout), ContextMenu (ouverture au bon endroit), Settings Dialog (sauvegarde des clés), les 3 modals, SketchEditor, page Usage (tous les states : chargement, vide, avec données), ChatPanel (envoi de message, tool calls, pièces jointes, changement de conversation)
- Vérification qu'aucun pixel du canvas/des nodes n'a changé (avant/après screenshot de la zone canvas)

## Risques

- **UsageView** perd son traitement éditorial signature (gros chiffre serif) — voir compromis ci-dessus, assumé.
- **ContextMenu** change de mécanisme interne (DropdownMenu positionné plutôt que div custom) — comportement (ouverture au point de clic, fermeture au clic extérieur/Escape) doit être vérifié identique.
- Volume de fichiers touchés (~30) — risque de régression fonctionnelle si une prop ou un handler est perdu pendant la conversion JSX ; chaque tâche du plan doit être testée en isolation avant de passer à la suivante.
