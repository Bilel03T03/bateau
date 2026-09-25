// Cours récurrents de la semaine d'école : lecture et import (depuis une
// photo d'emploi du temps ou la configuration guidée).

import { fromHHMM, isValidISO, toHHMM } from "../lib/date";
import { uid } from "../lib/meta";
import type { AppData, CalEvent, Recurring, Subject } from "../lib/types";

export interface CourseInput {
  jour: number;
  debut: string;
  fin: string;
  matiere: string;
  enseignant?: string;
  salle?: string;
  type?: "cours" | "examen";
  date?: string;
}

/** Cours récurrents actuels des semaines d'école, au format de saisie. */
export function readCourseTemplate(data: AppData): CourseInput[] {
  return Object.values(data.recurring)
    .filter((r) => r.category === "ecole" && r.weekTypes.includes("ecole"))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start)
    .map((r) => ({
      jour: r.weekday,
      debut: toHHMM(r.start),
      fin: toHHMM(r.end),
      matiere: r.subjectId ? data.subjects[r.subjectId]?.name ?? r.title : r.title,
      enseignant: r.teacher,
      salle: r.room,
      type: r.kind === "examen" ? "examen" : "cours",
    }));
}

export function importCourses(data: AppData, rows: CourseInput[], replace: boolean): AppData {
  const subjects: Record<string, Subject> = { ...data.subjects };
  const findSubject = (name: string, teacher?: string, room?: string) => {
    const key = name.trim().toLowerCase();
    let s = Object.values(subjects).find((x) => x.name.toLowerCase() === key);
    if (!s) {
      s = { id: uid("s"), name: name.trim(), teacher, room };
      subjects[s.id] = s;
    }
    return s;
  };
  const place = Object.values(data.places).find((p) => p.kind === "ecole")?.id;
  const recurring: Record<string, Recurring> = replace
    ? Object.fromEntries(Object.entries(data.recurring).filter(([, r]) => !(r.category === "ecole" && r.weekTypes.includes("ecole"))))
    : { ...data.recurring };
  const events: Record<string, CalEvent> = { ...data.events };
  for (const r of rows) {
    const start = fromHHMM(r.debut);
    const end = fromHHMM(r.fin);
    if (!(end > start)) continue;
    const sub = findSubject(r.matiere, r.enseignant, r.salle);
    const kind = r.type === "examen" ? "examen" : "cours";
    if (r.date && isValidISO(r.date)) {
      const id = uid("e");
      events[id] = { id, title: sub.name, category: "ecole", kind, date: r.date, start, end, placeId: place, subjectId: sub.id, teacher: r.enseignant, room: r.salle, origin: "import" };
    } else {
      const id = uid("rc");
      recurring[id] = {
        id,
        title: sub.name,
        category: "ecole",
        kind,
        weekday: Math.min(7, Math.max(1, r.jour)),
        start,
        end,
        placeId: place,
        subjectId: sub.id,
        teacher: r.enseignant,
        room: r.salle,
        weekTypes: ["ecole"],
        overrides: {},
      };
    }
  }
  return { ...data, subjects, recurring, events };
}
