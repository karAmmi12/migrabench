// Référence d'archivage attendue sur l'accusé de remise (spec de l'étape 2,
// « Référence d'archivage et sel ») : HMAC-SHA256 du numéro du dossier, avec
// le sel pris comme texte pour clé, 12 premiers caractères hexadécimaux en
// majuscules. Calcul de l'oracle, écrit à part de celui du service d'archivage.
import { createHmac } from "node:crypto";

export function archiveReference(salt: string, number: string): string {
  return createHmac("sha256", salt).update(number).digest("hex").slice(0, 12).toUpperCase();
}
