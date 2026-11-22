#!/bin/sh
# Hook SessionStart (#52) : chaque commande Bash de la session tourne sous le
# Node de .nvmrc. Le hook écrit dans $CLAUDE_ENV_FILE le chargement de nvm et
# `nvm use`, que Claude Code rejoue avant chaque commande. Sans nvm, ou hors de
# Claude Code, il ne fait rien et sort en 0 : l'ouverture de session n'échoue pas.
[ -n "$CLAUDE_ENV_FILE" ] || exit 0
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -s "$project_dir/.nvmrc" ] || exit 0
nvm_dir="${NVM_DIR:-$HOME/.nvm}"
[ -s "$nvm_dir/nvm.sh" ] || exit 0
version="$(tr -d '[:space:]' < "$project_dir/.nvmrc")"
cat >> "$CLAUDE_ENV_FILE" <<ENV
export NVM_DIR="$nvm_dir"
. "\$NVM_DIR/nvm.sh" --no-use
nvm use --silent "$version" >/dev/null 2>&1 || true
ENV
exit 0
