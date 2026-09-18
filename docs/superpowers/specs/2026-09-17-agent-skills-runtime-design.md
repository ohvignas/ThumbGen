# Agent normal + skills par outil — design

Date : 2026-09-17. Statut : validé (plan Cursor). Remplace le wizard THUMBNAIL JOURNEY « Étape n/7 » de F3a.

## Problème

Le chat n’est pas un orchestrateur. Un prompt force 7 étapes, une fiche stocke `step`, l’UI affiche « Étape n/7 ». L’utilisateur veut un agent conversationnel avec des outils.

## Décisions

- **System prompt court** : identité, canvas, coût, `finish_turn`, catalogue de skills. Plus de STEPS 1–7, plus de « Until then ».
- **Une skill par outil** (`src/lib/agent/skills/<name>/SKILL.md`) plus `thumbnail-packaging` et `existing-workflow`.
- **Progressive disclosure** (Anthropic Agent Skills) : au boot, seulement `name` + `description` ; le corps se charge avec `read_skill`.
- **`read_skill`** : chat-only, pas MCP. ThumbGen n’a pas de filesystem agent.
- **Descriptions d’outils** : quand / quand pas / vs l’outil voisin.
- **UI** : plus de « Étape n/7 » (cartes, ligne live, badge Fiche). `ask_user.step` reste accepté (historique, fake) mais n’est plus affiché ni demandé.
- **Fiche** : mémoire optionnelle via `update_brief`, sans pipeline. `step` reste dans le schéma (défaut 1) pour les fiches déjà stockées.
- **Garde-fou esquisses** : plus de refus « avant l’étape 7 » ; la limite `2 × variantes + 3` reste.
- **F3b** : outils Perplexity / logos / concurrents branchés, sans câblage journey.
- **F3c** : ne pas merger le wizard ; `color_blocking` / A/B `place_node` plus tard.
- **AGENTS.md** racine : pour Cursor / Codex qui éditent le repo, **pas** injecté dans Brainstorm.

## Outil `read_skill`

Entrée `{ name }`. Réponse : le markdown du `SKILL.md` (sans frontmatter). Nom inconnu → erreur. Aucun réseau.

## Tests

- Prompt : pas de « STEPS », « Étape n/7 », `trigger_generation`, « THUMBNAIL JOURNEY » ; catalogue présent ; `read_skill` dans les outils du chat.
- `read_skill` : corps renvoyé, nom inconnu refusé.
- UI : carte `ask_user` et bouton Fiche sans numéroteur de pipeline.
- Garde-fou : esquisse autorisée avec une fiche à n’importe quel `step` ; limite d’usage inchangée.
- Fake agent : plus de script 1→7 ; conversation courte avec outils, jamais `generate_sketch` payant.
