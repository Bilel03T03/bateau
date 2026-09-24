// "Que dois-je faire maintenant ?" : une seule action principale, calculée à
// partir de l'heure, du prochain départ, des échéances, de la fatigue et des
// objectifs de la semaine.

import { addDays, diffDays, fmtDuration, fmtTime, mondayOf, nowMinutes, todayISO, weekday } from "../lib/date";
import { KINDS, PRIORITIES } from "../lib/meta";
import type { AppData } from "../lib/types";
import { energyFor } from "./energy";
import { buildFrame, travelMinutes } from "./frame";
import { taskRemaining } from "./planner";
import { revisionProgress } from "./revisions";

export interface Advice {
  icon: string;
  headline: string;
  detail?: string;
  action?:
    | { kind: "task"; id: string; minutes: number }
    | { kind: "exam"; id: string; minutes: number }
    | { kind: "block"; key: string }
    | { kind: "sport"; sport: string }
    | { kind: "reminder"; id: string };
  alternatives: string[];
}

interface Candidate {
  score: number;
  title: string;
  remaining: number;
  action: Advice["action"];
  verb: (dur: string) => string;
}

export function whatNow(data: AppData, now: Date = new Date()): Advice {
  const today = todayISO(now);
  const t = nowMinutes(now);
  const s = data.settings;
  const frame = buildFrame(data, today);
  const place = (id?: string) => (id && data.places[id]?.name) || "chez toi";
  const energy = energyFor(data, today);

  if (t < frame.wake - 20) {
    return {
      icon: "🌙",
      headline: "Il est encore tôt : repose-toi.",
      detail: `Réveil conseillé à ${fmtTime(frame.wake)}${frame.firstDeparture !== undefined ? `, départ à ${fmtTime(frame.firstDeparture)}` : ""}.`,
      alternatives: [],
    };
  }

  const current = frame.occs.find((o) => !o.pending && o.start <= t && t < o.end && o.kind !== "libre");
  if (current) {
    if (current.kind === "revision" || current.kind === "tache") {
      return {
        icon: "🎯",
        headline: `C'est le moment : ${current.title}.`,
        detail: `Bloc prévu jusqu'à ${fmtTime(current.end)}. Téléphone loin, une chose à la fois.`,
        action: { kind: "block", key: current.key },
        alternatives: [],
      };
    }
    const nextAfter = frame.occs.find((o) => !o.pending && o.start >= current.end && o.kind !== "libre");
    return {
      icon: current.kind === "sport" ? "🏋️" : current.category === "auchan" ? "💼" : "🎓",
      headline:
        current.kind === "sport"
          ? `${current.title} en cours : bonne séance !`
          : `${KINDS[current.kind].label} en cours : ${current.title} jusqu'à ${fmtTime(current.end)}.`,
      detail: nextAfter ? `Ensuite : ${nextAfter.title} à ${fmtTime(nextAfter.start)}.` : "Ensuite, ta journée est libre.",
      alternatives: [],
    };
  }

  const leg = frame.legs.find((l) => l.start <= t && t < l.end);
  if (leg) {
    return {
      icon: "🚆",
      headline: `Tu devrais être en route vers ${place(leg.to)}.`,
      detail: `Arrivée prévue à ${fmtTime(leg.end)}. Profite du trajet pour relire tes notes ou souffler.`,
      alternatives: [],
    };
  }

  const nextLeg = frame.legs.find((l) => l.start > t);
  const nextFixed = frame.occs.find((o) => !o.pending && o.start > t && o.kind !== "libre");
  let boundary: number | undefined;
  let boundaryLabel = "";
  if (nextLeg && (!nextFixed || nextLeg.start <= nextFixed.start)) {
    boundary = nextLeg.start;
    boundaryLabel = nextLeg.to === s.homePlaceId ? "ton retour" : `ton départ pour ${place(nextLeg.to)}`;
  } else if (nextFixed) {
    boundary = nextFixed.start;
    boundaryLabel = nextFixed.title;
  }

  const eveningEnd = Math.min(s.noFocusAfter, frame.bed - s.windDownMin);
  if (t >= frame.bed - s.windDownMin) {
    const tomorrow = buildFrame(data, addDays(today, 1), { skipNextDay: true });
    return {
      icon: "😴",
      headline: "C'est l'heure de préparer la nuit.",
      detail:
        tomorrow.firstDeparture !== undefined
          ? `Demain, départ à ${fmtTime(tomorrow.firstDeparture)}. Prépare ton sac${tomorrow.lunch?.onSite ? " et ton déjeuner" : ""}, puis écrans coupés.`
          : "Demain est calme. Écrans coupés et au lit.",
      alternatives: [],
    };
  }

  if (boundary !== undefined && boundary - t < 20) {
    return {
      icon: "🎒",
      headline: `Prépare-toi : ${boundaryLabel} dans ${fmtDuration(boundary - t)}.`,
      detail: nextFixed ? `${nextFixed.title} à ${fmtTime(nextFixed.start)}.` : undefined,
      alternatives: [],
    };
  }

  for (const [meal, label] of [
    [frame.lunch, "déjeuner"],
    [frame.dinner, "dîner"],
  ] as const) {
    if (meal && !meal.onSite && t >= meal.start - 10 && t < meal.end) {
      return {
        icon: "🍽️",
        headline: `C'est l'heure de ${label}.`,
        detail: boundary !== undefined ? `Ensuite, ${boundaryLabel} à ${fmtTime(boundary)}.` : undefined,
        alternatives: [],
      };
    }
  }

  // Un bloc de travail déjà prévu bientôt : on propose simplement de l'avancer.
  const nextBlock = frame.occs.find((o) => !o.pending && o.start > t && (o.kind === "revision" || o.kind === "tache"));
  if (nextBlock && nextBlock.start - t <= 60 && (boundary === undefined || nextBlock.start <= boundary)) {
    return {
      icon: "🎯",
      headline: `« ${nextBlock.title} » est prévu à ${fmtTime(nextBlock.start)} : tu peux commencer maintenant.`,
      detail: `Bloc de ${fmtDuration(nextBlock.end - nextBlock.start)}. Commencer plus tôt te libère la fin de soirée.`,
      action: { kind: "block", key: nextBlock.key },
      alternatives: [],
    };
  }

  const windowEnd = boundary ?? eveningEnd;
  const window = windowEnd - t;
  const heavyDay = frame.loadMin >= 8 * 60 && t >= 20 * 60 + 30;
  if (t >= s.noFocusAfter || (energy.tired && t >= 20 * 60) || heavyDay || window < 25) {
    return {
      icon: "🛋️",
      headline:
        energy.tired || heavyDay ? "Tu as besoin de récupérer : temps libre." : "Temps libre : rien d'autre n'est prévu.",
      detail: energy.tired
        ? `Raison : ${energy.reasons.join(", ")}.`
        : heavyDay
          ? "Grosse journée : on s'arrête là pour aujourd'hui."
          : "Série, jeu, amis, famille : profite, c'est aussi prévu.",
      alternatives: [],
    };
  }

  // Candidats : tâches, révisions, rappels administratifs, sport en retard.
  const cands: Candidate[] = [];
  for (const task of Object.values(data.tasks)) {
    if (task.status === "termine" || task.status === "reporte") continue;
    if (task.category === "auchan" && !["document", "oral", "apprentissage"].includes(task.type ?? "")) continue;
    const remaining = taskRemaining(data, task, today, t) || Math.max(0, task.estimateMin - task.spentMin);
    if (remaining <= 0) continue;
    let score = PRIORITIES[task.priority].weight * 10;
    if (task.deadline) {
      const n = diffDays(today, task.deadline);
      score += n <= 0 ? 60 : n <= 1 ? 45 : n <= 3 ? 30 : n <= 7 ? 15 : 5;
    }
    if (task.status === "en_cours") score += 5;
    cands.push({
      score,
      title: task.title,
      remaining,
      action: { kind: "task", id: task.id, minutes: remaining },
      verb: (d) => `Avance ${d} sur « ${task.title} »`,
    });
  }
  for (const exam of Object.values(data.exams)) {
    const n = diffDays(today, exam.date);
    if (n <= 0 || n > 21) continue;
    const prog = revisionProgress(data, exam, today, t);
    const left = prog.neededMin - prog.doneMin;
    if (left <= 0) continue;
    const score = 35 + (n <= 3 ? 30 : n <= 7 ? 15 : 0) + (left / Math.max(1, prog.neededMin)) * 10;
    cands.push({
      score,
      title: `Révision ${exam.title}`,
      remaining: left,
      action: { kind: "exam", id: exam.id, minutes: left },
      verb: (d) => `Révise ${exam.title} pendant ${d} (examen ${n === 1 ? "demain" : `dans ${n} jours`})`,
    });
  }
  for (const r of Object.values(data.reminders)) {
    if (r.done || !r.dueDate) continue;
    const n = diffDays(today, r.dueDate);
    if (n > 3) continue;
    cands.push({
      score: 30 + (n <= 1 ? 20 : 0),
      title: r.title,
      remaining: 15,
      action: { kind: "reminder", id: r.id },
      verb: () => `Règle maintenant : « ${r.title} »`,
    });
  }
  const monday = mondayOf(today);
  const daysLeft = 8 - weekday(today);
  for (const target of s.sports) {
    const done = Object.values(data.events).filter(
      (e) => e.kind === "sport" && e.sport === target.id && e.date >= monday && e.date <= addDays(monday, 6) && e.status !== "manque",
    ).length;
    const deficit = target.perWeek - done;
    const trip = travelMinutes(data, s.homePlaceId, target.placeId) * 2;
    if (deficit <= 0 || window < target.durationMin + trip + 15 || t < 7 * 60 || t > 20 * 60) continue;
    cands.push({
      score: 25 + (daysLeft <= deficit + 1 ? 30 : 0) - (energy.tired ? 15 : 0),
      title: target.name,
      remaining: target.durationMin,
      action: { kind: "sport", sport: target.id },
      verb: () => `Va faire ta séance de ${target.name} (${done}/${target.perWeek} cette semaine)`,
    });
  }

  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  const intro =
    boundary !== undefined
      ? `Tu as ${fmtDuration(window)} avant ${boundaryLabel}.`
      : `Tu as ${fmtDuration(window)} devant toi avant de lever le pied.`;
  if (!best) {
    return {
      icon: "🌿",
      headline: "Rien d'urgent : profite de ce temps libre.",
      detail: intro,
      alternatives: [],
    };
  }
  const cap = energy.tired ? 30 : 60;
  const dur = Math.max(10, Math.min(Math.floor((window - 10) / 15) * 15, cap, Math.ceil(best.remaining / 5) * 5));
  return {
    icon: best.action?.kind === "sport" ? "🏋️" : energy.tired ? "🔋" : "👉",
    headline: `${intro} ${best.verb(fmtDuration(dur))}.`,
    detail: energy.tired ? "Session courte : tu es fatigué aujourd'hui." : undefined,
    action: best.action && "minutes" in best.action ? { ...best.action, minutes: dur } : best.action,
    alternatives: cands.slice(1, 3).map((c) => c.title),
  };
}
