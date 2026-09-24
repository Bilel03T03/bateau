// "Organiser ma journée" : une chronologie réaliste construite à partir du vrai
// planning (réveil, trajets, cours/travail, repas, sport, révisions, temps libre).

import { addDays, fmtDuration, fmtTime } from "../lib/date";
import type { AppData, CalEvent, Category } from "../lib/types";
import { energyFor } from "./energy";
import { buildFrame, subtractIntervals, type DayFrame } from "./frame";
import { planSchedule } from "./planner";

export interface TimelineItem {
  start: number;
  end?: number;
  label: string;
  detail?: string;
  type: "reveil" | "preparation" | "trajet" | "evenement" | "repas" | "focus" | "libre" | "sommeil";
  category?: Category;
  key?: string;
  proposal?: boolean;
}

export interface DayPlan {
  date: string;
  items: TimelineItem[];
  proposals: CalEvent[];
  /** Blocs automatiques existants que la proposition remplace. */
  replaces: string[];
  notes: string[];
  frame: DayFrame;
}

export function buildDayPlan(data: AppData, date: string, today: string, nowMin: number, withProposals = true): DayPlan {
  const s = data.settings;
  const plan = withProposals ? planSchedule(data, { mode: "day", day: date, today, nowMin }) : undefined;
  const proposals = plan?.add ?? [];
  const work: AppData = { ...data, events: { ...data.events } };
  // Les anciens blocs automatiques de la journée sont remplacés par la nouvelle proposition.
  for (const id of plan?.remove ?? []) delete work.events[id];
  for (const p of proposals) work.events[p.id] = p;
  const frame = buildFrame(work, date);
  const place = (id?: string) => (id && data.places[id]?.name) || "domicile";

  const items: TimelineItem[] = [];
  items.push({ start: frame.wake, label: "Réveil", type: "reveil" });
  items.push({ start: frame.wake, end: frame.ready, label: "Petit-déjeuner et préparation", type: "preparation" });

  for (const l of frame.legs) {
    items.push({
      start: l.start,
      end: l.end,
      label: `Trajet vers ${place(l.to)}`,
      detail: fmtDuration(l.minutes),
      type: "trajet",
    });
  }
  for (const o of frame.occs) {
    const isFocus = o.kind === "revision" || o.kind === "tache";
    const detail = [o.room && `salle ${o.room}`, o.teacher, isFocus && fmtDuration(o.end - o.start)].filter(Boolean).join(" · ");
    items.push({
      start: o.start,
      end: o.end,
      label: o.title,
      detail: detail || undefined,
      type: o.kind === "libre" ? "libre" : isFocus ? "focus" : "evenement",
      category: o.category,
      key: o.key,
      proposal: !!o.pending,
    });
  }
  if (frame.lunch) {
    items.push({
      start: frame.lunch.start,
      end: frame.lunch.onSite ? undefined : frame.lunch.end,
      label: frame.lunch.onSite ? "Déjeuner sur place" : "Déjeuner",
      detail: frame.lunch.onSite ? `pendant « ${frame.lunch.onSite} » : prévois-le` : undefined,
      type: "repas",
    });
  }
  if (frame.awayMin >= 8 * 60 && frame.firstDeparture !== undefined) {
    items.push({ start: 16 * 60, label: "Collation", detail: "longue journée dehors : pense à prendre quelque chose", type: "repas" });
  }
  if (frame.dinner) {
    items.push({ start: frame.dinner.start, end: frame.dinner.end, label: "Dîner", type: "repas" });
  }

  // Temps libre : ce qui reste entre les blocs, à partir de 30 min.
  const taken = items.filter((i) => i.end !== undefined && i.type !== "libre").map((i) => ({ start: i.start, end: i.end! }));
  for (const g of subtractIntervals({ start: frame.ready, end: frame.bed - s.windDownMin }, taken)) {
    if (g.end - g.start >= 30) items.push({ start: g.start, end: g.end, label: "Temps libre", detail: fmtDuration(g.end - g.start), type: "libre" });
  }
  items.push({ start: frame.bed - s.windDownMin, end: frame.bed, label: "Préparation sommeil", detail: "écrans coupés, affaires prêtes", type: "sommeil" });
  items.push({ start: frame.bed, label: "Coucher", type: "sommeil" });

  items.sort((a, b) => a.start - b.start || order(a) - order(b));

  const notes: string[] = [];
  const energy = energyFor(work, date);
  if (energy.tired) notes.push(`Journée allégée (${energy.reasons.join(", ")}) : moins de travail perso prévu.`);
  for (const c of frame.conflicts) notes.push(`⚠️ ${c.message}`);
  if (frame.lunch?.onSite) notes.push(`Déjeuner à prévoir : tu es pris par « ${frame.lunch.onSite} » à midi.`);
  const next = buildFrame(work, addDays(date, 1), { skipNextDay: true });
  if (next.firstDeparture !== undefined && next.firstDeparture < 8 * 60) {
    notes.push(`Demain, départ à ${fmtTime(next.firstDeparture)} : coucher conseillé vers ${fmtTime(frame.bed)}.`);
  }
  if (!proposals.length && withProposals) notes.push("Rien à ajouter : ta journée est déjà bien remplie ou tout est à jour.");
  return { date, items, proposals, replaces: plan?.remove ?? [], notes, frame };
}

function order(i: TimelineItem): number {
  return ["reveil", "preparation", "trajet", "evenement", "repas", "focus", "libre", "sommeil"].indexOf(i.type);
}
