// Planification automatique : sport, révisions et travail sur les tâches,
// placés dans les vrais créneaux libres (trajets, repas, sommeil et temps
// libre protégé compris). Le planificateur propose ; tu valides.

import { addDays, diffDays, fmtDuration, mondayOf, weekDates, weekday } from "../lib/date";
import { PRIORITIES, uid } from "../lib/meta";
import type { AppData, CalEvent, Occurrence, SportTarget, Task } from "../lib/types";
import { energyFor } from "./energy";
import { buildFrame, firstDepartureOn, travelMinutes, totalFree, type Conflict, type Interval } from "./frame";
import { distributeRevision, revisionDays, revisionProgress } from "./revisions";
import { dayType, occurrencesOn } from "./schedule";

export interface PlanOptions {
  today: string;
  nowMin: number;
  /** full : les 7 prochains jours. day : une seule journée. repair : corrige seulement les blocs automatiques en conflit. */
  mode: "full" | "day" | "repair";
  day?: string;
  horizonDays?: number;
}

export interface Unplaced {
  label: string;
  minutes: number;
  reason: string;
}

export interface PlanResult {
  remove: string[];
  add: CalEvent[];
  unplaced: Unplaced[];
  summary: string[];
}

const FOCUS_KINDS = new Set(["tache", "revision", "sport"]);
const MOVABLE_KINDS = new Set(["sport", "tache", "revision", "rdv", "libre", "autre", "reunion"]);

function ceil15(n: number) {
  return Math.ceil(n / 15) * 15;
}
function floor15(n: number) {
  return Math.floor(n / 15) * 15;
}

