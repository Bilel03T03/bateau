// Sauvegarde des données.
// - Web app (GitHub Pages, local) : stockage du navigateur (localStorage).
// - Page claude.ai : base de données de l'artifact, dans ton espace privé
//   (data/users/<ton id>/…), donc synchronisée entre ordinateur et téléphone.
//   Les données sont découpées par collection et par mois pour rester petites.

import { getCapability, inClaude, type ClaudeDb } from "../lib/claude";
import type { AppData, CollectionName } from "../lib/types";

const LOCAL_KEY = "cap:data:v1";

export type SyncMode = "local" | "claude";

export interface RemoteChange {
  /** Documents modifiés ailleurs (autre appareil) : id → contenu, ou null si supprimé. */
  docs: Record<string, Record<string, unknown> | null>;
}

export interface Persistence {
  mode: SyncMode;
  /** null = aucune donnée (premier lancement) ; "unavailable" = impossible de lire (ne rien écraser). */
  load(): Promise<AppData | null | "unavailable">;
  save(data: AppData): void;
  flush(): Promise<void>;
  subscribe(cb: (change: RemoteChange) => void): void;
}

// ---------- Découpage en documents ----------

const MONTHLY: Partial<Record<CollectionName, (item: any) => string | undefined>> = {
  events: (e) => e.date,
  sleep: (s) => s.date,
  meals: (m) => m.date,
  tasks: (t) => t.createdAt,
  reviews: (r) => r.weekStart,
};

export const COLLECTIONS: CollectionName[] = [
  "places",
  "routes",
  "subjects",
  "recurring",
  "events",
  "tasks",
  "exams",
  "sleep",
  "meals",
  "goals",
  "reminders",
  "reviews",
];

export function shardOf(col: CollectionName, item: unknown): string {
  const f = MONTHLY[col];
  const date = f?.(item);
  return typeof date === "string" && /^\d{4}-\d{2}/.test(date) ? `${col}.${date.slice(0, 7)}` : `${col}.all`;
}

export function toDocs(data: AppData): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = { settings: { settings: data.settings, version: data.version } };
  for (const col of COLLECTIONS) {
    for (const [id, item] of Object.entries(data[col])) {
      const key = shardOf(col, item);
      const doc = (docs[key] ??= { items: {} as Record<string, unknown> });
      (doc.items as Record<string, unknown>)[id] = item;
    }
  }
  return docs;
}

/** Applique des documents (complets ou modifiés) sur des données existantes. */
export function applyDocs(base: AppData, docs: Record<string, Record<string, unknown> | null>): AppData {
  const next: AppData = { ...base };
  for (const [docId, doc] of Object.entries(docs)) {
    if (docId === "settings") {
      if (doc?.settings) next.settings = doc.settings as AppData["settings"];
      continue;
    }
    const col = docId.split(".")[0] as CollectionName;
    if (!COLLECTIONS.includes(col)) continue;
    const kept = Object.fromEntries(Object.entries(next[col]).filter(([, item]) => shardOf(col, item) !== docId));
    const incoming = (doc?.items ?? {}) as Record<string, unknown>;
    (next as any)[col] = { ...kept, ...incoming };
  }
  return next;
}

// ---------- Stockage local ----------

function localPersistence(): Persistence {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AppData | undefined;
  const write = () => {
    if (!pending) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(pending));
    } catch {
      /* stockage indisponible (navigation privée) : l'app fonctionne quand même */
    }
    pending = undefined;
  };
  return {
    mode: "local",
    async load() {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? (JSON.parse(raw) as AppData) : null;
      } catch {
        return null;
      }
    },
    save(data) {
      pending = data;
      clearTimeout(timer);
      timer = setTimeout(write, 250);
    },
    async flush() {
      clearTimeout(timer);
      write();
    },
    subscribe(cb) {
      // Un autre onglet a modifié les données.
      window.addEventListener("storage", (e) => {
        if (e.key !== LOCAL_KEY || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue) as AppData;
          cb({ docs: toDocs(data) });
        } catch {
          /* ignoré */
        }
      });
    },
  };
}

// ---------- Base claude.ai ----------

