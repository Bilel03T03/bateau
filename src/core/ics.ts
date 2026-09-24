// Import d'un fichier calendrier (.ics : Google Agenda, Outlook, école…).
// Les doublons (même jour, même heure, titre proche) sont ignorés.

import { addDays, toISO } from "../lib/date";
import { uid } from "../lib/meta";
import type { AppData, CalEvent } from "../lib/types";
import { parseQuickAdd } from "./quickAdd";
import { occurrencesBetween } from "./schedule";

interface RawEvent {
  uid?: string;
  summary: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule?: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseDate(value: string, params: string): { date: Date; allDay: boolean } {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    return { date: new Date(y, m - 1, d), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return { date: new Date(NaN), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)))
    : new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  return { date, allDay: false };
}

const unescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

export function parseIcs(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: Partial<RawEvent> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.start && cur.summary !== undefined) {
        out.push({
          uid: cur.uid,
          summary: cur.summary || "Sans titre",
          location: cur.location,
          start: cur.start,
          end: cur.end ?? new Date(cur.start.getTime() + 3600_000),
          allDay: !!cur.allDay,
          rrule: cur.rrule,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const head = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const [name, ...params] = head.split(";");
      const p = params.join(";");
      if (name === "UID") cur.uid = value;
      else if (name === "SUMMARY") cur.summary = unescape(value);
      else if (name === "LOCATION") cur.location = unescape(value);
      else if (name === "RRULE") cur.rrule = value;
      else if (name === "DTSTART") {
        const r = parseDate(value, p);
        cur.start = r.date;
        cur.allDay = r.allDay;
      } else if (name === "DTEND") cur.end = parseDate(value, p).date;
    }
  }
  return out.filter((e) => !Number.isNaN(e.start.getTime()));
}

/** Développe les répétitions hebdomadaires simples (au plus 6 mois). */
function expand(e: RawEvent): RawEvent[] {
  if (!e.rrule || !/FREQ=WEEKLY/.test(e.rrule)) return [e];
  const count = Number(/COUNT=(\d+)/.exec(e.rrule)?.[1] ?? 0);
  const interval = Number(/INTERVAL=(\d+)/.exec(e.rrule)?.[1] ?? 1);
  const untilRaw = /UNTIL=([0-9TZ]+)/.exec(e.rrule)?.[1];
  const until = untilRaw ? parseDate(untilRaw, "").date : new Date(e.start.getTime() + 183 * 86400_000);
  const out: RawEvent[] = [];
  for (let i = 0; i < 200; i++) {
    if (count && i >= count) break;
    const shift = i * interval * 7 * 86400_000;
    const start = new Date(e.start.getTime() + shift);
    if (start > until) break;
    out.push({ ...e, start, end: new Date(e.end.getTime() + shift), uid: `${e.uid ?? e.summary}#${i}` });
  }
  return out;
}

const simplify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export interface IcsImport {
  events: CalEvent[];
  duplicates: number;
  skipped: number;
}

export function icsToEvents(text: string, data: AppData, today: string): IcsImport {
  const raws = parseIcs(text).flatMap(expand);
  const subjects = Object.values(data.subjects);
  const events: CalEvent[] = [];
  let duplicates = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const minDate = addDays(today, -60);
  for (const r of raws) {
    if (r.allDay) {
      skipped++;
      continue;
    }
    const date = toISO(r.start);
    if (date < minDate) {
      skipped++;
      continue;
    }
    const start = r.start.getHours() * 60 + r.start.getMinutes();
    let end = r.end.getHours() * 60 + r.end.getMinutes();
    if (toISO(r.end) !== date) end = 24 * 60;
    const key = `${date}|${start}|${simplify(r.summary)}`;
    const importKey = r.uid ? `${r.uid}@${date}` : key;
    const existing = occurrencesBetween(data, date, date).some(
      (o) =>
        o.importKey === importKey ||
        (o.start === start && (simplify(o.title) === simplify(r.summary) || simplify(o.title).includes(simplify(r.summary)) || simplify(r.summary).includes(simplify(o.title)))),
    );
    if (existing || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    const guess = parseQuickAdd(`${r.summary} ${r.location ?? ""}`, today, subjects);
    const kind = guess.category === "ecole" ? "cours" : guess.category === "auchan" ? "travail" : guess.category === "sport" ? "sport" : "rdv";
    events.push({
      id: uid("i"),
      title: r.summary,
      category: guess.category,
      kind: guess.eventKind && guess.eventKind !== "rdv" ? guess.eventKind : kind,
      date,
      start,
      end: Math.max(end, start + 15),
      notes: r.location ? `Lieu : ${r.location}` : undefined,
      subjectId: guess.subjectId,
      origin: "import",
      importKey,
      status: kind === "sport" ? "prevu" : undefined,
    });
  }
  return { events, duplicates, skipped };
}
