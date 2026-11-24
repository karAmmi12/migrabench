// Phase de construction (spec de l'étape 3, « Phases d'une mesure et leurs
// issues », règle `registry-network-error`) : seule une erreur réseau sur une
// requête précise vers le registre imposé, prouvée par le journal de npm, rend
// la mesure invalide. Les journaux ci-dessous sont des extraits de journaux
// réels de `npm ci` (npm 10.9.9, image d'exécution du banc de `790506a`,
// sha256:0894512c1c3b5da3843b245b892bbab77dcbfed889ed55d60273008ec166461b),
// relevés le 23/11/2026 dans la session de #65 ; ceux du 503 et de la connexion coupée viennent d'un serveur local
// dont l'adresse a été remplacée par celle du registre imposé.
import { describe, expect, it } from "vitest";
import { buildStepOutcome, registryNetworkError } from "../../runner/build-outcome.ts";

const REGISTRY = "https://registry.npmjs.org/";

const CONNECTION_REFUSED = `18 http fetch GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz attempt 1 failed with ECONNREFUSED
24 verbose stack FetchError: request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: connect ECONNREFUSED 127.0.0.1:443
25 error code ECONNREFUSED
26 error syscall connect
27 error errno ECONNREFUSED
28 error FetchError: request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: connect ECONNREFUSED 127.0.0.1:443
28 error     at ClientRequest.<anonymous> (/usr/local/lib/node_modules/npm/node_modules/minipass-fetch/lib/index.js:130:14)
37 verbose exit 1
38 verbose code 1
`;

const DNS = `18 http fetch GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz attempt 1 failed with EAI_AGAIN
25 error code EAI_AGAIN
26 error syscall getaddrinfo
27 error errno EAI_AGAIN
28 error request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org
36 verbose exit 1
`;

const CONNECTION_RESET = `17 http fetch GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz attempt 1 failed with ECONNRESET
21 verbose stack FetchError: request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: socket hang up
22 error code ECONNRESET
23 error errno ECONNRESET
24 error network request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: socket hang up
25 error network This is a problem related to network connectivity.
`;

const SERVICE_UNAVAILABLE = `17 http fetch GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz attempt 1 failed with 503
20 http fetch GET 503 https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz 70046ms attempt #3 (cache skip)
21 verbose stack HttpErrorGeneral: 503 Service Unavailable - GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz
24 error code E503
25 error 503 Service Unavailable - GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz
`;

const NOT_FOUND = `18 http fetch GET 404 https://registry.npmjs.org/is-number/-/is-number-7.0.99.tgz 233ms (cache skip)
22 error code E404
23 error 404 Not Found - GET https://registry.npmjs.org/is-number/-/is-number-7.0.99.tgz - Not found
`;

// Un script d'installation qui échoue en imprimant une fausse erreur du
// registre : npm la reprend sous ses propres lignes `error`, avec le code du script.
const SCRIPT_IMITATING_REGISTRY = `40 error code 1
41 error path /candidate
42 error command failed
43 error command sh -c node install.js
44 error request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: connect ECONNREFUSED 127.0.0.1:443
`;

describe("registryNetworkError", () => {
  it("ignores a network error towards another host than the imposed registry", () => {
    expect(registryNetworkError(CONNECTION_REFUSED.replaceAll("https://registry.npmjs.org/", "https://registry.example.test/"), REGISTRY)).toBeUndefined();
    expect(registryNetworkError(CONNECTION_REFUSED.replaceAll("https://registry.npmjs.org/", "https://registry.npmjs.org.example.test/"), REGISTRY)).toBeUndefined();
  });

  it("ignores any other npm error: 404, network timeout, failed script", () => {
    expect(registryNetworkError(NOT_FOUND, REGISTRY)).toBeUndefined();
    expect(registryNetworkError(CONNECTION_REFUSED.replaceAll("ECONNREFUSED", "ETIMEDOUT"), REGISTRY)).toBeUndefined();
    expect(registryNetworkError(SCRIPT_IMITATING_REGISTRY, REGISTRY)).toBeUndefined();
    expect(registryNetworkError("", REGISTRY)).toBeUndefined();
  });

  it("recognises a DNS failure, a cut connection and a 5xx of the imposed registry", () => {
    expect(registryNetworkError(DNS, REGISTRY)).toBe(
      "28 error request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org",
    );
    expect(registryNetworkError(CONNECTION_RESET, REGISTRY)).toBe(
      "24 error network request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: socket hang up",
    );
    expect(registryNetworkError(SERVICE_UNAVAILABLE, REGISTRY)).toBe(
      "25 error 503 Service Unavailable - GET https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
    );
  });

  it("returns the npm log line of a connection refused by the imposed registry", () => {
    expect(registryNetworkError(CONNECTION_REFUSED, REGISTRY)).toBe(
      "28 error FetchError: request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: connect ECONNREFUSED 127.0.0.1:443",
    );
  });
});