async function claudePersistence(): Promise<Persistence | null> {
  const [db, user] = await Promise.all([getCapability("db"), getCapability("user")]);
  if (!db || !user) return null;
  const me = await user.me().catch(() => null);
  if (!me?.id) return null;
  return makeDbPersistence(db, `data/users/${me.id}`);
}

function makeDbPersistence(db: ClaudeDb, path: string): Persistence {
  const col = db.collection(path);
  const known = new Map<string, string>();
  const chains = new Map<string, Promise<void>>();
  let listeners: ((c: RemoteChange) => void)[] = [];
  type First = Record<string, Record<string, unknown>> | null | "unavailable";
  let firstResolve: ((docs: First) => void) | undefined;
  const first = new Promise<First>((r) => (firstResolve = r));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AppData | undefined;

  col.onSnapshot(
    (snap) => {
      if (firstResolve) {
        // On attend une réponse définitive du serveur avant de décider que c'est vide.
        if (snap.metadata.fromCache && snap.docs.length === 0) return;
        const docs: Record<string, Record<string, unknown>> = {};
        for (const d of snap.docs) {
          const body = d.data();
          if (!body) continue;
          docs[d.id] = body;
          known.set(d.id, JSON.stringify(body));
        }
        const resolve = firstResolve;
        firstResolve = undefined;
        resolve(snap.docs.length ? docs : null);
        return;
      }
      const changed: Record<string, Record<string, unknown> | null> = {};
      let any = false;
      for (const ch of snap.docChanges()) {
        if (ch.doc.metadata.hasPendingWrites) continue;
        if (ch.type === "removed") {
          if (known.has(ch.doc.id)) {
            known.delete(ch.doc.id);
            changed[ch.doc.id] = null;
            any = true;
          }
          continue;
        }
        const body = ch.doc.data();
        const json = JSON.stringify(body ?? {});
        if (known.get(ch.doc.id) === json) continue;
        known.set(ch.doc.id, json);
        changed[ch.doc.id] = body ?? null;
        any = true;
      }
      if (any) listeners.forEach((l) => l({ docs: changed }));
    },
    () => {
      firstResolve?.("unavailable");
      firstResolve = undefined;
    },
  );

  const enqueue = (id: string, op: () => Promise<void>) => {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.then(op).catch(() => undefined);
    chains.set(id, next);
    return next;
  };

  const write = async () => {
    const data = pending;
    pending = undefined;
    if (!data) return;
    const docs = toDocs(data);
    const ops: Promise<void>[] = [];
    for (const [id, body] of Object.entries(docs)) {
      const json = JSON.stringify(body);
      if (known.get(id) === json) continue;
      known.set(id, json);
      ops.push(enqueue(id, () => col.doc(id).set(body)));
    }
    for (const id of [...known.keys()]) {
      if (docs[id]) continue;
      known.delete(id);
      ops.push(enqueue(id, () => col.doc(id).delete()));
    }
    await Promise.all(ops);
  };

  return {
    mode: "claude",
    async load() {
      const timeout = new Promise<"unavailable">((r) => setTimeout(() => r("unavailable"), 15_000));
      const docs = await Promise.race([first, timeout]);
      if (docs === "unavailable" || docs === null) return docs;
      return applyDocs(emptyShell(), docs);
    },
    save(data) {
      pending = data;
      clearTimeout(timer);
      timer = setTimeout(write, 700);
    },
    async flush() {
      clearTimeout(timer);
      await write();
    },
    subscribe(cb) {
      listeners = [...listeners, cb];
    },
  };
}

function emptyShell(): AppData {
  return {
    version: 1,
    settings: undefined as unknown as AppData["settings"],
    places: {},
    routes: {},
    subjects: {},
    recurring: {},
    events: {},
    tasks: {},
    exams: {},
    sleep: {},
    meals: {},
    goals: {},
    reminders: {},
    reviews: {},
  };
}

export async function createPersistence(): Promise<Persistence> {
  if (inClaude()) {
    const remote = await claudePersistence().catch(() => null);
    if (remote) return remote;
  }
  return localPersistence();
}
