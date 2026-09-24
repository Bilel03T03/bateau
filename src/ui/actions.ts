// Actions de haut niveau partagées par l'ajout rapide, l'assistant et les pages.

import { placeOf } from "../core/frame";
import { planSchedule } from "../core/planner";
import type { ParsedEntry } from "../core/quickAdd";
import { defaultHoursFor } from "../core/revisions";
import { fmtTime, nowMinutes, relativeDay, todayISO } from "../lib/date";
import { CATEGORIES, uid } from "../lib/meta";
import type { CalEvent, Exam, Task } from "../lib/types";
import { applyPlan, get, toast, upsert } from "../store/store";

export function createFromParsed(p: ParsedEntry): string {
  const today = todayISO();
  const data = get();
  if (p.kind === "evenement" && p.date && p.start !== undefined) {
    const sport = p.sport ?? (p.eventKind === "sport" ? data.settings.sports[0]?.id : undefined);
    const ev: CalEvent = {
      id: uid("e"),
      title: p.title,
      category: p.category,
      kind: p.eventKind ?? "rdv",
      date: p.date,
      start: p.start,
      end: p.end ?? p.start + 60,
      subjectId: p.subjectId,
      sport,
      status: p.eventKind === "sport" ? "prevu" : undefined,
      origin: "manuel",
    };
    ev.placeId = placeOf(data, { ...ev, key: ev.id });
    upsert("events", ev, `Ajouté : ${ev.title}, ${relativeDay(ev.date, today)} à ${fmtTime(ev.start)}`);
    return ev.id;
  }
  if (p.kind === "examen" && p.date) {
    const exam: Exam = {
      id: uid("x"),
      title: p.title,
      subjectId: p.subjectId,
      date: p.date,
      kind: "examen",
      difficulty: 2,
      hoursNeeded: defaultHoursFor(2, "examen"),
    };
    upsert("exams", exam, `Examen ajouté : ${exam.title} (${relativeDay(exam.date, today)}). Les révisions seront réparties.`);
    return exam.id;
  }
  const task: Task = {
    id: uid("t"),
    title: p.title,
    category: p.category,
    createdAt: today,
    deadline: p.date,
    estimateMin: p.estimateMin,
    spentMin: 0,
    priority: p.priority,
    status: "a_faire",
    subtasks: [],
    subjectId: p.subjectId,
    type: p.type,
  };
  upsert(
    "tasks",
    task,
    `Tâche ajoutée : ${task.title} · ${CATEGORIES[task.category].label}${task.deadline ? ` · ${relativeDay(task.deadline, today)}` : ""}`,
  );
  return task.id;
}

/** « Planifier ma semaine » / « Réorganiser ma semaine » : calcule une proposition, sans rien modifier. */
export function proposeWeek() {
  return planSchedule(get(), { today: todayISO(), nowMin: nowMinutes(), mode: "full" });
}

export function applyProposal(res: ReturnType<typeof proposeWeek>, message: string) {
  applyPlan(res, false, message);
}

export function notify(text: string) {
  toast(text);
}