export function planSchedule(data: AppData, opts: PlanOptions): PlanResult {
  const { today, nowMin, mode } = opts;
  const s = data.settings;
  const days =
    mode === "day"
      ? [opts.day ?? today]
      : Array.from({ length: opts.horizonDays ?? 7 }, (_, i) => addDays(today, i));
  const first = days[0];
  const last = days[days.length - 1];
  const inHorizon = (d: string) => d >= first && d <= last;
  const started = (e: CalEvent) => e.date < today || (e.date === today && e.start < nowMin + 5);
  const replanable = (e: CalEvent) =>
    (e.origin === "auto" || !!e.pending) &&
    e.status !== "fait" &&
    FOCUS_KINDS.has(e.kind) &&
    inHorizon(e.date) &&
    !started(e);

  // 1. Ce qu'on retire avant de replanifier.
  const remove = new Set<string>();
  if (mode === "repair") {
    for (const d of days) {
      for (const c of buildFrame(data, d).conflicts) {
        const a = data.events[c.key];
        const b = data.events[c.otherKey];
        if (a && replanable(a)) remove.add(a.id);
        else if (b && replanable(b)) remove.add(b.id);
      }
    }
  } else {
    for (const e of Object.values(data.events)) {
      if (e.pending || replanable(e)) remove.add(e.id);
    }
  }
  const work: AppData = { ...data, events: { ...data.events } };
  for (const id of remove) delete work.events[id];

  const add: CalEvent[] = [];
  const unplaced: Unplaced[] = [];
  const pending = mode !== "repair";
  const place = (ev: CalEvent) => {
    work.events[ev.id] = ev;
    add.push(ev);
  };
  const minStart = (d: string) => (d === today ? ceil15(nowMin + 10) : 0);

  // 2. Sport : compléter les objectifs hebdomadaires.
  const sportCount: Record<string, number> = {};
  for (const monday of [...new Set(days.map(mondayOf))]) {
    const weekEnd = addDays(monday, 6);
    const candidateDays = weekDates(monday).filter((d) => days.includes(d) && d >= today);
    // Semaine suivante partiellement couverte : on ne planifie que sa part (ex. 3 jours sur 7).
    const share = monday > mondayOf(today) ? candidateDays.length / 7 : 1;
    for (const target of s.sports) {
      const count = Object.values(work.events).filter(
        (e) => e.kind === "sport" && e.sport === target.id && e.date >= monday && e.date <= weekEnd && e.status !== "manque",
      ).length;
      let needed = share < 1 ? Math.round(target.perWeek * share) - count : target.perWeek - count;
      if (mode === "day") {
        const daysLeft = diffDays(first, weekEnd) + 1;
        const hasSlotToday = target.slots.some((sl) => sl.weekday === weekday(first));
        if (!(needed > 0 && (daysLeft <= needed * 2 || hasSlotToday))) needed = 0;
      }
      while (needed > 0) {
        const best = bestSportSlot(work, target, candidateDays, today, minStart);
        if (!best) {
          unplaced.push({
            label: `${target.name} (${needed} séance${needed > 1 ? "s" : ""})`,
            minutes: needed * target.durationMin,
            reason: "aucun créneau réaliste d'ici dimanche",
          });
          break;
        }
        place({ ...best, pending });
        sportCount[target.name] = (sportCount[target.name] ?? 0) + 1;
        needed--;
      }
    }
  }

  // 3. Capacité de travail personnel par jour.
  const capLeft: Record<string, number> = {};
  const heavy: Record<string, boolean> = {};
  for (const d of days) {
    const frame = buildFrame(work, d);
    const type = dayType(frame.occs);
    let cap = s.maxFocus[type] * energyFor(work, d).factor;
    heavy[d] = frame.loadMin >= 540;
    if (frame.loadMin >= 540) cap *= 0.6;
    else if (frame.loadMin >= 420) cap *= 0.8;
    const existing = frame.occs
      .filter((o) => (o.kind === "tache" || o.kind === "revision") && o.status !== "manque" && !o.pending)
      .reduce((sum, o) => sum + (o.end - o.start), 0);
    capLeft[d] = Math.max(0, floor15(cap) - existing);
  }

  const placeFocus = (d: string, wanted: number, minLen: number, make: (start: number, end: number) => CalEvent): number => {
    if (capLeft[d] < minLen) return 0;
    const frame = buildFrame(work, d);
    let windowEnd = Math.min(s.noFocusAfter, frame.bed - s.windDownMin);
    if (s.freeEvenings.includes(weekday(d))) windowEnd = Math.min(windowEnd, 18 * 60);
    if (heavy[d]) windowEnd = Math.min(windowEnd, s.noFocusAfter - 30);
    const windowStart = Math.max(frame.ready, minStart(d));
    const maxByFree = floor15(totalFree(frame) - s.minFreeMin);
    const len = Math.min(wanted, capLeft[d], maxByFree);
    if (len < minLen) return 0;

    // Petite marge autour des obligations et temps de souffler après une longue absence.
    const longAway = frame.awayMin >= 300;
    const sportEnds = new Set(frame.occs.filter((o) => o.kind === "sport").map((o) => o.end));
    const gaps: Interval[] = [];
    for (const g of frame.free) {
      let start = Math.max(g.start, windowStart);
      let end = Math.min(g.end, windowEnd);
      const returningHome = frame.legs.some((l) => l.end === g.start && l.to === s.homePlaceId);
      if (g.start > frame.ready) start = Math.max(start, g.start + s.bufferMin + (returningHome && longAway ? 20 : 0));
      if (sportEnds.has(g.start)) start = Math.max(start, g.start + 20);
      if (g.end < frame.bed - s.windDownMin) end = Math.min(end, g.end - s.bufferMin);
      start = ceil15(start);
      if (end - start >= minLen) gaps.push({ start, end });
    }
    if (!gaps.length) return 0;
    const score = (g: Interval) => {
      const size = g.end - g.start;
      let sc = size >= len ? 100 - (size - len) * 0.05 : size;
      if (g.start < 9 * 60) sc -= 15;
      if (g.start >= 20 * 60 + 30) sc -= 15;
      return sc;
    };
    const best = gaps.reduce((a, b) => (score(b) > score(a) ? b : a));
    const blockLen = Math.floor(Math.min(len, best.end - best.start) / 5) * 5;
    if (blockLen < minLen) return 0;
    // Le matin, on évite de coller le bloc au réveil s'il y a de la place plus tard.
    const start = best.start < 9 * 60 && best.end - blockLen >= 9 * 60 ? 9 * 60 : best.start;
    place({ ...make(start, start + blockLen), pending });
    capLeft[d] -= blockLen;
    return blockLen;
  };

  // 4. Demandes de travail : révisions réparties, puis tâches par urgence.
  const includeToday = mode === "day" || nowMin < s.noFocusAfter - 45;
  type RevDemand = { examId: string; title: string; date: string; minutes: number; examDate: string };
  const revDemands: RevDemand[] = [];
  for (const exam of Object.values(work.exams)) {
    if (exam.date <= today) continue;
    const prog = revisionProgress(work, exam, today, nowMin);
    if (prog.remainingMin <= 0) continue;
    const avail = revisionDays(exam, today, includeToday);
    const { plan, overflowMin } = distributeRevision(prog.remainingMin, avail, {
      difficulty: exam.difficulty,
      examDate: exam.date,
    });
    for (const p of plan) {
      if (inHorizon(p.date)) revDemands.push({ examId: exam.id, title: exam.title, date: p.date, minutes: p.minutes, examDate: exam.date });
    }
    if (overflowMin > 0 && mode !== "day") {
      unplaced.push({ label: `Révisions · ${exam.title}`, minutes: overflowMin, reason: "trop peu de jours avant l'examen" });
    }
  }

  const tasks = Object.values(work.tasks)
    .filter((t) => t.status !== "termine" && t.status !== "reporte" && (t.category === "ecole" || t.category === "perso"))
    .map((t) => ({ t, left: taskRemaining(work, t, today, nowMin) }))
    .filter((x) => x.left > 0)
    .sort(
      (a, b) =>
        (a.t.deadline ?? "9999").localeCompare(b.t.deadline ?? "9999") ||
        PRIORITIES[b.t.priority].weight - PRIORITIES[a.t.priority].weight,
    );
  const urgentTasks = tasks.filter((x) => x.t.deadline && diffDays(today, x.t.deadline) <= 2);
  const otherTasks = tasks.filter((x) => !urgentTasks.includes(x));

  const revMinutes: Record<string, number> = {};
  const taskMinutes: Record<string, number> = {};

  const planTask = ({ t, left }: { t: Task; left: number }) => {
    let remaining = left;
    if (!t.deadline) {
      const w = PRIORITIES[t.priority].weight;
      if (w <= 1) return;
      remaining = Math.min(remaining, w >= 3 ? 2 * s.focusBlockMin : s.focusBlockMin);
    }
    const lastDay = t.deadline ? (t.deadline > today ? addDays(t.deadline, -1) : today) : last;
    const candidates = days.filter((d) => d <= lastDay);
    if (!candidates.length && t.deadline && t.deadline < first) candidates.push(first);
    let placedTotal = 0;
    for (const d of candidates) {
      if (remaining <= 0) break;
      const daysLeft = Math.max(1, diffDays(d, lastDay) + 1);
      const chunk = Math.min(remaining, Math.max(s.focusBlockMin, ceil15(remaining / daysLeft)), 90);
      const got = placeFocus(d, chunk, Math.min(30, remaining), (start, end) => ({
        id: uid("a"),
        title: t.title,
        category: t.category,
        kind: "tache",
        date: d,
        start,
        end,
        taskId: t.id,
        subjectId: t.subjectId,
        status: "prevu",
        origin: "auto",
      }));
      remaining -= got;
      placedTotal += got;
    }
    if (placedTotal) taskMinutes[t.title] = placedTotal;
    if (remaining > 0 && t.deadline && mode !== "day" && t.deadline <= addDays(last, 1)) {
      unplaced.push({ label: t.title, minutes: remaining, reason: "pas assez de temps libre avant la date limite" });
    }
  };

  urgentTasks.forEach(planTask);

  revDemands.sort((a, b) => a.date.localeCompare(b.date) || a.examDate.localeCompare(b.examDate));
  let carry: Record<string, number> = {};
  for (const r of revDemands) {
    let wanted = r.minutes + (carry[r.examId] ?? 0);
    carry[r.examId] = 0;
    while (wanted >= 30) {
      const got = placeFocus(r.date, Math.min(wanted, 90), 30, (start, end) => ({
        id: uid("a"),
        title: `Révision · ${r.title}`,
        category: "ecole",
        kind: "revision",
        date: r.date,
        start,
        end,
        examId: r.examId,
        status: "prevu",
        origin: "auto",
      }));
      if (!got) break;
      wanted -= got;
      revMinutes[r.title] = (revMinutes[r.title] ?? 0) + got;
    }
    if (wanted > 0) carry[r.examId] = wanted;
  }
  for (const [examId, left] of Object.entries(carry)) {
    if (left >= 15 && mode !== "day") {
      const exam = work.exams[examId];
      unplaced.push({ label: `Révisions · ${exam?.title ?? ""}`, minutes: left, reason: "journées déjà pleines : à rattraper plus tard" });
    }
  }

  otherTasks.forEach(planTask);

  // 5. Résumé lisible.
  const summary: string[] = [];
  for (const [name, n] of Object.entries(sportCount)) summary.push(`${name} : ${n} séance${n > 1 ? "s" : ""} proposée${n > 1 ? "s" : ""}`);
  for (const [title, m] of Object.entries(revMinutes)) summary.push(`Révisions ${title} : ${fmtDuration(m)}`);
  for (const [title, m] of Object.entries(taskMinutes)) summary.push(`${title} : ${fmtDuration(m)}`);
  if (mode !== "repair") {
    summary.push(`Temps libre protégé : au moins ${fmtDuration(s.minFreeMin)} par jour, rien après ${fmtClock(s.noFocusAfter)}`);
  }

  return { remove: [...remove], add, unplaced, summary };
}

