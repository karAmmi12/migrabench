// Interruption d'une mesure (spec de l'étape 3, règle `interrupted`, #71) :
// SIGINT (Ctrl+C) ou SIGTERM (dont l'annulation d'un job de CI), quelle que
// soit la phase. Tant que la mesure guette, ces signaux n'arrêtent plus le
// processus : le runner range l'interruption dans la mesure, écrit
// measure.json et libère le verrou du banc. Pour arrêter le runner sans
// attendre : SIGKILL, qui ne laisse aucune mesure et un verrou du banc
// orphelin, repris par le prochain outil du banc.
//
// Échéance. À l'annulation d'un job, GitHub Actions envoie SIGINT au
// processus d'entrée de l'étape, puis SIGTERM 7 500 ms plus tard s'il n'est
// pas sorti, puis tue l'arbre de processus 2 500 ms après (« Workflow
// cancellation reference »,
// https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation) :
// « If the process doesn't exit within 7500 ms, the runner will send
// SIGTERM/Ctrl-Break to the process, then wait for 2500 ms for the process
// to exit. If the process is still running, the runner kills the process
// tree. » measure.json doit donc être écrit avant le SIGTERM de GitHub :
// au plus 5 000 ms après le premier signal, 2 500 ms de marge. Un second
// signal, SIGINT ou SIGTERM (le SIGTERM de GitHub, un second Ctrl+C), abrège
// tout : measure.json est écrit aussitôt. Sous `npm run`, un seul Ctrl+C
// arrive deux fois, du terminal et du relais de npm (#94) : le même signal
// reçu moins d'une seconde après le premier n'est pas un second signal.
const INTERRUPTION_SIGNALS = ["SIGINT", "SIGTERM"] as const satisfies readonly NodeJS.Signals[];

// Délai entre le premier signal et l'écriture de measure.json, au plus.
const MEASURE_WRITTEN_WITHIN_MS = 5_000;
// Le même signal reçu dans ce délai est le doublon du premier.
const DUPLICATE_WITHIN_MS = 1_000;

export interface Interruption {
  // Résolue au premier signal reçu.
  received: Promise<NodeJS.Signals>;
  // Le premier signal reçu, ou `undefined`.
  signal: () => NodeJS.Signals | undefined;
  // Résolue, avec sa raison, quand il faut écrire measure.json sans attendre :
  // au second signal, ou à l'échéance comptée depuis le premier.
  cutShort: Promise<string>;
  // Rend aux signaux leur effet par défaut.
  dispose: () => void;
}

export function watchInterruption(writtenWithinMs: number = MEASURE_WRITTEN_WITHIN_MS): Interruption {
  let signal: NodeJS.Signals | undefined;
  let receivedAt = 0;
  let notify: (signal: NodeJS.Signals) => void = () => undefined;
  let cut: (reason: string) => void = () => undefined;
  let deadline: NodeJS.Timeout | undefined;
  const received = new Promise<NodeJS.Signals>((resolve) => (notify = resolve));
  const cutShort = new Promise<string>((resolve) => (cut = resolve));
  const handler = (name: NodeJS.Signals) => {
    if (signal !== undefined) {
      if (name === signal && Date.now() - receivedAt < DUPLICATE_WITHIN_MS) return;
      return cut(`Cut short by a second signal, ${name}`);
    }
    signal = name;
    receivedAt = Date.now();
    notify(name);
    deadline = setTimeout(() => cut(`Cut short: measure.json is due ${writtenWithinMs} ms after the signal`), writtenWithinMs);
  };
  for (const name of INTERRUPTION_SIGNALS) process.on(name, handler);
  return {
    received,
    signal: () => signal,
    cutShort,
    dispose: () => {
      clearTimeout(deadline);
      for (const name of INTERRUPTION_SIGNALS) process.off(name, handler);
    },
  };
}

// Preuve de l'interruption, détail de la phase interrompue.
export function interruptionDetail(signal: NodeJS.Signals): string {
  return `Interrupted by ${signal}`;
}
