#!/bin/sh
# Print the absolute .env / .env.example paths Compose uses.
# Usage: npm run where-env    or    sh scripts/where-env.sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
COMPOSE="$ROOT/docker-compose.yml"
ENV_FILE="$ROOT/.env"
EXAMPLE="$ROOT/.env.example"

status_of() {
  if [ -f "$1" ]; then
    printf 'EXISTS / présent\n'
  else
    printf 'MISSING / absent\n'
  fi
}

printf '%s\n' "ThumbGen — where is .env? / où est le fichier .env ?"
printf '%s\n' ""
printf '%s\n' "Compose project directory / dossier utilisé par docker compose :"
printf '  %s\n' "$ROOT"
printf '%s\n' "  (run compose from here, not a linked git worktree)"

if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_dir=$(git -C "$ROOT" rev-parse --path-format=absolute --git-dir 2>/dev/null || git -C "$ROOT" rev-parse --absolute-git-dir)
  common_dir=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || git -C "$ROOT" rev-parse --git-common-dir)
  case "$common_dir" in
    /*) : ;;
    *) common_dir="$ROOT/$common_dir" ;;
  esac
  if [ "$git_dir" != "$common_dir" ]; then
    main_repo=$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree / { print $2; exit }')
    if [ -n "${main_repo:-}" ]; then
      printf '%s\n' ""
      printf '%s\n' "This checkout is a git worktree. ./data is relative — run Docker from the main repo :"
      printf '  %s\n' "$main_repo"
    fi
  fi
fi

printf '%s\n' ""
printf '%s\n' ".env  (Compose auto-loads this for \${VAR} interpolation; optional)"
printf '  %s\n' "$ENV_FILE"
printf '  %s\n' "$(status_of "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  printf '  → %s\n' "cp .env.example .env"
fi

printf '%s\n' ""
printf '%s\n' ".env.example  (safe template, no secrets / modèle vide, sans clés)"
printf '  %s\n' "$EXAMPLE"
printf '  %s\n' "$(status_of "$EXAMPLE")"

printf '%s\n' ""
if [ -f "$COMPOSE" ] && grep -q '^[[:space:]]*env_file:' "$COMPOSE"; then
  printf '%s\n' "docker-compose.yml env_file:"
  grep -n '^[[:space:]]*env_file:' -A 8 "$COMPOSE" | sed 's/^/  /'
  printf '%s\n' "Resolved env_file path (relative to the compose project directory):"
  printf '  %s\n' "$ENV_FILE"
else
  printf '%s\n' "docker-compose.yml has no env_file: key."
  printf '%s\n' "Compose still auto-loads .env from the project directory if the file exists."
  printf '%s\n' "Pas de env_file: dans docker-compose.yml ; Compose charge .env tout seul s'il est là."
fi
