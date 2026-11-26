#!/usr/bin/env bash
# Dépôt Maven de la construction du legacy, gardé en CI d'une exécution à
# l'autre (#149). Le Dockerfile du legacy monte ce dépôt en cache de BuildKit
# (id ci-dessous) ; ce script le verse dans ce cache ou l'en extrait, par une
# construction jetable sur la même image Maven.
#
#   scripts/maven-cache.sh import <dossier>  verse <dossier> dans le cache
#   scripts/maven-cache.sh export <dossier>  copie le cache dans <dossier>
set -euo pipefail

cache_id=migrabench-maven-repository
dockerfile="$(dirname "$0")/../fixtures/legacy-app/Dockerfile"

usage() {
  echo "usage: $0 import|export <directory>" >&2
  exit 2
}
[ $# -eq 2 ] || usage
mode=$1
dir=$2

# Image Maven du stage de build du legacy : déjà tirée pour la construction.
image="$(sed -n 's/^FROM \(maven:[^ ]*\) AS build$/\1/p' "$dockerfile")"
if [ -z "$image" ]; then
  echo "No 'FROM maven:… AS build' stage in $dockerfile" >&2
  exit 1
fi
grep -q "id=$cache_id," "$dockerfile" || {
  echo "$dockerfile does not mount the cache $cache_id" >&2
  exit 1
}
mount="type=cache,id=$cache_id,target=/cache,sharing=locked"
# Jamais --no-cache : BuildKit monterait alors un cache vide à la place de
# celui-ci. Une valeur unique force la copie à chaque appel.
run="run-$$-$RANDOM-$(date +%s)"

case "$mode" in
  import)
    [ -d "$dir" ] || { echo "No directory $dir" >&2; exit 1; }
    # Le dossier est le contexte : monté en lecture, copié dans le cache.
    docker buildx build --build-arg "RUN=$run" --output type=cacheonly -f - "$dir" <<DOCKERFILE
FROM $image
ARG RUN
RUN --mount=$mount --mount=type=bind,target=/seed cp -a /seed/. /cache/
DOCKERFILE
    ;;
  export)
    mkdir -p "$dir"
    context="$(mktemp -d)"
    trap 'rm -rf "$context"' EXIT
    docker buildx build --build-arg "RUN=$run" --output "type=local,dest=$dir" -f - "$context" <<DOCKERFILE
FROM $image AS copy
ARG RUN
RUN --mount=$mount mkdir /export && cp -a /cache/. /export/
FROM scratch
COPY --from=copy /export /
DOCKERFILE
    ;;
  *)
    usage
    ;;
esac
