// Utilisateur des conteneurs du candidat, construction et démarrage (ADR 0007) :
// l'uid et le gid de l'utilisateur qui lance le runner, jamais root, et non
// l'utilisateur `node` (1000) de l'image d'exécution.
//
// Sous Linux (la CI), un dossier monté garde les propriétaires numériques de
// l'hôte. La copie du candidat appartient à l'utilisateur du runner : sous un
// autre uid, `npm ci` ne pourrait pas y écrire node_modules sans ouvrir la
// copie en écriture à tous, et l'hôte ne pourrait plus supprimer ce que le
// conteneur y aurait créé. Le même uid sert au démarrage, pour lire la copie.
// Sous macOS, Docker Desktop masque les propriétaires : l'uid n'y change rien.
// L'uid et le gid sont enregistrés dans `environment.containerUser`.

export interface ContainerUser {
  uid: number;
  gid: number;
}

export function containerUser(uid: number | undefined, gid: number | undefined): ContainerUser {
  if (uid === undefined || gid === undefined) throw new Error("A measure needs the uid and gid of the user who runs it");
  if (uid === 0) throw new Error("A measure must not run as root: the candidate containers would run as root");
  return { uid, gid };
}

// Forme `uid:gid` de `docker run --user` et de la clé `user` de Docker Compose.
export function dockerUser({ uid, gid }: ContainerUser): string {
  return `${uid}:${gid}`;
}
