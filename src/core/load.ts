// Indicateur de charge des 7 prochains jours : 🟢 / 🟠 / 🔴, calculé à partir du
// travail réel à fournir et du temps réellement disponible.

import { addDays, diffDays, fmtHours } from "../lib/date";
import type { AppData } from "../lib/types";
import { buildFrame, totalFree } from "./frame";
import { distributeRevision, revisionDays, revisionProgress } from "./revisions";
import { dayType } from "./schedule";

export interface WeekLoad {
  level: "vert" | "orange" | "rouge";
  emoji: string;
  label: string;
  requiredMin: number;
  capacityMin: number;
  fixedMin: number;
  deadlines: number;
  reasons: string[];
}

export function weekLoad(data: AppData, today: string, nowMin: number): WeekLoad {
  const s = data.settings;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const end = days[6];

  // Capacité : temps libre réel, sans compter les blocs de travail déjà posés.
  const base: AppData = {
    ...data,
    events: Object.fromEntries(
      Object.entries(data.events).filter(([, e]) => !e.pending && e.kind !== "tache" && e.kind !== "revision"),
    ),
  };
  let capacityMin = 0;
  let fixedMin = 0;
  for (const d of days) {
    const f = buildFrame(base, d);
    const usable = Math.max(0, totalFree(f) - s.minFreeMin);
    capacityMin += Math.min(usable, s.maxFocus[dayType(f.occs)]);
    fixedMin += f.loadMin;
  }

  let requiredMin = 0;
  let deadlines = 0;
  for (const t of Object.values(data.tasks)) {
    if (t.status === "termine" || t.status === "reporte" || !t.deadline) continue;
    const left = Math.max(0, t.estimateMin - t.spentMin);
    const n = diffDays(today, t.deadline);
    if (t.deadline <= end) {
      if (t.category !== "auchan") requiredMin += left;
      if (t.priority === "importante" || t.priority === "urgente" || n <= 1) deadlines++;
    } else if (n <= 10 && t.category !== "auchan") {
      requiredMin += left * 0.3;
    }
  }
  for (const exam of Object.values(data.exams)) {
    if (exam.date <= today) continue;
    const prog = revisionProgress(data, exam, today, nowMin);
    const left = prog.neededMin - prog.doneMin;
    if (left <= 0) continue;
    const { plan } = distributeRevision(left, revisionDays(exam, today, true), { difficulty: exam.difficulty, examDate: exam.date });
    requiredMin += plan.filter((p) => p.date <= end).reduce((sum, p) => sum + p.minutes, 0);
    if (exam.date <= end) deadlines++;
  }

  const ratio = requiredMin / Math.max(capacityMin, 60);
  let level: WeekLoad["level"] = "vert";
  if (ratio > 1 || deadlines >= 5 || (ratio > 0.85 && deadlines >= 3)) level = "rouge";
  else if (ratio > 0.6 || deadlines >= 3 || fixedMin >= 45 * 60) level = "orange";

  const reasons = [
    `${fmtHours(requiredMin)} de travail perso à caser pour ${fmtHours(capacityMin)} disponibles`,
    `${deadlines} échéance${deadlines > 1 ? "s" : ""} importante${deadlines > 1 ? "s" : ""} d'ici 7 jours`,
    `${fmtHours(fixedMin)} d'obligations (cours, Auchan, sport, trajets)`,
  ];
  const meta = {
    vert: { emoji: "🟢", label: "Semaine bien organisée" },
    orange: { emoji: "🟠", label: "Semaine chargée" },
    rouge: { emoji: "🔴", label: "Surcharge : plusieurs échéances importantes" },
  }[level];
  return { level, ...meta, requiredMin: Math.round(requiredMin), capacityMin, fixedMin, deadlines, reasons };
}
