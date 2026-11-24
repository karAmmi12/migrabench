// Interruption d'une mesure (spec de l'étape 3, règle `interrupted`, #71) :
// SIGINT (Ctrl+C) ou SIGTERM (dont l'annulation d'un job de CI), quelle que
// soit la phase. Tant que la mesure guette, ces signaux n'arrêtent plus le
// processus : le runner range l'interruption dans la mesure, écrit
// measure.json et libère le verrou du banc. Seul le premier signal compte ;
// les suivants (npm relaie aussi Ctrl+C) sont ignorés jusqu'à la fin de la
// mesure. Pour arrêter le runner sans attendre : SIGKILL, qui laisse un
// verrou du banc orphelin, repris par le prochain outil du banc.
export const INTERRUPTION_SIGNALS = ["SIGINT", "SIGTERM"] as const satisfies readonly NodeJS.Signals[];

export interface Interruption {
  // Résolue au premier signal reçu.
  received: Promise<NodeJS.Signals>;
  // Le premier signal reçu, ou `undefined`.
  signal: () => NodeJS.Signals | undefined;
  // Rend aux signaux leur effet par défaut.
  dispose: () => void;
}

export function watchInterruption(): Interruption {
  let signal: NodeJS.Signals | undefined;
  let notify: (signal: NodeJS.Signals) => void = () => undefined;
  const received = new Promise<NodeJS.Signals>((resolve) => (notify = resolve));
  const handler = (name: NodeJS.Signals) => {
    if (signal !== undefined) return;
    signal = name;
    notify(name);
  };
  for (const name of INTERRUPTION_SIGNALS) process.on(name, handler);
  return {
    received,
    signal: () => signal,
    dispose: () => {
      for (const name of INTERRUPTION_SIGNALS) process.off(name, handler);
    },
  };
}

// Preuve de l'interruption, détail de la phase interrompue.
export function interruptionDetail(signal: NodeJS.Signals): string {
  return `Interrupted by ${signal}`;
}
