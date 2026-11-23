// Candidat défectueux 3, « construction trop longue » (spec de l'étape 3,
// « Candidats défectueux ») : une copie du candidat de référence avec un seul
// défaut, sa commande de construction ne termine jamais. Issue attendue :
// `build-timeout`, échec du candidat, jamais invalide, code 0.
setInterval(() => {}, 60_000);
