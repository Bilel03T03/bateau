import { addDays, diffDays, mondayOf, weekday } from "../lib/date";
import type { AppData, CalEvent, Occurrence, Recurring, Settings, WeekType } from "../lib/types";

/** Type de la semaine contenant `date` selon le rythme d'alternance (ex. 1 semaine école, 3 semaines Auchan). */
export function weekTypeOf(date: string, alt: Settings["alternance"]): WeekType {
  const monday = mondayOf(date);
  const forced = alt.overrides[monday];
  if (forced) return forced;
  if (!alt.pattern.length) return "entreprise";
  const weeks = Math.floor(diffDays(mondayOf(alt.anchorMonday), monday) / 7);
  const n = alt.pattern.length;
  return alt.pattern[((weeks % n) + n) % n];
}

function recurringOccurrence(tpl: Recurring, baseDate: string): Occurrence | null {
  const ov = tpl.overrides[baseDate];
  if (ov?.cancelled) return null;
  return {
    id: tpl.id,
    key: `${tpl.id}@${baseDate}`,
    recurring: true,
    templateId: tpl.id,
    title: ov?.title ?? tpl.title,
    category: tpl.category,
    kind: tpl.kind,
    date: ov?.date ?? baseDate,
    start: ov?.start ?? tpl.start,
    end: ov?.end ?? tpl.end,
    placeId: ov?.placeId ?? tpl.placeId,
    subjectId: tpl.subjectId,
    teacher: tpl.teacher,
    room: ov?.room ?? tpl.room,
    origin: "manuel",
    demo: tpl.demo,
  };
}

/** Toutes les occurrences (ponctuelles + récurrentes) entre `from` et `to` inclus, triées. */
export function occurrencesBetween(
  data: Pick<AppData, "events" | "recurring" | "settings">,
  from: string,
  to: string,
  opts: { includePending?: boolean } = {},
): Occurrence[] {
  const out: Occurrence[] = [];
  const includePending = opts.includePending ?? true;
  for (const ev of Object.values(data.events)) {
    if (ev.date < from || ev.date > to) continue;
    if (ev.pending && !includePending) continue;
    out.push({ ...ev, key: ev.id });
  }
  // Une occurrence déplacée peut quitter sa semaine : on balaie une semaine de marge.
  const scanFrom = addDays(from, -7);
  const scanTo = addDays(to, 7);
  for (const tpl of Object.values(data.recurring)) {
    for (let d = scanFrom; d <= scanTo; d = addDays(d, 1)) {
      if (weekday(d) !== tpl.weekday) continue;
      if (tpl.from && d < tpl.from) continue;
      if (tpl.until && d > tpl.until) continue;
      if (!tpl.weekTypes.includes(weekTypeOf(d, data.settings.alternance))) continue;
      const occ = recurringOccurrence(tpl, d);
      if (occ && occ.date >= from && occ.date <= to) out.push(occ);
    }
  }
  return out.sort(compareOcc);
}

export function occurrencesOn(data: Pick<AppData, "events" | "recurring" | "settings">, date: string, opts?: { includePending?: boolean }) {
  return occurrencesBetween(data, date, date, opts);
}

export function compareOcc(a: CalEvent, b: CalEvent): number {
  return a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end || a.title.localeCompare(b.title);
}

/** Minutes réellement bloquées par des obligations (hors temps libre et propositions). */
export function busyMinutes(occs: Occurrence[], kinds?: CalEvent["kind"][]): number {
  return occs
    .filter((o) => !o.pending && (!kinds || kinds.includes(o.kind)))
    .reduce((s, o) => s + Math.max(0, o.end - o.start), 0);
}

/** Type de journée utilisé pour doser le travail personnel. */
export function dayType(occs: Occurrence[]): "cours" | "travail" | "libre" {
  const fixed = occs.filter((o) => !o.pending);
  const work = busyMinutes(fixed, ["travail"]);
  const school = busyMinutes(fixed, ["cours", "examen"]);
  if (work >= 180 && work >= school) return "travail";
  if (school >= 120) return "cours";
  if (work > 0) return "travail";
  return "libre";
}
