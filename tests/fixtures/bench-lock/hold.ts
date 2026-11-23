// Détenteur réel du verrou du banc pour les tests du Seam 3 :
// `node hold.ts <fichier> <outil> [identifiant de la mesure]` prend le verrou
// du banc, écrit « held » sur sa sortie standard, puis le garde jusqu'à ce que
// son entrée standard se ferme, et le libère.
import { acquireBenchLock, type BenchTool } from "../../../shared/bench-lock.ts";

const [file, tool, measureId] = process.argv.slice(2);
if (file === undefined || tool === undefined) throw new Error("Usage: node hold.ts <file> <tool> [measureId]");
const lock = acquireBenchLock({ file, tool: tool as BenchTool, ...(measureId === undefined ? {} : { measureId }) });
if (!lock.ok) {
  console.error(lock.message);
  process.exit(4);
}
console.log("held");
process.stdin.resume();
process.stdin.on("end", () => lock.release());
