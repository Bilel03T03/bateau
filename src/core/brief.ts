// Brief du jour : l'essentiel en quelques lignes, calculé à partir du vrai
// planning. Le soir, il bascule sur le lendemain (ce qu'il faut préparer).

import { addDays, diffDays, fmtDuration, fmtTime, mondayOf, relativeDay, todayISO, nowMinutes, weekday } from "../lib/date";
import { PRIORITIES, WEEK_TYPES } from "../lib/meta";
import type { AppData, Occurrence } from "../lib/types";
import { buildFrame, type DayFrame } from "./frame";
import { revisionProgress } from "./revisions";
import { dayType, weekTypeOf } from "./schedule";
import { sportPace, sportWeek } from "./stats";

export interface BriefLine {
  icon: string;
  text: string;
  tone?: "good" | "warn" | "bad";
  /** Page à ouvrir en touchant la ligne. */
  route?: string;
}

export interface Brief {
  mode: "jour" | "soir";
  date: string;
  title: string;
  subtitle?: string;
  lines: BriefLine[];
}

function span(occs: Occurrence[]): string {
  const start = Math.min(...occs.map((o) => o.start));
  const end = Math.max(...occs.map((o) => o.end));
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

function dayTitle(data: AppData, frame: DayFrame, prefix: string): string {
  const fixed = frame.occs.filter((o) => !o.pending);
  const work = fixed.filter((o) => o.kind === "travail");
  const school = fixed.filter((o) => o.kind === "cours" || o.kind === "examen");
  const type = dayType(fixed);
  if (weekTypeOf(frame.date, data.settings.alternance) === "vacances" && !work.length && !school.length) return `${prefix}congés`;
  if (type === "travail" && work.length) return `${prefix}Auchan ${span(work)}`;
  if (type === "cours" && school.length) return `${prefix}cours à Perrimond ${span(school)}`;
  if (work.length) return `${prefix}Auchan ${span(work)}`;
  if (school.length) return `${prefix}cours ${span(school)}`;
  return `${prefix}journée libre`;
}

export function buildBrief(data: AppData, now: Date = new Date()): Brief {
  const today = todayISO(now);
  const t = nowMinutes(now);
  const s = data.settings;
  const fToday = buildFrame(data, today);
  const fixedLeft = fToday.occs.filter((o) => !o.pending && o.kind !== "libre" && o.end > t && ["cours", "examen", "travail", "reunion", "rdv", "sport"].includes(o.kind));
  // Le soir (ou quand la journée est finie après 18 h), on prépare demain.
  const evening = t >= Math.min(20 * 60, fToday.bed - 150) || (t >= 18 * 60 && !fixedLeft.length);
  const date = evening ? addDays(today, 1) : today;
  const frame = evening ? buildFrame(data, date) : fToday;
  const occs = frame.occs.filter((o) => !o.pending);
  const lines: BriefLine[] = [];

  const title = dayTitle(data, frame, evening ? "Demain : " : "Aujourd'hui : ");
  const firstLeg = frame.legs[0];
  const lastLeg = frame.legs[frame.legs.length - 1];
  let subtitle: string | undefined;
  if (firstLeg && frame.firstDeparture !== undefined) {
    subtitle = `Départ ${fmtTime(frame.firstDeparture)}${lastLeg && lastLeg.to === s.homePlaceId ? ` · retour vers ${fmtTime(lastLeg.end)}` : ""} · réveil ${fmtTime(frame.wake)}`;
  } else if (!occs.length) {
    subtitle = "Rien de fixé : une journée pour avancer et souffler.";
  }

  // 1. Conflits.
  for (const c of frame.conflicts.slice(0, 1)) lines.push({ icon: "⚠️", text: c.message, tone: "bad", route: "planning" });

  // 2. Examen le jour même.
  for (const o of occs.filter((x) => x.kind === "examen")) {
    lines.push({ icon: "📝", text: `${o.title} à ${fmtTime(o.start)}${o.room ? `, salle ${o.room}` : ""}`, tone: "bad", route: "revisions" });
  }

  // 3. Soirée : coucher conseillé avant un départ tôt.
  if (evening) {
    const bedTonight = fToday.bed;
    if (frame.firstDeparture !== undefined && frame.firstDeparture < 8 * 60) {
      lines.push({ icon: "⏰", text: `Départ à ${fmtTime(frame.firstDeparture)} : coucher conseillé vers ${fmtTime(bedTonight)}.`, tone: "warn" });
    } else if (t < bedTonight) {
      lines.push({ icon: "🌙", text: `Ce soir : temps libre, coucher conseillé vers ${fmtTime(bedTonight)}.` });
    }
  }

  // 4. Sport.
  const monday = mondayOf(date);
  const sportToday = occs.filter((o) => o.kind === "sport");
  for (const o of sportToday) {
    const leg = frame.legs.find((l) => l.toKey === o.key);
    const fromOutside = leg && leg.from !== s.homePlaceId;
    lines.push({
      icon: "🏋️",
      text:
        o.status === "fait"
          ? `${o.title} fait ✓`
          : `${o.title} à ${fmtTime(o.start)}${leg ? ` · départ ${fmtTime(leg.start)}` : ""}${fromOutside ? " · prends ta tenue en partant" : ""}`,
      tone: o.status === "fait" ? "good" : undefined,
      route: "sport",
    });
  }
  if (!sportToday.length) {
    const behind = sportWeek(data, monday)
      .map((r) => ({ r, pace: sportPace(r, date, monday) }))
      .filter((x) => x.pace.status === "en_retard" || x.pace.status === "compromis");
    for (const { r, pace } of behind.slice(0, 1)) {
      lines.push({ icon: "🏋️", text: `${r.target.name} ${r.done}/${r.target.perWeek} cette semaine : ${pace.label.toLowerCase()}.`, tone: pace.tone === "bad" ? "bad" : "warn", route: "sport" });
    }
  }

  // 5. Travail perso prévu (révisions, tâches).
  const focus = occs.filter((o) => (o.kind === "revision" || o.kind === "tache") && o.status !== "fait" && (evening || o.end > t));
  if (focus.length) {
    const total = focus.reduce((sum, o) => sum + o.end - o.start, 0);
    const first = focus[0];
    lines.push({
      icon: "📖",
      text: `${fmtDuration(total)} de travail perso : ${first.title} à ${fmtTime(first.start)}${focus.length > 1 ? ` (+${focus.length - 1} autre${focus.length > 2 ? "s" : ""})` : ""}.`,
      route: "planning",
    });
  }

  // 6. Examen proche : état des révisions.
  const exam = Object.values(data.exams)
    .filter((x) => x.date > date && diffDays(date, x.date) <= 7)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (exam) {
    const p = revisionProgress(data, exam, today, t);
    const left = Math.max(0, p.neededMin - p.doneMin);
    lines.push({
      icon: "📚",
      text: `${exam.title} ${relativeDay(exam.date, today)} : ${fmtDuration(p.doneMin)} révisées sur ${fmtDuration(p.neededMin)}${left && p.plannedMin >= left ? ", le reste est planifié" : ""}.`,
      tone: left > p.plannedMin ? "warn" : undefined,
      route: "revisions",
    });
  }

  // 7. Repas : pris toute la journée sans déjeuner prévu.
  if (frame.lunch?.onSite) {
    const planned = Object.values(data.meals).some((m) => m.date === date && m.slot === "dejeuner" && m.text.trim());
    if (!planned) lines.push({ icon: "🥪", text: `Midi pendant « ${frame.lunch.onSite} » : prévois un déjeuner à emporter.`, tone: "warn", route: "planning" });
  }

  // 8. Priorité du moment.
  const top = Object.values(data.tasks)
    .filter((x) => x.status !== "termine" && x.status !== "reporte")
    .map((x) => ({ x, score: PRIORITIES[x.priority].weight * 10 + (x.deadline ? Math.max(0, 40 - diffDays(today, x.deadline) * 8) : 0) }))
    .sort((a, b) => b.score - a.score)[0]?.x;
  if (top) {
    lines.push({
      icon: "🎯",
      text: `Priorité : « ${top.title} »${top.deadline ? ` (${top.deadline < today ? "en retard" : relativeDay(top.deadline, today)})` : ""}.`,
      tone: top.deadline && top.deadline < today ? "bad" : undefined,
      route: "taches",
    });
  }

  // 9. Ce qui attend une confirmation.
  const unconfirmed = Object.values(data.events).filter(
    (e) =>
      ["sport", "revision", "tache"].includes(e.kind) &&
      !e.pending &&
      (!e.status || e.status === "prevu") &&
      (e.date < today || (e.date === today && e.end <= t)) &&
      e.date >= addDays(today, -7),
  ).length;
  if (unconfirmed) lines.push({ icon: "✅", text: `${unconfirmed} séance${unconfirmed > 1 ? "s" : ""} ou bloc${unconfirmed > 1 ? "s" : ""} à confirmer (fait ou manqué).` });

  // Le week-end ou en congés, rappel du type de la semaine suivante.
  if (weekday(date) >= 6) {
    const nextMonday = addDays(mondayOf(date), 7);
    lines.push({ icon: "🗓️", text: `Semaine prochaine : ${WEEK_TYPES[weekTypeOf(nextMonday, s.alternance)].label.toLowerCase()}.` });
  }

  return { mode: evening ? "soir" : "jour", date, title, subtitle, lines: lines.slice(0, 6) };
}