// Étapes de la construction : `fetch` (npm ci sans scripts, seul accès réseau,
// aucun code du candidat), `install` (npm ci hors ligne, scripts actifs) et
// `build` (commande déclarée).
describe("buildStepOutcome", () => {
  const finished = { exitCode: 0, started: true, timedOut: false, oomKilled: false, npmLog: "", log: "" };

  it("is ok when the step exits with code 0", () => {
    expect(buildStepOutcome({ step: "build", ...finished }, REGISTRY)).toEqual({ outcome: "ok" });
  });

  it("is a build-failed candidate failure when the build command exits with a non-zero code", () => {
    expect(buildStepOutcome({ step: "build", ...finished, exitCode: 2 }, REGISTRY)).toEqual({
      outcome: "build-failed",
      detail: "build exited with code 2",
    });
  });

  it("is a registry-network-error, with the npm log line as evidence, only when the fetch step fails on the imposed registry", () => {
    expect(buildStepOutcome({ step: "fetch", ...finished, exitCode: 1, npmLog: DNS }, REGISTRY)).toEqual({
      outcome: "registry-network-error",
      detail: "28 error request to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org",
    });
    expect(buildStepOutcome({ step: "fetch", ...finished, exitCode: 1, npmLog: NOT_FOUND }, REGISTRY)).toEqual({
      outcome: "build-failed",
      detail: "fetch exited with code 1",
    });
  });

  it("is never invalid once the candidate's code may have run: install scripts and build", () => {
    expect(buildStepOutcome({ step: "install", ...finished, exitCode: 1, npmLog: DNS }, REGISTRY).outcome).toBe("build-failed");
    expect(buildStepOutcome({ step: "build", ...finished, exitCode: 1, npmLog: DNS }, REGISTRY).outcome).toBe("build-failed");
  });

  it("is a build-timeout when the global build timeout runs out, whatever the npm log says", () => {
    expect(buildStepOutcome({ step: "fetch", ...finished, exitCode: 137, timedOut: true, npmLog: DNS }, REGISTRY)).toEqual({
      outcome: "build-timeout",
      detail: "fetch was stopped: the global build timeout ran out",
    });
  });

  it("is a build-resource-limit when the memory limit killed the step", () => {
    expect(buildStepOutcome({ step: "install", ...finished, exitCode: 137, oomKilled: true }, REGISTRY)).toEqual({
      outcome: "build-resource-limit",
      detail: "install was killed: memory limit reached",
    });
  });

  // #68 : un code 125 de `docker run` est une erreur de Docker lui-même (image
  // absente, démon injoignable) si le conteneur n'a jamais démarré. Le code
  // seul ne suffit pas : la commande `build` du candidat peut rendre 125.
  const DOCKER_ERROR = "docker: Error response from daemon: No such image: migrabench-runtime:latest.\n";

  it("is a runner error before the candidate when Docker never started the fetch container: npm ci was not launched", () => {
    expect(buildStepOutcome({ step: "fetch", ...finished, exitCode: 125, started: false, log: DOCKER_ERROR }, REGISTRY)).toEqual({
      outcome: "runner-error-before-candidate",
      detail: `Docker did not start the fetch container (docker run exited with code 125): ${DOCKER_ERROR.trim()}`,
    });
  });

  it("is a stack failure while the candidate runs when Docker never started a later container: npm ci was launched", () => {
    expect(buildStepOutcome({ step: "install", ...finished, exitCode: 125, started: false, log: DOCKER_ERROR }, REGISTRY)).toEqual({
      outcome: "stack-down-while-candidate",
      detail: `Docker did not start the install container (docker run exited with code 125): ${DOCKER_ERROR.trim()}`,
    });
    expect(buildStepOutcome({ step: "build", ...finished, exitCode: 125, started: false, log: DOCKER_ERROR }, REGISTRY).outcome).toBe("stack-down-while-candidate");
  });

  it("is a build-failed candidate failure when the build command itself exits with code 125 in a started container", () => {
    expect(buildStepOutcome({ step: "build", ...finished, exitCode: 125 }, REGISTRY)).toEqual({
      outcome: "build-failed",
      detail: "build exited with code 125",
    });
  });
});
