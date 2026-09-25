import { create } from "zustand";
import type { Conflict } from "../core/frame";
import type { CalEvent, Exam, Goal, Recurring, Reminder, Task } from "../lib/types";
import { todayISO } from "../lib/date";

export type Route =
  | "accueil"
  | "planning"
  | "taches"
  | "perrimond"
  | "auchan"
  | "sport"
  | "revisions"
  | "objectifs"
  | "stats"
  | "parametres";

export const ROUTES: { id: Route; label: string; emoji: string }[] = [
  { id: "accueil", label: "Accueil", emoji: "🏠" },
  { id: "planning", label: "Planning", emoji: "📅" },
  { id: "taches", label: "Tâches", emoji: "✅" },
  { id: "perrimond", label: "Perrimond", emoji: "🎓" },
  { id: "auchan", label: "Auchan", emoji: "💼" },
  { id: "sport", label: "Sport", emoji: "🏋️" },
  { id: "revisions", label: "Révisions", emoji: "📚" },
  { id: "objectifs", label: "Objectifs", emoji: "🎯" },
  { id: "stats", label: "Statistiques", emoji: "📊" },
  { id: "parametres", label: "Paramètres", emoji: "⚙️" },
];

export type Editor =
  | { type: "event"; key?: string; draft?: Partial<CalEvent> }
  | { type: "task"; id?: string; draft?: Partial<Task> }
  | { type: "exam"; id?: string; draft?: Partial<Exam> }
  | { type: "goal"; id?: string; draft?: Partial<Goal> }
  | { type: "reminder"; id?: string; draft?: Partial<Reminder> }
  | { type: "sleep"; id?: string; date?: string }
  | { type: "subject"; id?: string }
  | { type: "recurring"; id?: string; draft?: Partial<Recurring> }
  | { type: "conflict"; conflict: Conflict }
  | { type: "dayplan"; date: string }
  | { type: "weekplan" }
  | { type: "timetable"; returnToSetup?: number }
  | { type: "quickadd" }
  | { type: "setup"; step?: number }
  | { type: "more" };

interface Confirm {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UIState {
  route: Route;
  editor: Editor | null;
  assistant: boolean;
  assistantPrompt?: string;
  confirm: Confirm | null;
  /** Date affichée dans le planning. */
  focusDate: string;
}

const routeFromHash = (): Route => {
  const h = (typeof location !== "undefined" ? location.hash.slice(1) : "") as Route;
  return ROUTES.some((r) => r.id === h) ? h : "accueil";
};

export const useUI = create<UIState>(() => ({
  route: routeFromHash(),
  editor: null,
  assistant: false,
  confirm: null,
  focusDate: todayISO(),
}));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => useUI.setState({ route: routeFromHash() }));
}

export function go(route: Route, focusDate?: string) {
  useUI.setState({ route, editor: null, ...(focusDate ? { focusDate } : {}) });
  try {
    if (location.hash.slice(1) !== route) history.replaceState(null, "", `#${route}`);
  } catch {
    /* navigation par hash indisponible */
  }
  window.scrollTo({ top: 0 });
}

export function open(editor: Editor) {
  useUI.setState({ editor });
}

export function close() {
  useUI.setState({ editor: null });
}

export function openAssistant(prompt?: string) {
  useUI.setState({ assistant: true, assistantPrompt: prompt, editor: null });
}

export function closeAssistant() {
  useUI.setState({ assistant: false, assistantPrompt: undefined });
}

export function askConfirm(opts: Omit<Confirm, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.setState({
      confirm: {
        ...opts,
        resolve: (ok) => {
          useUI.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}
