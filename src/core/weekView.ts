// La semaine en un coup d'œil : une tuile par jour (type de journée, sport,
// examens, échéances, conflits et niveau de charge).

import { fmtTime, weekDates } from "../lib/date";
import type { AppData } from "../lib/types";
import { buildFrame } from "./frame";
import { dayType, weekTypeOf } from "./schedule";

export interface DayTile {
  date: string;
  kind: "travail" | "cours" | "libre" | "conges";
  label: string;
  hours?: string;
  sport: { title: string; done: boolean }[];
  exams: number;
  deadlines: number;
  conflicts: number;
  /** Part de la journée éveillée occupée (obligations, trajets, travail perso). */
  load: number;
  level: "calme" | "rempli" | "charge";
}

export function weekTiles(data: AppData, monday: string): DayTile[] {
  return weekDates(monday).map((date) => {
    const f = buildFrame(data, date);
    const occs = f.occs.filter((o) => !o.pending);
    const work = occs.filter((o) => o.kind === "travail");
    const school = occs.filter((o) => o.kind === "cours" || o.kind === "examen");
    const type = dayType(occs);
    const holidays = weekTypeOf(date, data.settings.alternance) === "vacances";
    const range = (list: typeof occs) =>
      list.length ? `${fmtTime(Math.min(...list.map((o) => o.start)))}–${fmtTime(Math.max(...list.map((o) => o.end)))}` : undefined;
    let kind: DayTile["kind"] = "libre";
    let label = "Libre";
    let hours: string | undefined;
    if (type === "travail" || (work.length && !school.length)) {
      kind = "travail";
      label = "Auchan";
      hours = range(work);
    } else if (school.length) {
      kind = "cours";
      label = "Cours";
      hours = range(school);
    } else if (holidays) {
      kind = "conges";
      label = "Congés";
    }
    const focus = occs.filter((o) => o.kind === "revision" || o.kind === "tache").reduce((s, o) => s + o.end - o.start, 0);
    const awake = Math.max(60, f.bed - f.wake);
    const load = Math.min(1, (f.loadMin + focus) / awake);
    const deadlines =
      Object.values(data.tasks).filter((t) => t.deadline === date && t.status !== "termine").length +
      Object.values(data.reminders).filter((r) => !r.done && r.dueDate === date).length;
    return {
      date,
      kind,
      label,
      hours,
      sport: occs.filter((o) => o.kind === "sport").map((o) => ({ title: o.title, done: o.status === "fait" })),
      exams: Object.values(data.exams).filter((x) => x.date === date).length,
      deadlines,
      conflicts: f.conflicts.length,
      load,
      level: load >= 0.7 ? "charge" : load >= 0.45 ? "rempli" : "calme",
    };
  });
}
