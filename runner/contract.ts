// Contrat de candidat (spec de l'étape 3, « candidate.json et son schéma ») :
// fonction pure qui prend le contenu du dossier du candidat et rend le contrat
// validé ou la liste des manquements. candidate.json est validé par le schéma
// publié lui-même, lu dans runner/schemas : une seule définition du contrat.
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

/** Contenu brut des fichiers du dossier du candidat ; `undefined` si le fichier est absent. */
export type CandidateFiles = {
  candidateJson: string | undefined;
  packageJson: string | undefined;
  packageLock: string | undefined;
};

export type CandidateContract = { contract: 1; build?: string; start: string };

export type ContractCheck = { ok: true; contract: CandidateContract } | { ok: false; failures: string[] };

/** Le registre public npm imposé par le banc pour la construction (ADR 0007). */
export const IMPOSED_REGISTRY = new URL("https://registry.npmjs.org/");

type SchemaProperty = { type?: string; const?: unknown; minLength?: number };
type CandidateSchema = { properties: Record<string, SchemaProperty> };

const schema = JSON.parse(
  readFileSync(new URL("./schemas/candidate-1.schema.json", import.meta.url), "utf8"),
) as CandidateSchema;
const validateCandidate = new Ajv2020({ allErrors: true, strict: true }).compile<CandidateContract>(schema);

const PORT_FIELDS = new Set(["url", "port"]);

export function checkContract(files: CandidateFiles): ContractCheck {
  const failures: string[] = [];

  const candidate = parseJsonFile("candidate.json", files.candidateJson, failures);
  let contract: CandidateContract | undefined;
  if (candidate !== undefined) {
    if (validateCandidate(candidate)) {
      const { $schema: _ignored, ...declared } = candidate as CandidateContract & { $schema?: string };
      contract = declared;
    } else {
      failures.push(...unique((validateCandidate.errors ?? []).map(candidateFailure)));
    }
  }

  const packageJson = parseJsonFile("package.json", files.packageJson, failures);
  if (packageJson !== undefined && !isObject(packageJson)) failures.push("package.json: must be an object");

  const lock = parseJsonFile("package-lock.json", files.packageLock, failures);
  if (lock !== undefined) failures.push(...lockFailures(lock));

  if (failures.length > 0 || contract === undefined) return { ok: false, failures };
  return { ok: true, contract };
}

function parseJsonFile(name: string, content: string | undefined, failures: string[]): unknown {
  if (content === undefined) {
    failures.push(`${name}: file is missing`);
    return undefined;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    failures.push(`${name}: invalid JSON (${(error as Error).message})`);
    return undefined;
  }
}

function candidateFailure(error: ErrorObject): string {
  if (error.keyword === "required") {
    return `candidate.json: field "${String(error.params["missingProperty"])}" is required`;
  }
  if (error.keyword === "additionalProperties") {
    const field = String(error.params["additionalProperty"]);
    if (PORT_FIELDS.has(field)) {
      return `candidate.json: field "${field}" is not allowed: the bench imposes the port, read it from the PORT variable`;
    }
    return `candidate.json: unknown field "${field}"`;
  }
  const field = fieldOf(error.instancePath);
  if (field === undefined) return "candidate.json: must be an object";
  const property = schema.properties[field];
  if (property?.const !== undefined) return `candidate.json: field "${field}" must be ${JSON.stringify(property.const)}`;
  if (property?.minLength !== undefined) return `candidate.json: field "${field}" must be a non-empty string`;
  return `candidate.json: field "${field}" must be a ${property?.type ?? "valid value"}`;
}

/** Nom du champ de premier niveau désigné par un pointeur JSON, ou `undefined` pour la racine. */
function fieldOf(instancePath: string): string | undefined {
  const [, first] = instancePath.split("/");
  return first === undefined ? undefined : first.replaceAll("~1", "/").replaceAll("~0", "~");
}

function lockFailures(lock: unknown): string[] {
  const packages = isObject(lock) ? lock["packages"] : undefined;
  if (!isObject(packages)) {
    return ['package-lock.json: no "packages" section, lockfileVersion 2 or 3 is required'];
  }
  const failures: string[] = [];
  for (const [location, entry] of Object.entries(packages)) {
    if (location === "") continue;
    if (!isInsideCandidate(location)) {
      failures.push(`package-lock.json: "${location}" is a local path outside the candidate: ${location}`);
      continue;
    }
    const resolved = isObject(entry) ? entry["resolved"] : undefined;
    if (typeof resolved !== "string") continue;
    const refusal = sourceRefusal(resolved);
    if (refusal !== undefined) failures.push(`package-lock.json: "${location}" ${refusal}: ${resolved}`);
  }
  return failures;
}

/** Raison du refus d'une source du package-lock.json, ou `undefined` si elle est acceptée. */
function sourceRefusal(resolved: string): string | undefined {
  if (/^(git\+|git:)/.test(resolved) || /^(github|gitlab|bitbucket|gist):/.test(resolved)) {
    return "is a Git repository";
  }
  if (resolved.startsWith("file:")) {
    return isInsideCandidate(resolved.slice("file:".length)) ? undefined : "is a local path outside the candidate";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(resolved)) {
    const url = new URL(resolved);
    if (url.protocol === IMPOSED_REGISTRY.protocol && url.host === IMPOSED_REGISTRY.host) return undefined;
    return isRegistryTarball(url.pathname) ? "is resolved on another host" : "is a remote archive";
  }
  if (/^[a-z][a-z0-9+.-]+:/i.test(resolved)) return "has an unknown source";
  return isInsideCandidate(resolved) ? undefined : "is a local path outside the candidate";
}

/** Chemin d'une archive servie par un registre npm : `/<paquet>/-/<fichier>.tgz`, paquet à portée compris. */
function isRegistryTarball(pathname: string): boolean {
  return /^\/(@[^/]+\/)?[^/]+\/-\/[^/]+\.tgz$/.test(pathname);
}

/** Un chemin local, relatif à la racine du candidat, qui ne sort pas du candidat. */
function isInsideCandidate(path: string): boolean {
  if (path.startsWith("/") || path.startsWith("\\") || /^[a-z]:/i.test(path)) return false;
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  return normalized !== ".." && !normalized.startsWith("../");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
