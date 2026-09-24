// "Cadre" d'une journée : trajets, conflits, repas, heure de réveil conseillée et
// créneaux libres. C'est la base de la planification automatique, de
// "Organiser ma journée" et de "Que dois-je faire maintenant ?".

import { addDays, fmtDuration } from "../lib/date";
import type { AppData, Occurrence, Place } from "../lib/types";
import { occurrencesOn } from "./schedule";

export interface Interval {
  start: number;
  end: number;
}

export interface Leg {
  from: string;
  to: string;
  start: number;
  end: number;
  minutes: number;
  /** Occurrence vers laquelle on se rend (absent pour le retour au domicile). */
  toKey?: string;
}

export interface Conflict {
  id: string;
  date: string;
  type: "chevauchement" | "trajet";
  /** Occurrence qui pose problème (celle qu'on n'arrive pas à rejoindre). */
  key: string;
  otherKey: string;
  missingMin: number;
  message: string;
}

export interface MealSlotPlan extends Interval {
  /** Pris pendant une obligation (ex. pause chez Auchan) : à emporter. */
  onSite?: string;
}

export interface DayFrame {
  date: string;
  occs: Occurrence[];
  legs: Leg[];
  conflicts: Conflict[];
  wake: number;
  ready: number;
  bed: number;
  lunch?: MealSlotPlan;
  dinner?: MealSlotPlan;
  /** Intervalles occupés (obligations, trajets, repas), fusionnés. */
  busy: Interval[];
  /** Créneaux libres entre le moment où tu es prêt et la préparation au coucher. */
  free: Interval[];
  firstDeparture?: number;
  /** Temps passé hors du domicile (première sortie → retour). */
  awayMin: number;
  /** Minutes d'obligations fixes (cours, travail, sport, rendez-vous) + trajets. */
  loadMin: number;
}

type FrameData = Pick<AppData, "events" | "recurring" | "settings" | "places" | "routes">;

const DEFAULT_TRAVEL = 20;

export function travelMinutes(data: Pick<AppData, "routes">, from?: string, to?: string): number {
  if (!from || !to || from === to) return 0;
  for (const r of Object.values(data.routes)) {
    if ((r.from === from && r.to === to) || (r.from === to && r.to === from)) return r.minutes;
  }
  return DEFAULT_TRAVEL;
}

function placeByKind(data: Pick<AppData, "places">, kind: Place["kind"]): string | undefined {
  return Object.values(data.places).find((p) => p.kind === kind)?.id;
}