/** Minutes restantes sur une tâche, déduction faite du temps passé et des blocs déjà prévus. */
export function taskRemaining(data: Pick<AppData, "events">, t: Task, today: string, nowMin: number): number {
  const planned = Object.values(data.events)
    .filter(
      (e) =>
        e.taskId === t.id &&
        e.kind === "tache" &&
        !e.pending &&
        e.status !== "manque" &&
        e.status !== "fait" &&
        (e.date > today || (e.date === today && e.end > nowMin)),
    )
    .reduce((sum, e) => sum + (e.end - e.start), 0);
  return Math.max(0, t.estimateMin - t.spentMin - planned);
}

function defaultSportStarts(type: ReturnType<typeof dayType>): number[] {
  if (type === "libre") return [600, 660, 900, 960, 1020, 1080, 1110];
  return [420, 1050, 1080, 1110, 1140, 1170];
}

function bestSportSlot(
  work: AppData,
  target: SportTarget,
  candidateDays: string[],
  today: string,
  minStart: (d: string) => number,
): CalEvent | undefined {
  return rankSportSlots(work, target, candidateDays, today, minStart)[0];
}

/** Créneaux possibles pour une séance, du meilleur au moins bon (au plus un par jour). */
export function rankSportSlots(
  work: AppData,
  target: SportTarget,
  candidateDays: string[],
  today: string,
  minStart: (d: string) => number,
): CalEvent[] {
  const s = work.settings;
  const place = target.placeId ?? Object.values(work.places).find((p) => p.kind === "sport")?.id;
  const ranked: { ev: CalEvent; score: number }[] = [];
  candidateDays.forEach((d, dayIndex) => {
    const base = buildFrame(work, d);
    const occs = base.occs;
    if (occs.some((o) => o.kind === "sport" && o.sport === target.id)) return;
    const starts = target.slots.length
      ? target.slots.filter((sl) => sl.weekday === weekday(d)).map((sl) => sl.start)
      : defaultSportStarts(dayType(occs));
    const nextDeparture = firstDepartureOn(work, addDays(d, 1));
    let best: { ev: CalEvent; score: number } | undefined;
    for (const start of starts) {
      const end = start + target.durationMin;
      if (start < minStart(d) + travelMinutes(work, s.homePlaceId, place)) continue;
      if (end > Math.min(s.bedTime - s.windDownMin - 30, 22 * 60)) continue;
      const ev: CalEvent = {
        id: uid("a"),
        title: target.name,
        category: "sport",
        kind: "sport",
        sport: target.id,
        date: d,
        start,
        end,
        placeId: place,
        status: "prevu",
        origin: "auto",
      };
      const withEv: Occurrence[] = [...occs, { ...ev, key: ev.id }];
      const frame = buildFrame(work, d, { occs: withEv });
      if (frame.conflicts.some((c) => c.key === ev.id || c.otherKey === ev.id)) continue;
      if (frame.wake < Math.min(base.wake, s.wakeTime - 30)) continue;
      let score = target.slots.length ? 20 : 0;
      const neighbours = [addDays(d, -1), addDays(d, 1)];
      if (Object.values(work.events).some((e) => e.kind === "sport" && e.sport === target.id && neighbours.includes(e.date))) score -= 25;
      if (occs.some((o) => o.kind === "sport")) score -= 15;
      score -= (base.loadMin / 60) * 3;
      if (nextDeparture !== undefined && nextDeparture < 8 * 60 && end > 20 * 60) score -= 30;
      if (s.freeEvenings.includes(weekday(d)) && start >= 18 * 60) score -= 20;
      if (start >= 17 * 60 + 30 && start <= 19 * 60) score += 6;
      if (start < 8 * 60) score -= 8;
      if (frame.dinner && frame.dinner.start > s.dinner.end) score -= 5;
      if (totalFree(frame) < 45) score -= 10;
      if (d === today && energyFor(work, d).tired) score -= 10;
      score -= dayIndex * 0.5;
      if (!best || score > best.score) best = { ev, score };
    }
    if (best) ranked.push(best);
  });
  return ranked.sort((a, b) => b.score - a.score).map((r) => r.ev);
}

