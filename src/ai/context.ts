// Résumé compact de la situation, envoyé à l'assistant avec chaque question.

import { buildFrame, totalFree } from "../core/frame";
import { weekLoad } from "../core/load";
import { revisionProgress } from "../core/revisions";
import { weekTypeOf } from "../core/schedule";
import { sportWeek } from "../core/stats";
import { addDays, fmtDateLong, fmtDuration, fmtTime, mondayOf } from "../lib/date";
import { CATEGORIES, KINDS, PRIORITIES, WEEK_TYPES } from "../lib/meta";
import type { AppData } from "../lib/types";

export function describeDay(data: AppData, date: string): string {
  const f = buildFrame(data, date);
  const lines = [`${fmtDateLong(date)} (${WEEK_TYPES[weekTypeOf(date, data.settings.alternance)].label}) :`];
  for (const o of f.occs) {
    const place = o.placeId ? data.places[o.placeId]?.name : undefined;
    lines.push(
      `  - [${o.key}] ${fmtTime(o.start)}-${fmtTime(o.end)} ${o.title} (${KINDS[o.kind].label}, ${CATEGORIES[o.category].label}${place ? `, ${place}` : ""}${o.status ? `, ${o.status}` : ""}${o.origin === "auto" ? ", placé automatiquement" : ""})`,
    );
  }
  for (const l of f.legs) lines.push(`  - trajet ${fmtTime(l.start)}-${fmtTime(l.end)} vers ${data.places[l.to]?.name ?? "?"}`);
  for (const c of f.conflicts) lines.push(`  ! CONFLIT : ${c.message}`);
  lines.push(
    `  créneaux libres : ${f.free.map((g) => `${fmtTime(g.start)}-${fmtTime(g.end)}`).join(", ") || "aucun"} (total ${fmtDuration(totalFree(f))}) · réveil ${fmtTime(f.wake)} · coucher ${fmtTime(f.bed)}`,
  );
  return lines.join("\n");
}

export function buildContext(data: AppData, today: string, nowMin: number): string {
  const s = data.settings;
  const monday = mondayOf(today);
  const out: string[] = [];
  out.push(`Nous sommes le ${fmtDateLong(today)}, il est ${fmtTime(nowMin)}.`);
  out.push(
    `Rythme d'alternance : ${s.alternance.pattern.map((p) => WEEK_TYPES[p].short).join(" → ")} (cycle). Cette semaine : ${WEEK_TYPES[weekTypeOf(today, s.alternance)].label}.`,
  );
  out.push(
    `Réglages : réveil ${fmtTime(s.wakeTime)}, coucher ${fmtTime(s.bedTime)}, sommeil visé ${fmtDuration(s.sleepTargetMin)}, pas de travail perso après ${fmtTime(s.noFocusAfter)}, au moins ${fmtDuration(s.minFreeMin)} de temps libre par jour, soirées protégées : ${s.freeEvenings.join(", ") || "aucune"} (1 = lundi).`,
  );
  out.push(`Trajets : ${Object.values(data.routes).map((r) => `${data.places[r.from]?.name}↔${data.places[r.to]?.name} ${r.minutes} min`).join(", ")}.`);
  const sw = sportWeek(data, monday);
  out.push(
    `Sport cette semaine : ${sw.map((r) => `${r.target.name} ${r.done}/${r.target.perWeek} fait(s), ${r.planned} prévu(s)${r.target.slots.length ? `, créneaux habituels : ${r.target.slots.map((x) => `j${x.weekday} ${fmtTime(x.start)}`).join(" ")}` : ""}`).join(" ; ")}.`,
  );
  const load = weekLoad(data, today, nowMin);
  out.push(`Charge des 7 prochains jours : ${load.label} (${load.reasons.join(" ; ")}).`);

  out.push("\nPlanning des 7 prochains jours :");
  for (let i = 0; i < 7; i++) out.push(describeDay(data, addDays(today, i)));

  const tasks = Object.values(data.tasks)
    .filter((t) => t.status !== "termine")
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 25);
  out.push("\nTâches ouvertes :");
  for (const t of tasks) {
    out.push(
      `  - [${t.id}] ${t.title} (${CATEGORIES[t.category].label}, priorité ${PRIORITIES[t.priority].label.toLowerCase()}, ${t.deadline ? `pour le ${t.deadline}` : "sans date"}, reste ${fmtDuration(Math.max(0, t.estimateMin - t.spentMin))}${t.status === "reporte" ? ", reportée" : ""})`,
    );
  }
  const exams = Object.values(data.exams).filter((x) => x.date >= today);
  if (exams.length) {
    out.push("\nExamens :");
    for (const x of exams) {
      const p = revisionProgress(data, x, today, nowMin);
      out.push(`  - [${x.id}] ${x.title} le ${x.date} : ${fmtDuration(p.doneMin)} révisées, ${fmtDuration(p.plannedMin)} planifiées, besoin total ${fmtDuration(p.neededMin)}`);
    }
  }
  return out.join("\n");
}
