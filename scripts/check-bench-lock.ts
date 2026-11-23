// Garde de `npm test` (script pretest), après celle de la version de Node :
// les tests du Seam A écrivent sur la pile, ils refusent de tourner pendant
// qu'un outil du banc tient le verrou du banc. Le contrôle ne prend pas le
// verrou du banc. Un verrou du banc orphelin ne bloque pas : le prochain outil
// du banc le reprendra.
import { heldMessage, inspectBenchLock } from "../shared/bench-lock.ts";

const lock = inspectBenchLock();
if (lock.state === "held") {
  console.error(`npm test refused: ${heldMessage(lock.holder)}.\nWait for it to end, or stop it, then run \`npm test\` again.`);
  process.exit(4);
}
