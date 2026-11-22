#!/bin/sh
# Hook SessionStart (#52) : chaque commande Bash de la session tourne sous le
# Node de .nvmrc. Le hook écrit dans $CLAUDE_ENV_FILE, que Claude Code rejoue
# avant chaque commande, un ajout direct au PATH du dossier de ce Node installé
# par nvm. Il ne charge pas nvm : charger nvm.sh coûtait environ 218 ms par
# commande. Dossier absent : rien n'est écrit, et un avertissement s'affiche
# (systemMessage). Hors de Claude Code ou sans .nvmrc, il ne fait rien. Il sort
# toujours en 0 : l'ouverture de session n'échoue pas.
[ -n "$CLAUDE_ENV_FILE" ] || exit 0
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -s "$project_dir/.nvmrc" ] || exit 0
version="$(tr -d '[:space:]' < "$project_dir/.nvmrc")"
version="${version#v}"
node_bin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$version/bin"

if [ -d "$node_bin" ]; then
  # Chemin développé maintenant ; $PATH, lui, l'est à chaque commande.
  printf 'export PATH="%s:$PATH"\n' "$node_bin" >> "$CLAUDE_ENV_FILE"
else
  message="Node $version (.nvmrc) is not installed in $node_bin: Bash commands keep the shell's Node. Run nvm install $version."
  escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"systemMessage": "%s"}\n' "$escaped"
fi
exit 0
