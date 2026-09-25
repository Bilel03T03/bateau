import { create } from "zustand";
import { addDays, addMonths, nowMinutes, todayISO } from "../lib/date";
import { uid } from "../lib/meta";
import type {
  AppData,
  BlockStatus,
  CalEvent,
  CollectionName,
  Settings,
  Task,
} from "../lib/types";
import { editOccurrence, removeOccurrence, splitKey } from "../core/edits";
import { planSchedule, type PlanResult } from "../core/planner";
import { emptyData, normalizeData } from "../data/defaults";
import { buildDemo } from "../data/demo";
import { applyDocs, createPersistence, type Persistence, type SyncMode } from "./persistence";
import { loadDevice, saveDevice, type DevicePrefs } from "./device";

export interface Toast {
  id: number;
  text: string;
  undo?: boolean;
  tone?: "info" | "warn";
  /** Action proposée dans la notification (ex. « Replacer »). */
  action?: { label: string; run: () => void };
}

interface State {
  data: AppData;
  status: "loading" | "ready" | "unavailable";
  sync: SyncMode;
  device: DevicePrefs;
  toast: Toast | null;
  undoStack: AppData[];
}

export const useStore = create<State>(() => ({
  data: emptyData(),
  status: "loading",
  sync: "local",
  device: loadDevice(),
  toast: null,
  undoStack: [],
}));

let persistence: Persistence | null = null;
let applyingRemote = false;

export const get = () => useStore.getState().data;

// ---------- Démarrage ----------

export async function boot(): Promise<void> {
  persistence = await createPersistence();
  const loaded = await persistence.load();
  if (loaded === "unavailable") {
    useStore.setState({ status: "unavailable", sync: persistence.mode });
    return;
  }
  const today = todayISO();
  const data = loaded ? normalizeData(loaded, today) : buildDemo(today, nowMinutes());
  useStore.setState({ data, status: "ready", sync: persistence.mode });
  if (!loaded) persistence.save(data);
  persistence.onError((message) => toast(message, { tone: "warn" }));
  persistence.subscribe((change) => {
    applyingRemote = true;
    useStore.setState((s) => ({ data: normalizeData(applyDocs(s.data, change.docs)) }));
    applyingRemote = false;
  });
  useStore.subscribe((s, prev) => {
    if (s.data !== prev.data && !applyingRemote && s.status === "ready") persistence?.save(s.data);
    if (s.device !== prev.device) saveDevice(s.device);
  });
  window.addEventListener("pagehide", () => void persistence?.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistence?.flush();
  });
}

// ---------- Mutations ----------

let toastId = 0;
export function toast(text: string, opts: { undo?: boolean; tone?: Toast["tone"]; action?: Toast["action"] } = {}) {
  const t = { id: ++toastId, text, ...opts };
  useStore.setState({ toast: t });
  setTimeout(
    () => {
      if (useStore.getState().toast?.id === t.id) useStore.setState({ toast: null });
    },
    opts.undo || opts.action ? 7000 : 3500,
  );
}

function mutate(fn: (d: AppData) => AppData, opts: { undo?: string } = {}) {
  useStore.setState((s) => ({
    data: fn(s.data),
    undoStack: opts.undo ? [s.data, ...s.undoStack].slice(0, 10) : s.undoStack,
  }));
  if (opts.undo) toast(opts.undo, { undo: true });
}

export function undo() {
  const [prev, ...rest] = useStore.getState().undoStack;
  if (!prev) return;
  useStore.setState({ data: prev, undoStack: rest, toast: null });
  toast("Modification annulée");
}

export function setDevice(patch: Partial<DevicePrefs>) {
  useStore.setState((s) => ({ device: { ...s.device, ...patch } }));
}

type Item<K extends CollectionName> = AppData[K][string];

export function upsert<K extends CollectionName>(col: K, item: Item<K>, message?: string) {
  mutate((d) => ({ ...d, [col]: { ...d[col], [item.id]: item } }), { undo: message });
}

