#!/usr/bin/env bash
# Contrôle de CI (#22) : chaque `uses:` des workflows est épinglé sur un SHA
# de commit complet, suivi de sa version en commentaire.
set -euo pipefail

dir="${1:-.github/workflows}"
uses='^[[:space:]]*(-[[:space:]]+)?uses:'
pinned="${uses}[[:space:]]+[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40} # v[0-9]+\.[0-9]+\.[0-9]+[[:space:]]*\$"
status=0
found=0

for file in "$dir"/*.yml "$dir"/*.yaml; do
  [ -e "$file" ] || continue
  found=1
  while IFS=: read -r line content; do
    printf '%s\n' "$content" | grep -qE "$pinned" && continue
    echo "::error file=${file},line=${line}::Action non épinglée par SHA : ${content}. Attendu : owner/repo@<SHA de 40 caractères> # vX.Y.Z (procédure : docs/agents/pinned-actions.md)."
    status=1
  done < <(grep -nE "$uses" "$file" || true)
done

# Un chemin qui a dérivé ne doit pas faire passer le contrôle sans rien lire.
if [ "$found" -eq 0 ]; then
  echo "::error::Aucun workflow trouvé dans ${dir}"
  exit 1
fi

exit "$status"
