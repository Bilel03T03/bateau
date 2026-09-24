// Accès aux capacités de la page claude.ai (window.claude.use). Sur GitHub
// Pages ou en local, window.claude n'existe pas : tout retombe sur null et
// l'application utilise le stockage du navigateur.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DbSnapshotDoc {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface DbQuerySnapshot {
  docs: DbSnapshotDoc[];
  docChanges(): { type: "added" | "modified" | "removed"; doc: DbSnapshotDoc }[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface DbDocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface DbCollectionRef {
  doc(id: string): DbDocRef;
  onSnapshot(next: (s: DbQuerySnapshot) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
export interface ClaudeDb {
  collection(path: string): DbCollectionRef;
}
export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown;
}
export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  images?: Blob | Blob[];
  modelTier?: "default" | "complex" | "quick";
  cache?: boolean;
}
export interface ClaudeSample {
  (input: string | { role: "user" | "assistant"; content: string }[], opts?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string | { role: "user" | "assistant"; content: string }[], opts?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] }; tools?: { maxCount: number } }>;
}
export interface ClaudeUser {
  me(): Promise<{ id: string | null; isOwner: boolean }>;
}
export interface ClaudeDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}

interface CapabilityMap {
  db: ClaudeDb;
  sample: ClaudeSample;
  user: ClaudeUser;
  downloads: ClaudeDownloads;
}

function host(): { use(name: string): Promise<any> } | null {
  const c = (window as any).claude;
  return c && typeof c.use === "function" ? c : null;
}

/** Vrai quand la page tourne dans claude.ai (ou l'app Claude). */
export function inClaude(): boolean {
  return host() !== null;
}

const cache = new Map<string, Promise<any>>();

export function getCapability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  const h = host();
  if (!h) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, h.use(name).catch(() => null));
  return cache.get(name)!;
}
