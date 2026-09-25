// Export vers l'agenda du téléphone (.ics) : le téléphone se charge alors des
// rappels, même application fermée. Réimporter le fichier met à jour les
// événements (identifiants stables) au lieu de les dupliquer.

import { addDays } from "../lib/date";
import type { AppData } from "../lib/types";
import { buildFrame } from "./frame";
import { occurrencesBetween } from "./schedule";

const pad = (n: number) => String(n).padStart(2, "0");

function stamp(date: string, minutes: number): string {
  const m = Math.min(minutes, 24 * 60 - 1);
  return `${date.replace(/-/g, "")}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Replie les lignes à 74 caractères comme l'exige le format. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(data: AppData, from: string, days = 28, nowStamp = new Date()): string {
  const to = addDays(from, days - 1);
  const dtstamp = `${nowStamp.getUTCFullYear()}${pad(nowStamp.getUTCMonth() + 1)}${pad(nowStamp.getUTCDate())}T${pad(nowStamp.getUTCHours())}${pad(nowStamp.getUTCMinutes())}00Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cap//Tableau de bord//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Cap"];
  const place = (id?: string) => (id ? data.places[id]?.name : undefined);

  // Heure de départ de chaque activité avec trajet, pour une alarme « pars maintenant ».
  const departure = new Map<string, { minutes: number; from?: string }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const leg of buildFrame(data, d, { skipNextDay: true }).legs) {
      if (leg.toKey) departure.set(leg.toKey, { minutes: leg.minutes, from: place(leg.from) });
    }
  }

  for (const o of occurrencesBetween(data, from, to, { includePending: false })) {
    if (o.status === "manque") continue;
    const leg = departure.get(o.key);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${o.key.replace(/[^A-Za-z0-9@._-]/g, "-")}@cap`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(o.date, o.start)}`,
      `DTEND:${stamp(o.date, o.end)}`,
      `SUMMARY:${escapeText(o.title)}`,
    );
    const loc = place(o.placeId);
    if (loc) lines.push(`LOCATION:${escapeText(loc)}`);
    const desc = [o.room && `Salle ${o.room}`, o.teacher, o.notes].filter(Boolean).join(" · ");
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    if (o.kind !== "libre") {
      const before = leg ? leg.minutes : o.kind === "revision" || o.kind === "tache" ? 5 : 15;
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(leg ? `Pars maintenant : ${o.title} à ${pad(Math.floor(o.start / 60))}h${pad(o.start % 60)}` : o.title)}`,
        `TRIGGER:-PT${before}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  // Échéances : un événement sur la journée, rappel la veille à 18 h.
  const deadlines: { id: string; date: string; title: string }[] = [
    ...Object.values(data.tasks)
      .filter((t) => t.deadline && t.status !== "termine" && t.deadline >= from && t.deadline <= to)
      .map((t) => ({ id: `t-${t.id}`, date: t.deadline!, title: `📌 ${t.title}` })),
    ...Object.values(data.exams)
      .filter((x) => x.date >= from && x.date <= to)
      .map((x) => ({ id: `x-${x.id}`, date: x.date, title: `📝 ${x.title}` })),
    ...Object.values(data.reminders)
      .filter((r) => !r.done && r.dueDate && r.dueDate >= from && r.dueDate <= to)
      .map((r) => ({ id: `r-${r.id}`, date: r.dueDate!, title: `🗂️ ${r.title}` })),
  ];
  for (const dl of deadlines) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${dl.id.replace(/[^A-Za-z0-9@._-]/g, "-")}@cap`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dl.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(dl.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${escapeText(dl.title)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Demain : ${dl.title}`)}`,
      "TRIGGER:-PT6H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
