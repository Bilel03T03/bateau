// Assistant local, sans IA : il comprend les demandes les plus courantes et
// s'appuie sur le planificateur de Cap. Utilisé quand aucune IA n'est disponible.

import { weekLoad } from "../core/load";
import { whatNow } from "../core/nowAdvisor";
import { planSchedule, rankSportSlots } from "../core/planner";
import { parseQuickAdd } from "../core/quickAdd";
import { defaultHoursFor, distributeRevision, revisionDays } from "../core/revisions";
import { sportWeek } from "../core/stats";
import { addDays, diffDays, fmtDateLong, fmtDateShort, fmtDuration, fmtTime, mondayOf } from "../lib/date";
import { uid } from "../lib/meta";
import type { AppData, Exam } from "../lib/types";
import { applyPlan, get, patch, upsert, repairAround } from "../store/store";
import { createFromParsed } from "../ui/actions";
import type { Proposal } from "./tools";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function localAssistant(text: string, today: string, nowMin: number): { text: string; proposals: Proposal[] } {
  const data = get();
  const n = norm(text);
  const proposals: Proposal[] = [];

  // 1. Trouver un créneau de sport.
  const sport = data.settings.sports.find((s) => n.includes(norm(s.name)) || n.includes(s.id));
  if ((sport || /\b(sport|seance)\b/.test(n)) && /(trouve|moment|creneau|quand|caser|placer|faire|dispo)/.test(n)) {
    const monday = mondayOf(today);
    const nextWeek = /semaine prochaine/.test(n);
    const target =
      sport ??
      sportWeek(data, monday)
        .filter((r) => r.done + r.planned < r.target.perWeek)
        .map((r) => r.target)[0] ??
      data.settings.sports[0];
    if (!target) return { text: "Aucun sport n'est configuré. Ajoute-le dans la page Sport.", proposals };
    const from = nextWeek ? addDays(monday, 7) : today;
    const to = nextWeek ? addDays(monday, 13) : addDays(monday, 6);
    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const minStart = (d: string) => (d === today ? Math.ceil((nowMin + 10) / 15) * 15 : 0);
    const ranked = rankSportSlots(data, target, days, today, minStart).slice(0, 3);
    if (!ranked.length) {
      return {
        text: `Je ne trouve pas de créneau réaliste pour ${target.name} ${nextWeek ? "la semaine prochaine" : "d'ici dimanche"} : tes journées sont pleines (travail, cours, trajets). Tu peux libérer une soirée ou raccourcir une autre activité.`,
        proposals,
      };
    }
    const row = sportWeek(data, monday).find((r) => r.target.id === target.id);
    ranked.forEach((ev, i) =>
      proposals.push({
        id: ev.id,
        label: `${i === 0 ? "⭐ " : ""}${target.name} ${fmtDateShort(ev.date)} ${fmtTime(ev.start)}–${fmtTime(ev.end)}`,
        detail: i === 0 ? "meilleur compromis" : "alternative",
        apply: () => {
          upsert("events", { ...ev, origin: "manuel" }, `${target.name} ajouté ${fmtDateLong(ev.date)} à ${fmtTime(ev.start)}`);
          repairAround();
        },
      }),
    );
    return {
      text: `${target.name} : ${row?.done ?? 0}/${target.perWeek} cette semaine${row?.planned ? `, ${row.planned} déjà prévue(s)` : ""}. J'ai regardé tes horaires, tes trajets, tes repas et l'heure de départ du lendemain. Le meilleur moment : ${fmtDateLong(ranked[0].date)} à ${fmtTime(ranked[0].start)}. Choisis une option ci-dessous.`,
      proposals,
    };
  }

  // 2. Un examen à préparer.
  if (/(examen|partiel|controle|oral|interro|ds\b)/.test(n)) {
    const parsed = parseQuickAdd(text, today, Object.values(data.subjects));
    const date = parsed.date;
    let exam: Exam | undefined = Object.values(data.exams).find((x) => (date ? x.date === date : x.date >= today) && (!parsed.subjectId || x.subjectId === parsed.subjectId));
    const nothing = /(rien revise|pas revise|pas commence|rien fait)/.test(n);
    if (!exam && date) {
      const difficulty = nothing ? 3 : 2;
      exam = {
        id: uid("x"),
        title: parsed.subjectId ? `Examen ${data.subjects[parsed.subjectId].name}` : "Examen",
        subjectId: parsed.subjectId,
        date,
        kind: "examen",
        difficulty,
        hoursNeeded: defaultHoursFor(difficulty, "examen"),
      };
    }
    if (!exam) return { text: "Quelle est la date de l'examen ? Par exemple : « J'ai un examen de finance vendredi ».", proposals };
    const isNew = !data.exams[exam.id];
    const days = diffDays(today, exam.date);
    const sim: AppData = isNew ? { ...data, exams: { ...data.exams, [exam.id]: exam } } : data;
    const plan = planSchedule(sim, { today, nowMin, mode: "full" });
    const revBlocks = plan.add.filter((e) => e.examId === exam!.id);
    const dist = distributeRevision(exam.hoursNeeded * 60, revisionDays(exam, today, nowMin < 20 * 60), { difficulty: exam.difficulty, examDate: exam.date });
    const theExam = exam;
    proposals.push({
      id: uid("p"),
      label: `${isNew ? "Enregistrer l'examen et placer" : "Placer"} ${revBlocks.length} séance${revBlocks.length > 1 ? "s" : ""} de révision`,
      detail: revBlocks.map((e) => `${fmtDateShort(e.date)} ${fmtTime(e.start)} (${fmtDuration(e.end - e.start)})`).join(" · "),
      apply: () => {
        if (isNew) upsert("exams", theExam);
        applyPlan({ remove: plan.remove.filter((id) => get().events[id]?.examId === theExam.id), add: revBlocks, unplaced: [], summary: [] }, false, "Révisions ajoutées au planning");
        repairAround();
      },
    });
    const placed = revBlocks.reduce((s, e) => s + e.end - e.start, 0);
    return {
      text: `${days <= 1 ? "C'est très court" : `Il te reste ${days} jours`} : je prévois ${fmtDuration(exam.hoursNeeded * 60)} de révision${nothing ? " (tu pars de zéro, j'ai compté large)" : ""}, répartis ainsi : ${dist.plan
        .map((p) => `${fmtDateShort(p.date)} ${fmtDuration(p.minutes)}`)
        .join(", ")}. Pas tout la veille : la dernière séance est une relecture légère. ${placed ? `J'ai trouvé la place pour ${fmtDuration(placed)} dans tes créneaux libres cette semaine.` : "Tes créneaux libres sont pleins cette semaine : allège d'abord ta semaine."}`,
      proposals,
    };
  }

  // 3. Semaine trop chargée.
  if (/(charge|trop|surcharg|allege|debord|deplace|decale|stress|pas le temps)/.test(n)) {
    const load = weekLoad(data, today, nowMin);
    const horizon = addDays(today, 7);
    // Seules les tâches qui prennent du temps perso (école, perso) allègent vraiment la semaine.
    const flexible = Object.values(data.tasks).filter(
      (t) =>
        t.status !== "termine" &&
        t.status !== "reporte" &&
        (t.category === "ecole" || t.category === "perso") &&
        t.estimateMin - t.spentMin >= 20 &&
        (t.priority === "faible" || t.priority === "normale") &&
        (!t.deadline || t.deadline > horizon),
    );
    for (const t of flexible.slice(0, 4)) {
      proposals.push({
        id: uid("p"),
        label: `Reporter « ${t.title} »`,
        detail: t.deadline ? `échéance ${fmtDateShort(t.deadline)}, rien d'urgent cette semaine` : "pas de date limite",
        apply: () => {
          patch("tasks", t.id, { status: "reporte" });
          const blocks = Object.values(get().events).filter((e) => e.taskId === t.id && e.origin === "auto" && e.date >= today && e.status !== "fait");
          if (blocks.length) applyPlan({ remove: blocks.map((b) => b.id), add: [], unplaced: [], summary: [] }, false);
        },
      });
    }
    const plan = planSchedule(data, { today, nowMin, mode: "full" });
    proposals.push({
      id: uid("p"),
      label: "Réorganiser la semaine avec le planificateur",
      detail: plan.summary.slice(0, 3).join(" · "),
      apply: () => applyPlan(plan, false, "Semaine réorganisée"),
    });
    const stuck = [...new Set(plan.unplaced.map((u) => u.label))];
    return {
      text: [
        `${load.emoji} ${load.label} : ${load.reasons[0]}, ${load.reasons[1]}.`,
        flexible.length
          ? `Peut attendre sans risque : ${flexible
              .slice(0, 4)
              .map((t) => `« ${t.title} »`)
              .join(", ")}.`
          : "Rien de ce qui prend du temps perso ne peut vraiment attendre.",
        "Les cours, le travail et les échéances proches restent en place ; le planificateur réorganise le reste en gardant ton temps libre.",
        stuck.length ? `Même comme ça, il manque de la place pour : ${stuck.join(", ")}. Il faudra arbitrer (réduire une durée estimée ou décaler une date).` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      proposals,
    };
  }

  // 4. Que faire maintenant ?
  if (/(maintenant|que faire|quoi faire|je fais quoi|par quoi commencer)/.test(n)) {
    const a = whatNow(data, new Date());
    return { text: `${a.icon} ${a.headline}${a.detail ? `\n${a.detail}` : ""}`, proposals };
  }

  // 5. Sinon : ajout rapide si la phrase ressemble à une tâche ou un événement.
  const parsed = parseQuickAdd(text, today, Object.values(data.subjects), data.settings.sports);
  if (parsed.date || parsed.explicit.time) {
    proposals.push({
      id: uid("p"),
      label: `Ajouter « ${parsed.title} »`,
      detail: `${parsed.kind === "evenement" ? "événement" : parsed.kind === "examen" ? "examen" : "tâche"}${parsed.date ? ` · ${fmtDateShort(parsed.date)}` : ""}${parsed.start !== undefined ? ` ${fmtTime(parsed.start)}` : ""}`,
      apply: () => {
        createFromParsed(parsed);
        repairAround();
      },
    });
    return { text: "Je peux l'ajouter pour toi :", proposals };
  }

  return {
    text:
      "Sans IA connectée, je comprends surtout ces demandes :\n• « Trouve-moi un moment pour mon deuxième CrossFit »\n• « J'ai un examen de finance vendredi et je n'ai rien révisé »\n• « Ma semaine est trop chargée, aide-moi à déplacer ce qui peut l'être »\n• « Que dois-je faire maintenant ? »\nPour poser n'importe quelle question, ouvre Cap dans Claude ou ajoute une clé API dans les Paramètres.",
    proposals,
  };
}
