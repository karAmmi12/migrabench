// Navigateur du banc injoignable (#168) : une connexion du banc à son
// navigateur, par la passerelle du serveur de Playwright ou par la passerelle
// CDP du service `browser`, qui n'aboutit pas (refus de la passerelle, jeton
// faux, service arrêté). Depuis #160, le candidat ne joint pas ce navigateur :
// c'est une panne du banc, et la mesure est invalide (règle 7), avec la cause
// `bench-browser-unreachable`.
//
// Seule la connexion est visée. Un navigateur qui se ferme pendant qu'il
// affiche une page du candidat reste au compte du candidat : la page tourne
// dans ce navigateur.

// Le message ne porte jamais le jeton : l'appelant le retire. `log` : le brut
// du banc qui prouve la panne, s'il y en a un (échecs écrits par la fixture
// des scénarios de l'oracle).
export class BenchBrowserUnreachable extends Error {
  readonly log: string | undefined;
  constructor(message: string, log?: string) {
    super(message);
    this.name = "BenchBrowserUnreachable";
    this.log = log;
  }
}
