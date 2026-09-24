// Rappels intelligents : peu nombreux, triés par importance, calculés à partir
// des vraies données. Ils alimentent l'accueil et les notifications.

import { addDays, diffDays, fmtDuration, fmtTime, mondayOf, relativeDay, weekday } from "../lib/date";
import { REMINDER_TYPES } from "../lib/meta";
import type { AppData } from "../lib/types";
import { averageSleep } from "./energy";
import { buildFrame } from "./frame";
import { revisionProgress } from "./revisions";

export interface Alert {
  id: string;
  level: 1 | 2 | 3;
  icon: string;
  text: string;
  route?: string;
}

export function computeAlerts(data: AppData, today: string, nowMin: number): Alert[] {
  const s = data.settings;
  const out: Alert[] = [];
  const tomorrow = addDays(today, 1);
  const fToday = buildFrame(data, today);
  const fTomorrow = buildFrame(data, tomorrow);

  for (const f of [fToday, fTomorrow]) {
    for (const c of f.conflicts) {
      out.push({ id: `conflit:${c.id}`, level: 3, icon: "⚠️", text: `Conflit ${relativeDay(f.date, today)} : ${c.message}`, route: "planning" });
    }
  }

  for (const o of fTomorrow.occs) {
    if (o.kind === "sport" && !o.pending) {
      out.push({ id: `sport-demain:${o.key}`, level: 1, icon: "🏋️", text: `${o.title} prévu demain à ${fmtTime(o.start)}.`, route: "sport" });
    }
    if (o.kind === "examen") {
      out.push({ id: `exam-demain:${o.key}`, level: 3, icon: "📝", text: `Examen demain : ${o.title} à ${fmtTime(o.start)}.`, route: "revisions" });
    }
  }

  if (fTomorrow.firstDeparture !== undefined && fTomorrow.firstDeparture < 8 * 60 && nowMin < 22 * 60) {
    const isWork = fTomorrow.occs.some((o) => o.kind === "travail");
    out.push({
      id: `tot:${tomorrow}`,
      level: 2,
      icon: "⏰",
      text: `Tu ${isWork ? "travailles" : "commences"} tôt demain (départ ${fmtTime(fTomorrow.firstDeparture)}) : évite une activité tardive ce soir, coucher vers ${fmtTime(fToday.bed)}.`,
    });
  }

  for (const t of Object.values(data.tasks)) {
    if (t.status === "termine" || !t.deadline) continue;
    const n = diffDays(today, t.deadline);
    if (n < 0) {
      out.push({ id: `retard:${t.id}`, level: 3, icon: "🔴", text: `En retard : « ${t.title} » était à rendre ${relativeDay(t.deadline, today)}.`, route: "taches" });
    } else if (n <= 3 && (n <= 1 || t.priority === "importante" || t.priority === "urgente")) {
      const when = n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`;
      const verb = ["devoir", "document", "groupe", "oral", "projet"].includes(t.type ?? "") ? "à rendre" : "à faire pour";
      out.push({ id: `deadline:${t.id}`, level: n <= 1 ? 3 : 2, icon: "📌", text: `« ${t.title} » : ${verb} ${when}.`, route: "taches" });
    }
  }

  for (const exam of Object.values(data.exams)) {
    const n = diffDays(today, exam.date);
    if (n <= 1 || n > 10) continue;
    const p = revisionProgress(data, exam, today, nowMin);
    const expected = p.neededMin * Math.max(0, 1 - n / 10);
    if (p.doneMin < expected) {
      out.push({
        id: `revision:${exam.id}`,
        level: n <= 4 ? 3 : 2,
        icon: "📚",
        text: `${exam.title} dans ${n} jours : ${fmtDuration(p.doneMin)} révisées sur ${fmtDuration(p.neededMin)}.`,
        route: "revisions",
      });
    }
  }

  // Sport : on ne relance qu'à partir de jeudi, et seulement s'il reste un manque.
  const monday = mondayOf(today);
  if (weekday(today) >= 4) {
    for (const target of s.sports) {
      const sessions = Object.values(data.events).filter(
        (e) => e.kind === "sport" && e.sport === target.id && !e.pending && e.date >= monday && e.date <= addDays(monday, 6),
      );
      const done = sessions.filter((e) => e.status === "fait").length;
      const planned = sessions.filter((e) => e.status !== "fait" && e.status !== "manque" && e.date >= today).length;
      if (done + planned < target.perWeek) {
        out.push({
          id: `sport-retard:${target.id}:${monday}`,
          level: 2,
          icon: "🏃",
          text:
            done === 0
              ? `Tu n'as encore fait aucune séance de ${target.name} cette semaine.`
              : `${target.name} : ${done}/${target.perWeek} cette semaine, il manque une séance à placer.`,
          route: "sport",
        });
      }
    }
  }

  for (const r of Object.values(data.reminders)) {
    if (r.done || !r.dueDate) continue;
    const n = diffDays(today, r.dueDate);
    if (n <= r.remindDays) {
      out.push({
        id: `rappel:${r.id}:${r.dueDate}`,
        level: n <= 1 ? 3 : 2,
        icon: "🗂️",
        text: `${REMINDER_TYPES[r.type]} : ${r.title} (${n < 0 ? "en retard" : relativeDay(r.dueDate, today)}).`,
        route: "taches",
      });
    }
  }

  // Repas : longue journée dehors demain sans déjeuner prévu.
  if (fTomorrow.awayMin >= 7 * 60 && fTomorrow.lunch?.onSite !== undefined) {
    const planned = Object.values(data.meals).some((m) => m.date === tomorrow && m.slot === "dejeuner" && m.text.trim());
    if (!planned) {
      out.push({
        id: `repas:${tomorrow}`,
        level: 2,
        icon: "🥪",
        text: `Demain tu es pris toute la journée (${fTomorrow.lunch.onSite}) : prévois un déjeuner à emporter.`,
        route: "planning",
      });
    }
  }

  const sleep = averageSleep(data, addDays(today, -3), today);
  if (sleep.nights >= 2 && sleep.avg < s.sleepTargetMin - 60) {
    out.push({
      id: `sommeil:${today}`,
      level: 2,
      icon: "😴",
      text: `Tu dors peu ces jours-ci (${fmtDuration(sleep.avg)} en moyenne) : garde une soirée calme.`,
      route: "sport",
    });
  }

  if (weekday(today) === 7) {
    const done = Object.values(data.reviews).some((r) => r.weekStart === monday && (r.good || r.improve));
    if (!done) out.push({ id: `bilan:${monday}`, level: 1, icon: "📊", text: "C'est dimanche : prends 3 minutes pour faire ton bilan de la semaine.", route: "stats" });
  }

  return out.sort((a, b) => b.level - a.level);
}
