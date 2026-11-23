// Candidat défectueux 2, « construction en échec » (spec de l'étape 3,
// « Candidats défectueux ») : une copie du candidat de référence avec un seul
// défaut, sa commande de construction sort avec un code non nul. Issue
// attendue : `build-failed`, échec du candidat, code 0.
console.error("build: deliberate failure of defective candidate 2");
process.exit(2);
