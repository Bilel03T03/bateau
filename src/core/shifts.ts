// Horaires Auchan d'une semaine précise : lecture et application en une fois.
// Un créneau récurrent modifié devient une exception pour cette date, un jour
// travaillé en plus devient un événement ponctuel.

import { weekDates, weekday } from "../lib/date";
import { uid } from "../lib/meta";
import type { AppData, Occurrence } from "../lib/types";
import { addEvent, editOccurrence, removeOccurrence } from "./edits";
import { occurrencesOn } from "./schedule";

export interface DayShift {
  date: string;
  works: boolean;
  start: number;
  end: number;
  /** Plusieurs créneaux ce jour-là : on ne les modifie pas ici. */
  split?: boolean;
}

const isShift = (o: Occurrence) => o.category === "auchan" && o.kind === "travail";

/** Horaire habituel d'un jour de semaine (modèle récurrent des semaines Auchan). */
export function usualShift(data: AppData, day: number): { start: number; end: number; title: string } | undefined {
  const tpl = Object.values(data.recurring).find((r) => r.category === "auchan" && r.kind === "travail" && r.weekday === day);
  return tpl ? { start: tpl.start, end: tpl.end, title: tpl.title } : undefined;
}

export function readShifts(data: AppData, monday: string): DayShift[] {
  return weekDates(monday).map((date) => {
    const occs = occurrencesOn(data, date).filter(isShift);
    const usual = usualShift(data, weekday(date));
    if (!occs.length) return { date, works: false, start: usual?.start ?? 9 * 60, end: usual?.end ?? 17 * 60 };
    return { date, works: true, start: occs[0].start, end: occs[occs.length - 1].end, split: occs.length > 1 };
  });
}

export function applyShifts(data: AppData, rows: DayShift[]): AppData {
  let d = data;
  const place = Object.values(data.places).find((p) => p.kind === "travail")?.id;
  for (const row of rows) {
    const occs = occurrencesOn(d, row.date).filter(isShift);
    if (!row.works) {
      for (const o of occs) d = removeOccurrence(d, o.key);
      continue;
    }
    if (row.end <= row.start || row.split) continue;
    const cur = occs[0];
    if (cur) {
      if (cur.start !== row.start || cur.end !== row.end) d = editOccurrence(d, cur.key, { start: row.start, end: row.end });
    } else {
      const usual = usualShift(d, weekday(row.date));
      d = addEvent(d, {
        id: uid("w"),
        title: usual?.title ?? "Auchan",
        category: "auchan",
        kind: "travail",
        date: row.date,
        start: row.start,
        end: row.end,
        placeId: place,
        origin: "manuel",
      });
    }
  }
  return d;
}

export function totalShiftMinutes(rows: DayShift[]): number {
  return rows.filter((r) => r.works && r.end > r.start).reduce((s, r) => s + r.end - r.start, 0);
}

// ---------- Horaires habituels (modèle des semaines Auchan) ----------

export interface TemplateShift {
  weekday: number;
  works: boolean;
  start: number;
  end: number;
}

export function readShiftTemplate(data: AppData): TemplateShift[] {
  return [1, 2, 3, 4, 5, 6, 7].map((wd) => {
    const usual = usualShift(data, wd);
    return usual ? { weekday: wd, works: true, start: usual.start, end: usual.end } : { weekday: wd, works: false, start: 9 * 60, end: 17 * 60 };
  });
}

/** Remplace les horaires habituels ; un créneau conservé garde ses exceptions déjà saisies. */
export function applyShiftTemplate(data: AppData, rows: TemplateShift[]): AppData {
  const recurring = { ...data.recurring };
  const place = Object.values(data.places).find((p) => p.kind === "travail")?.id;
  for (const row of rows) {
    const existing = Object.values(recurring).filter((r) => r.category === "auchan" && r.kind === "travail" && r.weekday === row.weekday);
    if (!row.works || row.end <= row.start) {
      for (const r of existing) delete recurring[r.id];
      continue;
    }
    const [keep, ...extra] = existing;
    for (const r of extra) delete recurring[r.id];
    if (keep) {
      recurring[keep.id] = { ...keep, start: row.start, end: row.end, demo: undefined };
    } else {
      const id = uid("rw");
      recurring[id] = {
        id,
        title: "Auchan",
        category: "auchan",
        kind: "travail",
        weekday: row.weekday,
        start: row.start,
        end: row.end,
        placeId: place,
        weekTypes: ["entreprise"],
        overrides: {},
      };
    }
  }
  return { ...data, recurring };
}
