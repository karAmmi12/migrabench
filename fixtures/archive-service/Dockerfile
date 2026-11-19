# Contexte de build : racine du dépôt (voir docker-compose.yml).
# Service d'archivage simulé : Node 22, sans dépendance.
FROM node:22.23.5-alpine
WORKDIR /app
COPY fixtures/archive-service/server.ts server.ts
USER node
EXPOSE 8090
CMD ["node", "--experimental-strip-types", "server.ts"]
