// Petites fonctions de dates, sans dépendance. Les calculs de jours passent par
// UTC pour ne pas être perturbés par les changements d'heure.

export const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const DAY_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
export const DAY_LETTER = ["L", "M", "M", "J", "V", "S", "D"];
export const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s));
}

export function addDays(iso: string, n: number): string {
  return fromUtc(utc(iso) + n * DAY_MS);
}

/** Nombre de jours de a vers b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** 1 = lundi … 7 = dimanche */
export function weekday(iso: string): number {
  const d = new Date(utc(iso)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - weekday(iso));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function firstOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(day)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Semaines (lundi → dimanche) couvrant le mois de la date donnée. */
export function monthGrid(iso: string): string[][] {
  const first = firstOfMonth(iso);
  const [y, m] = first.split("-").map(Number);
  const last = `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
  const weeks: string[][] = [];
  for (let mon = mondayOf(first); mon <= last; mon = addDays(mon, 7)) weeks.push(weekDates(mon));
  return weeks;
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** 510 → "08h30" */
export function fmtTime(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}h${pad(m % 60)}`;
}

/** 510 → "08:30" (champs de formulaire) */
export function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function fromHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 80 → "1 h 20", 45 → "45 min", 120 → "2 h" */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}

/** 90 → "1,5 h" pour les statistiques */
export function fmtHours(min: number): string {
  const h = min / 60;
  const s = h >= 10 || Number.isInteger(h) ? String(Math.round(h)) : h.toFixed(1).replace(".", ",");
  return `${s} h`;
}

export function fmtDateLong(iso: string): string {
  const d = parseISO(iso);
  return `${DAY_NAMES[weekday(iso) - 1]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDateShort(iso: string): string {
  const d = parseISO(iso);
  return `${DAY_SHORT[weekday(iso) - 1]} ${d.getDate()}`;
}

export function fmtDayMonth(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export function fmtMonth(iso: string): string {
  const d = parseISO(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "aujourd'hui", "demain", "vendredi", "dans 12 jours", "hier", "il y a 3 jours" */
export function relativeDay(iso: string, today: string): string {
  const n = diffDays(today, iso);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  if (n === 2) return "après-demain";
  if (n < 0) return `il y a ${-n} jours`;
  if (n < 7) return DAY_NAMES[weekday(iso) - 1];
  return `dans ${n} jours`;
}

/** Numéro de semaine ISO 8601. */
export function isoWeek(iso: string): number {
  const thursday = addDays(mondayOf(iso), 3);
  const jan1 = thursday.slice(0, 4) + "-01-01";
  return Math.floor(diffDays(jan1, thursday) / 7) + 1;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function roundTo(min: number, step: number): number {
  return Math.round(min / step) * step;
}