// ---------- Résolution d'un conflit ----------

export interface FixOption {
  label: string;
  detail: string;
  key: string;
  date: string;
  start: number;
  end: number;
}

function fitsAt(data: AppData, occ: Occurrence, date: string, start: number, end: number): boolean {
  const moved: Occurrence = { ...occ, date, start, end };
  const others = occurrencesOn(data, date).filter((o) => o.key !== occ.key);
  const frame = buildFrame(data, date, { occs: [...others, moved] });
  if (frame.conflicts.some((c) => c.key === occ.key || c.otherKey === occ.key)) return false;
  return end <= Math.max(frame.bed - data.settings.windDownMin, 22 * 60) && start >= frame.ready - 60;
}

export function conflictFixes(data: AppData, conflict: Conflict, today: string, nowMin: number): FixOption[] {
  const occs = occurrencesOn(data, conflict.date);
  const a = occs.find((o) => o.key === conflict.key);
  const b = occs.find((o) => o.key === conflict.otherKey);
  const movable = [a, b].find((o) => o && MOVABLE_KINDS.has(o.kind));
  if (!movable) return [];
  const duration = movable.end - movable.start;
  const options: FixOption[] = [];
  const earliest = conflict.date === today ? ceil15(nowMin + 15) : 6 * 60;

  // Même jour, plus tôt ou plus tard.
  let sameDay: FixOption | undefined;
  for (let delta = 15; delta <= 6 * 60 && !sameDay; delta += 15) {
    for (const start of [movable.start + delta, movable.start - delta]) {
      if (start < earliest || start + duration > 23 * 60) continue;
      if (fitsAt(data, movable, conflict.date, start, start + duration)) {
        sameDay = {
          label: start > movable.start ? "Décaler plus tard" : "Avancer",
          detail: `${movable.title} à ${fmtClock(start)}`,
          key: movable.key,
          date: conflict.date,
          start,
          end: start + duration,
        };
        break;
      }
    }
  }
  if (sameDay) options.push(sameDay);

  // Autre jour de la semaine, au même horaire si possible.
  const monday = mondayOf(conflict.date);
  const otherDays = weekDates(monday)
    .filter((d) => d !== conflict.date && d >= today)
    .sort((x, y) => Math.abs(diffDays(conflict.date, x)) - Math.abs(diffDays(conflict.date, y)));
  outer: for (const d of otherDays) {
    const startsToTry = [movable.start, ...Array.from({ length: 30 }, (_, i) => 7 * 60 + i * 30)];
    for (const start of startsToTry) {
      if (d === today && start < ceil15(nowMin + 15)) continue;
      if (start + duration > 22 * 60) continue;
      if (fitsAt(data, movable, d, start, start + duration)) {
        options.push({
          label: "Choisir un autre jour",
          detail: `${movable.title} ${dayLabel(d)} à ${fmtClock(start)}`,
          key: movable.key,
          date: d,
          start,
          end: start + duration,
        });
        break outer;
      }
    }
  }

  // Raccourcir l'activité déplaçable.
  const missing = ceil15(conflict.missingMin);
  if (duration - missing >= 30) {
    const later = movable === a;
    const start = later ? movable.start + missing : movable.start;
    const end = later ? movable.end : movable.end - missing;
    if (fitsAt(data, movable, conflict.date, start, end)) {
      options.push({
        label: "Réduire l'activité",
        detail: `${movable.title} ${fmtClock(start)}–${fmtClock(end)} (${fmtDuration(end - start)} au lieu de ${fmtDuration(duration)})`,
        key: movable.key,
        date: conflict.date,
        start,
        end,
      });
    }
  }
  return options;
}

function dayLabel(d: string): string {
  const names = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  return names[weekday(d) - 1];
}

function fmtClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}h${String(min % 60).padStart(2, "0")}`;
}
