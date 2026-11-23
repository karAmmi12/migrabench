# Image d'exécution du banc (ADR 0007) : la même pour tous les candidats,
# construite par `migrabench measure`, jamais fournie par le candidat.
# Node 22, image de base épinglée par empreinte (node:22.23.5-alpine), même
# version que .nvmrc. Le runner lance chaque conteneur sous l'uid et le gid
# de l'utilisateur qui le lance, jamais root (ADR 0007, runner/container-user.ts) ;
# USER node reste le défaut de l'image hors du runner.
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
USER node
WORKDIR /candidate
