// Mesure de `defaultPrevented` d'un raccourci (spec de l'étape 2, « Exécution »).
import type { Frame, Page } from "@playwright/test";

// `defaultPrevented` d'un raccourci : écouteur keydown en capture sur window,
// lu une fois la propagation terminée (tâche suivante), et remonté à Node par
// une fonction exposée. La lecture survit à un envoi de formulaire, qui ne
// quitte la page qu'à l'arrivée de la réponse. Si la page est quittée avant
// la lecture, la mesure échoue en le disant : la navigation du cadre principal
// est guettée côté Node, car la page qui part ne peut plus rien remonter.
let nextBindingId = 0;
const READ_TIMEOUT_MS = 5_000;

export async function pressAndReadDefaultPrevented(page: Page, keys: string): Promise<boolean> {
  const binding = `__mbDefaultPrevented${nextBindingId++}`;
  let settle: { resolve: (prevented: boolean) => void; reject: (error: Error) => void } | undefined;
  const read = new Promise<boolean>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // Un rejet peut arriver pendant que la frappe est en cours, avant `await read` :
  // il est marqué comme géré ici, et relevé par `await read`.
  read.catch(() => {});
  const onNavigated = (frame: Frame): void => {
    if (frame !== page.mainFrame()) return;
    settle?.reject(new Error(`Page left before defaultPrevented of ${keys} was read (navigated to ${frame.url()})`));
  };
  const timer = setTimeout(() => {
    settle?.reject(new Error(`No keydown read after ${keys} within ${READ_TIMEOUT_MS} ms`));
  }, READ_TIMEOUT_MS);
  page.on("framenavigated", onNavigated);
  try {
    await page.exposeFunction(binding, (prevented: boolean) => settle?.resolve(prevented));
    // Le keydown lu est celui de la touche finale : ceux des touches de
    // modification (Control pour Control+s) le précèdent et sont ignorés.
    await page.evaluate((name) => {
      const modifiers = ["Control", "Shift", "Alt", "Meta", "AltGraph"];
      const listener = (event: KeyboardEvent): void => {
        if (modifiers.includes(event.key)) return;
        window.removeEventListener("keydown", listener, { capture: true });
        setTimeout(() => {
          (window as unknown as Record<string, (prevented: boolean) => void>)[name]?.(event.defaultPrevented);
        }, 0);
      };
      window.addEventListener("keydown", listener, { capture: true });
    }, binding);
    await page.keyboard.press(keys);
    return await read;
  } finally {
    page.off("framenavigated", onNavigated);
    clearTimeout(timer);
  }
}
