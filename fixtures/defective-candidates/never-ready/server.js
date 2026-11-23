// Candidat défectueux 4, « jamais disponible » (spec de l'étape 3,
// « Candidats défectueux ») : une copie du candidat de référence avec un seul
// défaut, son processus tourne mais n'écoute jamais sur PORT. Issue attendue :
// `start-not-ready`, échec du candidat, oracle non lancé, code 0.
setInterval(() => {}, 60_000);
