# Image de l'agent qui produit un candidat d'essai (ADR 0010, procédure dans
# docs/candidat-essai.md). Construite et lancée par scripts/trial-agent.ts, qui
# ne monte dans le conteneur que le répertoire de travail de l'agent, sous
# /work.
#
# Claude Code installé par npm à une version fixe, sans mise à jour
# automatique (documentation de Claude Code, page devcontainer : « install it
# from your Dockerfile with npm install -g @anthropic-ai/claude-code@X.Y.Z [...]
# and set DISABLE_AUTOUPDATER to 1 »). L'utilisateur est `node`, pas root :
# Claude Code refuse le mode bypassPermissions sous root.
FROM node:22.23.5-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

# Configuration de Claude Code vierge, propre au conteneur : rien n'est monté
# à cet endroit, et chaque lancement part d'un conteneur neuf.
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global \
    PATH=/home/node/.npm-global/bin:$PATH \
    DISABLE_AUTOUPDATER=1 \
    CLAUDE_CONFIG_DIR=/home/node/.config/claude

USER node
RUN npm install -g @anthropic-ai/claude-code@2.1.332 && mkdir -p /home/node/.config/claude

WORKDIR /work