/** Lieu d'une occurrence : lieu saisi, sinon lieu par défaut de son type. Les blocs de travail perso n'ont pas de lieu. */
export function placeOf(data: Pick<AppData, "places" | "settings">, o: Occurrence): string | undefined {
  if (o.placeId) return o.placeId;
  switch (o.kind) {
    case "cours":
    case "examen":
      return placeByKind(data, "ecole");
    case "travail":
      return placeByKind(data, "travail");
    case "reunion":
      return o.category === "auchan" ? placeByKind(data, "travail") : undefined;
    case "sport": {
      const target = data.settings.sports.find((s) => s.id === o.sport);
      return target?.placeId ?? placeByKind(data, "sport");
    }
    default:
      return undefined;
  }
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function subtractIntervals(base: Interval, busy: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = base.start;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= base.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, base.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out;
}

function findGap(window: Interval, busy: Interval[], duration: number): Interval | undefined {
  for (const g of subtractIntervals(window, busy)) {
    if (g.end - g.start >= duration) return { start: g.start, end: g.start + duration };
  }
  return undefined;
}

function placeName(data: Pick<AppData, "places">, id?: string): string {
  return (id && data.places[id]?.name) || "ton domicile";
}

/** Heure de départ du premier trajet de la journée (utile pour régler le réveil de la veille). */
export function firstDepartureOn(data: FrameData, date: string): number | undefined {
  return buildFrame(data, date, { skipNextDay: true }).firstDeparture;
}

export function buildFrame(
  data: FrameData,
  date: string,
  opts: { occs?: Occurrence[]; skipNextDay?: boolean } = {},
): DayFrame {
  const s = data.settings;
  const home = s.homePlaceId;
  const occs = opts.occs ?? occurrencesOn(data, date);
  // Les propositions en attente comptent : on veut voir leurs conflits avant de les accepter.
  const active = occs.filter((o) => o.kind !== "libre" || !o.pending);

  const located = active
    .map((o) => ({ o, place: placeOf(data, o) }))
    .filter((x): x is { o: Occurrence; place: string } => !!x.place)
    .sort((a, b) => a.o.start - b.o.start);

  const legs: Leg[] = [];
  const conflicts: Conflict[] = [];

  let prevPlace = home;
  let prevEnd: number | undefined;
  let prevKey: string | undefined;
  for (const { o, place } of located) {
    if (prevEnd === undefined) {
      const t = travelMinutes(data, home, place);
      if (t) legs.push({ from: home, to: place, start: o.start - t, end: o.start, minutes: t, toKey: o.key });
    } else if (place !== prevPlace) {
      const direct = travelMinutes(data, prevPlace, place);
      const back = travelMinutes(data, prevPlace, home);
      const go = travelMinutes(data, home, place);
      const gap = o.start - prevEnd;
      if (prevPlace !== home && place !== home && gap >= back + go + 45) {
        legs.push({ from: prevPlace, to: home, start: prevEnd, end: prevEnd + back, minutes: back });
        legs.push({ from: home, to: place, start: o.start - go, end: o.start, minutes: go, toKey: o.key });
      } else if (direct) {
        legs.push({ from: prevPlace, to: place, start: o.start - direct, end: o.start, minutes: direct, toKey: o.key });
        if (gap < direct && prevKey) {
          const missing = direct - Math.max(0, gap);
          conflicts.push({
            id: `trajet:${prevKey}>${o.key}`,
            date,
            type: "trajet",
            key: o.key,
            otherKey: prevKey,
            missingMin: missing,
            message: `Impossible d'arriver à l'heure : ${o.title} commence à ${fmtClock(o.start)}, mais il faut ${fmtDuration(
              direct,
            )} de trajet depuis ${placeName(data, prevPlace)} (il manque ${fmtDuration(missing)}).`,
          });
        }
      }
    }
    if (prevEnd === undefined || o.end >= prevEnd) {
      prevEnd = o.end;
      prevPlace = place;
      prevKey = o.key;
    }
  }
  if (prevEnd !== undefined && prevPlace !== home) {
    const t = travelMinutes(data, prevPlace, home);
    legs.push({ from: prevPlace, to: home, start: prevEnd, end: prevEnd + t, minutes: t });
  }

  // Chevauchements (le temps libre n'entre pas en conflit : on peut le raccourcir).
  const timed = active.filter((o) => o.kind !== "libre").sort((a, b) => a.start - b.start);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (b.start >= a.end) break;
      // Une réunion pendant le service Auchan, ou un examen à la place d'un cours, n'est pas un conflit.
      if (a.category === b.category && [a.kind, b.kind].some((k) => k === "travail" || k === "cours")) continue;
      const overlap = Math.min(a.end, b.end) - b.start;
      conflicts.push({
        id: `chevauchement:${a.key}|${b.key}`,
        date,
        type: "chevauchement",
        key: b.key,
        otherKey: a.key,
        missingMin: overlap,
        message: `${b.title} (${fmtClock(b.start)}) chevauche ${a.title} (${fmtClock(a.start)}–${fmtClock(a.end)}).`,
      });
    }
  }

  const firstDeparture = located.length
    ? Math.min(located[0].o.start - travelMinutes(data, home, located[0].place), located[0].o.start)
    : undefined;

  // Réveil : l'heure habituelle, avancée si le premier départ l'impose.
  let wake = s.wakeTime;
  if (firstDeparture !== undefined) wake = Math.min(wake, firstDeparture - s.morningRoutineMin);
  const firstAny = active.filter((o) => !o.pending).reduce((m, o) => Math.min(m, o.start), Infinity);
  if (Number.isFinite(firstAny)) wake = Math.min(wake, firstAny - s.morningRoutineMin);
  const ready = wake + s.morningRoutineMin;

  // Coucher : l'heure habituelle, avancée si le lendemain commence tôt.
  let bed = s.bedTime;
  if (!opts.skipNextDay) {
    const next = buildFrame(data, addDays(date, 1), { skipNextDay: true });
    const needed = next.wake + 1440 - s.sleepTargetMin;
    bed = Math.min(bed, needed);
  }
  const lastEnd = Math.max(
    ...active.map((o) => o.end),
    ...legs.map((l) => l.end),
    0,
  );
  bed = Math.max(bed, lastEnd + 30);

  // Le temps libre saisi (sortie, famille…) est protégé : rien ne sera planifié dessus.
  const fixedBusy: Interval[] = [
    ...active.map((o) => ({ start: o.start, end: o.end })),
    ...legs.map((l) => ({ start: l.start, end: l.end })),
  ];

  const mealFor = (win: { start: number; end: number; duration: number }): MealSlotPlan | undefined => {
    const gap = findGap({ start: win.start, end: win.end }, fixedBusy, win.duration);
    if (gap) return gap;
    // Pas de trou : si une obligation couvre le créneau, on déjeune sur place.
    const cover = active.find((o) => o.start <= win.start + 30 && o.end >= win.end - 30 && o.kind !== "libre");
    if (cover) return { start: win.start + 30, end: win.start + 30 + win.duration, onSite: cover.title };
    // Sinon, premier trou juste après la fenêtre (ex. dîner après le sport).
    const late = findGap({ start: win.end, end: Math.max(win.end + 1, bed - 30) }, fixedBusy, win.duration);
    return late;
  };
  const lunch = mealFor(s.lunch);
  const dinner = mealFor(s.dinner);

  const busy = mergeIntervals([
    ...fixedBusy,
    ...(lunch && !lunch.onSite ? [lunch] : []),
    ...(dinner && !dinner.onSite ? [dinner] : []),
  ]);
  const free = subtractIntervals({ start: ready, end: bed - s.windDownMin }, busy).filter((g) => g.end - g.start >= 15);

  const awayMin =
    firstDeparture !== undefined && legs.length
      ? Math.max(...legs.map((l) => l.end)) - firstDeparture
      : 0;
  const loadMin =
    active
      .filter((o) => !o.pending && ["cours", "examen", "travail", "reunion", "sport", "rdv"].includes(o.kind))
      .reduce((sum, o) => sum + (o.end - o.start), 0) + legs.reduce((sum, l) => sum + l.minutes, 0);

  return { date, occs, legs, conflicts, wake, ready, bed, lunch, dinner, busy, free, firstDeparture, awayMin, loadMin };
}

function fmtClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}h${String(m % 60).padStart(2, "0")}`;
}

export function totalFree(frame: DayFrame): number {
  return frame.free.reduce((s, g) => s + (g.end - g.start), 0);
}
