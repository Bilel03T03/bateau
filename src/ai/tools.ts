// Outils mis à disposition de l'assistant IA. Ils lisent le planning et
// enregistrent des PROPOSITIONS : rien n'est modifié sans ta validation.

import { buildFrame, placeOf } from "../core/frame";
import { conflictFixes, planSchedule, rankSportSlots } from "../core/planner";
import { distributeRevision, revisionDays } from "../core/revisions";
import { occurrencesBetween } from "../core/schedule";
import { addDays, fmtDateShort, fmtDuration, fmtTime, fromHHMM, isValidISO, mondayOf, weekDates } from "../lib/date";
import { uid } from "../lib/meta";
import type { AppData, CalEvent, Category, EventKind, Occurrence } from "../lib/types";
import { applyPlan, get, moveOccurrence, deleteOccurrence, patch, upsert, repairAround } from "../store/store";
import { describeDay } from "./context";

export interface Proposal {
  id: string;
  label: string;
  detail?: string;
  apply: () => void;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  execute: (input: Record<string, unknown>) => string;
}

const hhmm = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? fromHHMM(v) : undefined);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function occByKey(data: AppData, key: string): Occurrence | undefined {
  if (data.events[key]) return { ...data.events[key], key };
  const base = key.split("@")[1];
  if (!base) return undefined;
  return occurrencesBetween(data, addDays(base, -7), addDays(base, 7)).find((o) => o.key === key);
}

function conflictsWith(data: AppData, occ: Occurrence): string[] {
  const others = occurrencesBetween(data, occ.date, occ.date).filter((o) => o.key !== occ.key);
  return buildFrame(data, occ.date, { occs: [...others, occ] })
    .conflicts.filter((c) => c.key === occ.key || c.otherKey === occ.key)
    .map((c) => c.message);
}