export function patch<K extends CollectionName>(col: K, id: string, changes: Partial<Item<K>>) {
  mutate((d) => {
    const cur = d[col][id];
    if (!cur) return d;
    return { ...d, [col]: { ...d[col], [id]: { ...cur, ...changes } } };
  });
}

export function remove<K extends CollectionName>(col: K, id: string, message = "Supprimé") {
  mutate(
    (d) => {
      const next = { ...d[col] };
      delete next[id];
      const out = { ...d, [col]: next };
      // Supprimer une tâche ou un examen retire aussi ses blocs planifiés à venir.
      if (col === "tasks" || col === "exams") {
        const today = todayISO();
        out.events = Object.fromEntries(
          Object.entries(d.events).filter(
            ([, e]) => !((e.taskId === id || e.examId === id) && e.date >= today && e.status !== "fait"),
          ),
        );
      }
      return out;
    },
    { undo: message },
  );
}

export function updateSettings(changes: Partial<Settings>) {
  mutate((d) => ({ ...d, settings: { ...d.settings, ...changes } }));
}

// ---------- Occurrences (événements ponctuels ou récurrents) ----------

/** Modifie une occurrence. Pour un horaire récurrent, seule cette date change. */
export function updateOccurrence(key: string, changes: Partial<CalEvent>, message?: string) {
  mutate((d) => editOccurrence(d, key, changes), { undo: message });
}

/** Remplace toutes les données d'un coup (modifications groupées), avec possibilité d'annuler. */
export function commit(next: AppData, message?: string) {
  mutate(() => next, { undo: message });
}

/** Déplacement (glisser-déposer) : l'activité est fixée là, puis le reste s'adapte. */
export function moveOccurrence(key: string, date: string, start: number, end: number) {
  const { eventId } = splitKey(key);
  const ev = eventId ? get().events[eventId] : undefined;
  const pin = ev && (ev.origin === "auto" || ev.pending) ? { origin: "manuel" as const, pending: false } : {};
  updateOccurrence(key, { date, start, end, ...pin }, "Activité déplacée");
  repairAround();
}

export function deleteOccurrence(key: string) {
  const { templateId, eventId } = splitKey(key);
  if (templateId) mutate((d) => removeOccurrence(d, key), { undo: "Occurrence annulée pour cette date" });
  else if (eventId) remove("events", eventId, "Événement supprimé");
  repairAround();
}

/** Après un changement manuel, replace les blocs automatiques qui se retrouvent en conflit. */
export function repairAround() {
  const d = get();
  if (Object.values(d.events).some((e) => e.pending)) return;
  const res = planSchedule(d, { today: todayISO(), nowMin: nowMinutes(), mode: "repair" });
  if (!res.remove.length && !res.add.length) return;
  mutate((cur) => applyPlanTo(cur, res, false));
  const n = res.remove.length;
  // « Annuler » revient à l'état d'avant la modification qui a déclenché l'adaptation.
  toast(`Planning adapté : ${n} bloc${n > 1 ? "s" : ""} replacé${n > 1 ? "s" : ""} automatiquement`, {
    undo: useStore.getState().undoStack.length > 0,
  });
}

function applyPlanTo(d: AppData, res: PlanResult, asPending: boolean): AppData {
  const events = { ...d.events };
  for (const id of res.remove) delete events[id];
  for (const e of res.add) events[e.id] = { ...e, pending: asPending };
  return { ...d, events };
}

export function applyPlan(res: PlanResult, asPending: boolean, message?: string) {
  mutate((d) => applyPlanTo(d, res, asPending), { undo: message });
}

export function acceptPending(ids?: string[]) {
  mutate(
    (d) => {
      const events = { ...d.events };
      for (const e of Object.values(events)) {
        if (e.pending && (!ids || ids.includes(e.id))) events[e.id] = { ...e, pending: false };
      }
      return { ...d, events };
    },
    { undo: "Propositions ajoutées au planning" },
  );
}

