import { addDays, diffDays, roundTo } from "../lib/date";
import type { AppData, CalEvent, Exam } from "../lib/types";

export interface RevisionDay {
  date: string;
  minutes: number;
}

export interface RevisionProgress {
  neededMin: number;
  doneMin: number;
  /** Blocs à venir déjà dans le planning (acceptés). */
  plannedMin: number;
  /** Ce qu'il reste à caser (besoin − fait − déjà prévu). */
  remainingMin: number;
  pct: number;
}

function isFuture(ev: CalEvent, today: string, nowMin: number): boolean {
  return ev.date > today || (ev.date === today && ev.end > nowMin);
}

export function revisionBlocks(data: Pick<AppData, "events">, examId: string): CalEvent[] {
  return Object.values(data.events).filter((e) => e.kind === "revision" && e.examId === examId);
}

export function revisionProgress(
  data: Pick<AppData, "events">,
  exam: Exam,
  today: string,
  nowMin: number,
): RevisionProgress {
  const neededMin = Math.round(exam.hoursNeeded * 60);
  let doneMin = 0;
  let plannedMin = 0;
  for (const ev of revisionBlocks(data, exam.id)) {
    const d = ev.end - ev.start;
    if (ev.status === "fait") doneMin += d;
    else if (ev.status !== "manque" && !ev.pending && isFuture(ev, today, nowMin)) plannedMin += d;
  }
  const remainingMin = Math.max(0, neededMin - doneMin - plannedMin);
  const pct = neededMin ? Math.min(100, Math.round((doneMin / neededMin) * 100)) : 100;
  return { neededMin, doneMin, plannedMin, remainingMin, pct };
}

/**
 * Répartit `totalMin` de révision sur les jours disponibles avant l'examen.
 * Séances d'environ une heure, espacées, un peu plus longues à l'approche de
 * l'examen, et une veille volontairement légère (relecture).
 */
export function distributeRevision(
  totalMin: number,
  days: string[],
  opts: { difficulty: 1 | 2 | 3; examDate: string },
): { plan: RevisionDay[]; overflowMin: number } {
  const n = days.length;
  if (totalMin <= 0 || n === 0) return { plan: [], overflowMin: Math.max(0, totalMin) };
  const maxPerDay = opts.difficulty === 3 ? 120 : 90;
  const minSession = 30;

  let k = Math.ceil(totalMin / 60);
  k = Math.max(k, Math.ceil(totalMin / maxPerDay));
  k = Math.min(Math.max(k, 1), n);
  // Pas de séance de moins de 30 min : on réduit le nombre de jours si besoin.
  while (k > 1 && totalMin / k < minSession) k--;

  const idx = new Set<number>();
  for (let i = 0; i < k; i++) idx.add(Math.max(0, Math.round(((i + 1) * n) / k) - 1));
  // En cas de collision d'arrondi, on complète avec les jours libres restants en partant de la fin.
  for (let j = n - 1; idx.size < k && j >= 0; j--) idx.add(j);
  const chosen = [...idx].sort((a, b) => a - b).map((i) => days[i]);

  const weights = chosen.map((d, i) => {
    const w = 0.8 + (chosen.length > 1 ? (0.4 * i) / (chosen.length - 1) : 0);
    return diffDays(d, opts.examDate) === 1 && chosen.length > 1 ? 0.6 : w;
  });
  const sumW = weights.reduce((s, w) => s + w, 0);
  const plan = chosen.map((date, i) => ({
    date,
    minutes: Math.min(maxPerDay, Math.max(minSession, roundTo((totalMin * weights[i]) / sumW, 15))),
  }));

  // Ajuste l'arrondi pour retomber sur le total (dans les limites par jour).
  let diff = totalMin - plan.reduce((s, p) => s + p.minutes, 0);
  let guard = 50;
  while (Math.abs(diff) >= 15 && guard-- > 0) {
    const step = diff > 0 ? 15 : -15;
    const candidates = plan
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (step > 0 ? p.minutes + step <= maxPerDay : p.minutes + step >= minSession))
      .filter(({ p }) => step < 0 || diffDays(p.date, opts.examDate) !== 1 || plan.length === 1);
    if (!candidates.length) break;
    const pick =
      step > 0
        ? candidates.reduce((a, b) => (b.p.minutes < a.p.minutes ? b : a))
        : candidates.reduce((a, b) => (b.p.minutes > a.p.minutes ? b : a));
    pick.p.minutes += step;
    diff -= step;
  }
  const overflowMin = Math.max(0, diff);
  return { plan, overflowMin };
}

/** Jours où l'on peut encore réviser avant l'examen (aujourd'hui inclus si la soirée n'est pas entamée). */
export function revisionDays(exam: Exam, today: string, includeToday: boolean): string[] {
  const days: string[] = [];
  const start = includeToday ? today : addDays(today, 1);
  for (let d = start; d < exam.date; d = addDays(d, 1)) days.push(d);
  return days;
}

export function defaultHoursFor(difficulty: 1 | 2 | 3, kind: Exam["kind"]): number {
  const base = kind === "partiel" ? 6 : kind === "oral" ? 4 : kind === "devoir" ? 3 : 5;
  return base + (difficulty - 2) * 2;
}