export function makeTools(today: string, nowMin: number, sink: (p: Proposal) => void): ToolDef[] {
  const d = () => get();
  return [
    {
      name: "voir_journee",
      description: "Renvoie le détail d'une journée (événements avec leur clé, trajets, conflits, créneaux libres). Utile au-delà des 7 jours déjà fournis.",
      inputSchema: { type: "object", properties: { date: { type: "string", description: "AAAA-MM-JJ" } }, required: ["date"] },
      execute: (i) => {
        const date = str(i.date);
        if (!isValidISO(date)) throw new Error("date invalide, format AAAA-MM-JJ");
        return describeDay(d(), date);
      },
    },
    {
      name: "meilleurs_creneaux_sport",
      description:
        "Calcule les meilleurs créneaux réalistes pour une séance de sport (trajets, repas, sommeil, départ tôt le lendemain et jours consécutifs pris en compte). Renvoie jusqu'à 4 options classées.",
      inputSchema: {
        type: "object",
        properties: {
          sport: { type: "string", description: "identifiant du sport, ex. crossfit ou squash" },
          du: { type: "string", description: "AAAA-MM-JJ, par défaut aujourd'hui" },
          au: { type: "string", description: "AAAA-MM-JJ, par défaut dimanche de cette semaine" },
        },
        required: ["sport"],
      },
      execute: (i) => {
        const data = d();
        const target = data.settings.sports.find((s) => s.id === str(i.sport).toLowerCase() || s.name.toLowerCase() === str(i.sport).toLowerCase());
        if (!target) throw new Error(`sport inconnu. Sports : ${data.settings.sports.map((s) => s.id).join(", ")}`);
        const from = isValidISO(i.du) ? (i.du as string) : today;
        const to = isValidISO(i.au) ? (i.au as string) : addDays(mondayOf(today), 6);
        const days: string[] = [];
        for (let x = from < today ? today : from; x <= to && days.length < 14; x = addDays(x, 1)) days.push(x);
        const minStart = (x: string) => (x === today ? Math.ceil((nowMin + 10) / 15) * 15 : 0);
        const ranked = rankSportSlots(data, target, days, today, minStart).slice(0, 4);
        if (!ranked.length) return "Aucun créneau réaliste sur cette période.";
        return ranked.map((e, n) => `${n + 1}. ${e.date} ${fmtTime(e.start)}-${fmtTime(e.end)}`).join("\n");
      },
    },
    {
      name: "creneaux_libres",
      description: "Liste les créneaux libres d'une journée d'au moins la durée demandée (trajets et repas déjà déduits).",
      inputSchema: {
        type: "object",
        properties: { date: { type: "string" }, duree_minutes: { type: "number" } },
        required: ["date", "duree_minutes"],
      },
      execute: (i) => {
        const date = str(i.date);
        if (!isValidISO(date)) throw new Error("date invalide");
        const min = Number(i.duree_minutes) || 30;
        const free = buildFrame(d(), date).free.filter((g) => g.end - g.start >= min);
        return free.length ? free.map((g) => `${fmtTime(g.start)}-${fmtTime(g.end)}`).join(", ") : "Aucun créneau assez long ce jour-là.";
      },
    },
    {
      name: "proposer_ajout",
      description:
        "Propose d'ajouter une activité au planning (séance de sport, révision, travail sur une tâche, rendez-vous…). Refusée si elle crée un conflit : choisis alors un autre créneau.",
      inputSchema: {
        type: "object",
        properties: {
          titre: { type: "string" },
          categorie: { type: "string", enum: ["ecole", "auchan", "sport", "perso"] },
          type: { type: "string", enum: ["sport", "revision", "tache", "rdv", "libre", "reunion", "cours", "autre"] },
          date: { type: "string", description: "AAAA-MM-JJ" },
          debut: { type: "string", description: "HH:MM" },
          fin: { type: "string", description: "HH:MM" },
          sport: { type: "string", description: "identifiant du sport si type = sport" },
          examen_id: { type: "string" },
          tache_id: { type: "string" },
        },
        required: ["titre", "categorie", "type", "date", "debut", "fin"],
      },
      execute: (i) => {
        const data = d();
        const date = str(i.date);
        const start = hhmm(i.debut);
        const end = hhmm(i.fin);
        if (!isValidISO(date) || start === undefined || end === undefined || end <= start) throw new Error("date ou horaires invalides");
        const kind = (str(i.type) || "autre") as EventKind;
        const ev: CalEvent = {
          id: uid("e"),
          title: str(i.titre) || "Activité",
          category: (str(i.categorie) || "perso") as Category,
          kind,
          date,
          start,
          end,
          sport: kind === "sport" ? str(i.sport) || data.settings.sports[0]?.id : undefined,
          examId: str(i.examen_id) || undefined,
          taskId: str(i.tache_id) || undefined,
          status: ["sport", "revision", "tache"].includes(kind) ? "prevu" : undefined,
          origin: "manuel",
        };
        ev.placeId = placeOf(data, { ...ev, key: ev.id });
        const problems = conflictsWith(data, { ...ev, key: ev.id });
        if (problems.length) throw new Error(`conflit : ${problems.join(" ")}`);
        sink({
          id: ev.id,
          label: `Ajouter « ${ev.title} »`,
          detail: `${fmtDateShort(date)} ${fmtTime(start)}–${fmtTime(end)}`,
          apply: () => {
            upsert("events", ev);
            repairAround();
          },
        });
        return "Proposition enregistrée (l'utilisateur doit la valider).";
      },
    },
    {
      name: "proposer_deplacement",
      description: "Propose de déplacer une activité existante (clé entre crochets dans le planning). Refusée si le nouveau créneau crée un conflit.",
      inputSchema: {
        type: "object",
        properties: { cle: { type: "string" }, date: { type: "string" }, debut: { type: "string" }, fin: { type: "string" } },
        required: ["cle", "date", "debut", "fin"],
      },
      execute: (i) => {
        const data = d();
        const occ = occByKey(data, str(i.cle));
        if (!occ) throw new Error("clé introuvable");
        const date = str(i.date);
        const start = hhmm(i.debut);
        const end = hhmm(i.fin);
        if (!isValidISO(date) || start === undefined || end === undefined || end <= start) throw new Error("date ou horaires invalides");
        const moved = { ...occ, date, start, end };
        const problems = conflictsWith(data, moved);
        if (problems.length) throw new Error(`conflit : ${problems.join(" ")}`);
        sink({
          id: uid("p"),
          label: `Déplacer « ${occ.title} »`,
          detail: `${fmtDateShort(occ.date)} ${fmtTime(occ.start)} → ${fmtDateShort(date)} ${fmtTime(start)}–${fmtTime(end)}`,
          apply: () => moveOccurrence(occ.key, date, start, end),
        });
        return "Proposition enregistrée.";
      },
    },
    {
      name: "proposer_suppression",
      description: "Propose de retirer une activité (ex. séance ou bloc de travail à annuler). Pour un cours récurrent, seule cette date est annulée.",
      inputSchema: { type: "object", properties: { cle: { type: "string" }, raison: { type: "string" } }, required: ["cle"] },
      execute: (i) => {
        const occ = occByKey(d(), str(i.cle));
        if (!occ) throw new Error("clé introuvable");
        sink({
          id: uid("p"),
          label: `Retirer « ${occ.title} »`,
          detail: `${fmtDateShort(occ.date)} ${fmtTime(occ.start)}${i.raison ? ` · ${str(i.raison)}` : ""}`,
          apply: () => deleteOccurrence(occ.key),
        });
        return "Proposition enregistrée.";
      },
    },
    {
      name: "proposer_examen",
      description: "Propose d'enregistrer un examen avec le temps de révision nécessaire. Renvoie la répartition des révisions sur les jours disponibles.",
      inputSchema: {
        type: "object",
        properties: {
          titre: { type: "string" },
          date: { type: "string" },
          heures: { type: "number" },
          difficulte: { type: "number", description: "1 facile, 2 moyen, 3 difficile" },
        },
        required: ["titre", "date", "heures"],
      },
      execute: (i) => {
        const date = str(i.date);
        if (!isValidISO(date)) throw new Error("date invalide");
        const difficulty = (Math.min(3, Math.max(1, Math.round(Number(i.difficulte) || 2))) as 1 | 2 | 3);
        const hours = Math.max(0.5, Number(i.heures) || 4);
        const exam = { id: uid("x"), title: str(i.titre) || "Examen", date, kind: "examen" as const, difficulty, hoursNeeded: hours };
        const { plan, overflowMin } = distributeRevision(hours * 60, revisionDays(exam, today, nowMin < 20 * 60), { difficulty, examDate: date });
        sink({
          id: exam.id,
          label: `Enregistrer l'examen « ${exam.title} »`,
          detail: `${fmtDateShort(date)} · ${fmtDuration(hours * 60)} de révision à répartir`,
          apply: () => upsert("exams", exam),
        });
        return `Proposition enregistrée. Répartition possible : ${plan.map((p) => `${p.date} ${fmtDuration(p.minutes)}`).join(", ")}${overflowMin ? ` (${fmtDuration(overflowMin)} ne rentrent pas)` : ""}. Pour placer ces séances dans le planning, utilise proposer_ajout (type revision) sur des créneaux libres, ou planification_automatique après validation.`;
      },
    },
    {
      name: "proposer_report_tache",
      description: "Propose de reporter une tâche (nouvelle date limite, ou mise en attente si pas de date).",
      inputSchema: { type: "object", properties: { tache_id: { type: "string" }, nouvelle_date: { type: "string" } }, required: ["tache_id"] },
      execute: (i) => {
        const task = d().tasks[str(i.tache_id)];
        if (!task) throw new Error("tâche introuvable");
        const date = isValidISO(i.nouvelle_date) ? (i.nouvelle_date as string) : undefined;
        sink({
          id: uid("p"),
          label: `Reporter « ${task.title} »`,
          detail: date ? `nouvelle date limite : ${fmtDateShort(date)}` : "mise en attente",
          apply: () => {
            patch("tasks", task.id, date ? { deadline: date } : { status: "reporte" });
            const today0 = today;
            const blocks = Object.values(get().events).filter((e) => e.taskId === task.id && e.origin === "auto" && e.date >= today0 && e.status !== "fait");
            if (blocks.length) applyPlan({ remove: blocks.map((b) => b.id), add: [], unplaced: [], summary: [] }, false);
          },
        });
        return "Proposition enregistrée.";
      },
    },
    {
      name: "planification_automatique",
      description:
        "Lance le planificateur de Cap sur les 7 prochains jours (sport manquant, révisions réparties, tâches urgentes, temps libre protégé) et propose le résultat en un bloc. Renvoie le résumé et ce qui ne rentre pas.",
      inputSchema: { type: "object", properties: {} },
      execute: () => {
        const res = planSchedule(d(), { today, nowMin, mode: "full" });
        if (!res.add.length && !res.remove.length) return "Rien à changer : tout est déjà planifié.";
        sink({
          id: uid("p"),
          label: `Appliquer la planification automatique (${res.add.length} bloc${res.add.length > 1 ? "s" : ""})`,
          detail: res.summary.slice(0, 4).join(" · "),
          apply: () => applyPlan(res, false),
        });
        return `Proposition enregistrée.\nRésumé : ${res.summary.join(" ; ")}\nNe rentre pas : ${res.unplaced.map((u) => `${u.label} ${fmtDuration(u.minutes)} (${u.reason})`).join(" ; ") || "rien"}\nBlocs : ${res.add
          .slice(0, 20)
          .map((e) => `${e.date} ${fmtTime(e.start)}-${fmtTime(e.end)} ${e.title}`)
          .join(" ; ")}`;
      },
    },
  ];
}

/** Options de résolution d'un conflit, formulées pour l'assistant local. */
export function describeFixes(data: AppData, today: string, nowMin: number): string[] {
  const out: string[] = [];
  for (const date of weekDates(mondayOf(today))) {
    for (const c of buildFrame(data, date).conflicts) {
      const fixes = conflictFixes(data, c, today, nowMin);
      out.push(`${c.message} Solutions : ${fixes.map((f) => `${f.label.toLowerCase()} (${f.detail})`).join(" ; ") || "à régler à la main"}.`);
    }
  }
  return out;
}