export function discardPending(ids?: string[]) {
  mutate((d) => ({
    ...d,
    events: Object.fromEntries(Object.entries(d.events).filter(([, e]) => !(e.pending && (!ids || ids.includes(e.id))))),
  }));
}

/** Marque une séance / un bloc comme fait ou manqué ; le temps passé sur la tâche suit. */
export function setBlockStatus(key: string, status: BlockStatus) {
  const { eventId } = splitKey(key);
  mutate((d) => {
    const ev = eventId ? d.events[eventId] : undefined;
    if (!ev) return d;
    const out: AppData = { ...d, events: { ...d.events, [ev.id]: { ...ev, status, pending: false } } };
    if (ev.taskId && d.tasks[ev.taskId]) {
      const dur = ev.end - ev.start;
      const before = ev.status === "fait" ? dur : 0;
      const after = status === "fait" ? dur : 0;
      const t = d.tasks[ev.taskId];
      const spentMin = Math.max(0, t.spentMin - before + after);
      out.tasks = { ...d.tasks, [t.id]: { ...t, spentMin, status: t.status === "a_faire" && after ? "en_cours" : t.status } };
    }
    return out;
  });
}

export function setTaskStatus(id: string, status: Task["status"]) {
  mutate(
    (d) => {
      const t = d.tasks[id];
      if (!t) return d;
      const done = status === "termine";
      const out: AppData = {
        ...d,
        tasks: { ...d.tasks, [id]: { ...t, status, completedAt: done ? todayISO() : undefined } },
      };
      if (done) {
        // Les blocs à venir de cette tâche ne servent plus.
        const today = todayISO();
        out.events = Object.fromEntries(
          Object.entries(d.events).filter(([, e]) => !(e.taskId === id && e.date >= today && e.status !== "fait" && e.origin === "auto")),
        );
      }
      return out;
    },
    { undo: status === "termine" ? "Tâche terminée 🎉" : undefined },
  );
}

export function completeReminder(id: string) {
  mutate(
    (d) => {
      const r = d.reminders[id];
      if (!r) return d;
      if (r.repeat !== "aucune" && r.dueDate) {
        const next = r.repeat === "mensuelle" ? addMonths(r.dueDate, 1) : addMonths(r.dueDate, 12);
        return { ...d, reminders: { ...d.reminders, [id]: { ...r, dueDate: next, done: false } } };
      }
      return { ...d, reminders: { ...d.reminders, [id]: { ...r, done: true } } };
    },
    { undo: "Rappel réglé" },
  );
}

// ---------- Données ----------

export function removeDemo() {
  mutate(
    (d) => {
      const out: AppData = { ...d };
      for (const col of [
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
      ] as CollectionName[]) {
        (out as unknown as Record<string, unknown>)[col] = Object.fromEntries(
          Object.entries(d[col]).filter(([, item]) => !(item as { demo?: boolean }).demo),
        );
      }
      // Les blocs créés par le planificateur autour des exemples partent aussi.
      out.events = Object.fromEntries(Object.entries(out.events).filter(([, e]) => e.origin !== "auto"));
      out.settings = { ...d.settings, onboarded: false };
      return out;
    },
    { undo: "Exemples supprimés" },
  );
}

export function loadDemo() {
  mutate(() => buildDemo(todayISO(), nowMinutes()), { undo: "Exemples rechargés" });
}

export function resetAll() {
  mutate(() => ({ ...emptyData(), settings: { ...emptyData().settings, onboarded: true } }), { undo: "Toutes les données ont été effacées" });
}

export function importAll(raw: unknown) {
  mutate(() => normalizeData(raw as AppData), { undo: "Données importées" });
}

export function mergeEvents(events: CalEvent[], message: string) {
  mutate((d) => ({ ...d, events: { ...d.events, ...Object.fromEntries(events.map((e) => [e.id, e])) } }), { undo: message });
}

export function newId(prefix: string) {
  return uid(prefix);
}

export function tomorrowISO() {
  return addDays(todayISO(), 1);
}
