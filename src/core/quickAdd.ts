// Ajout rapide en langage naturel, sans IA : on reconnaît la date, l'heure,
// la durée, la priorité, la catégorie et la matière dans une phrase comme
// « Préparer présentation stratégie commerciale vendredi ».

import { addDays, addMonths, diffDays, isValidISO, weekday } from "../lib/date";
import type { Category, EventKind, Priority, Subject, TaskType } from "../lib/types";

export interface ParsedEntry {
  kind: "tache" | "evenement" | "examen";
  title: string;
  category: Category;
  date?: string;
  start?: number;
  end?: number;
  estimateMin: number;
  priority: Priority;
  type?: TaskType;
  eventKind?: EventKind;
  subjectId?: string;
  sport?: string;
  /** Indique si chaque champ vient du texte (true) ou d'une estimation. */
  explicit: { date: boolean; time: boolean; duration: boolean; priority: boolean; category: boolean };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'");

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const KEYWORDS: Record<Category, string[]> = {
  ecole: [
    "perrimond", "cours", "devoir", "dm", "td", "tp", "expose", "presentation", "oral", "soutenance", "partiel", "examen",
    "exam", "controle", "revis", "memoire", "dossier", "fiche", "lecture", "prof", "groupe", "bts", "bachelor", "master",
    "etude de cas", "cas pratique", "rapport", "mooc", "note de synthese", "quiz", "bibliotheque",
  ],
  auchan: [
    "auchan", "magasin", "rayon", "inventaire", "manager", "responsable", "tuteur", "tutrice", "mission", "commande",
    "caisse", "client", "fournisseur", "merch", "implantation", "balisage", "promo", "stock", "equipe", "planning auchan",
    "reunion d'equipe", "chef de rayon", "entretien annuel", "kpi", "chiffre d'affaires", "reappro", "facing",
  ],
  sport: ["crossfit", "squash", "sport", "seance", "wod", "muscu", "running", "footing", "salle de sport", "box"],
  perso: [
    "rdv", "medecin", "dentiste", "banque", "caf", "impot", "courses", "acheter", "anniversaire", "famille", "amis",
    "facture", "loyer", "assurance", "mutuelle", "papiers", "pass navigo", "abonnement", "coiffeur", "passeport",
  ],
};

const TYPE_RULES: { re: RegExp; type: TaskType; minutes: number; kind?: "examen" }[] = [
  { re: /\b(examen|exam|partiel|controle|ds|evaluation)\b/, type: "examen", minutes: 300, kind: "examen" },
  { re: /\b(presentation|expose|oral|soutenance|pitch)\b/, type: "oral", minutes: 180 },
  { re: /\b(memoire|rapport|dossier|note de synthese)\b/, type: "document", minutes: 240 },
  { re: /\b(groupe|binome|equipe projet)\b/, type: "groupe", minutes: 120 },
  { re: /\b(projet)\b/, type: "projet", minutes: 240 },
  { re: /\b(devoir|dm|td|tp|exercice|etude de cas|cas pratique|quiz)\b/, type: "devoir", minutes: 120 },
  { re: /\b(demander|poser la question|voir avec (mon|ma) (responsable|manager|tuteur|tutrice))\b/, type: "demande", minutes: 10 },
  { re: /\b(apprendre|formation|se former|comprendre)\b/, type: "apprentissage", minutes: 60 },
  { re: /\b(mission|inventaire|implantation|balisage|commande)\b/, type: "mission", minutes: 90 },
  { re: /\b(reunion)\b/, type: "reunion", minutes: 30 },
  { re: /\b(envoyer|mail|appeler|telephoner|imprimer|poster)\b/, type: "autre", minutes: 15 },
  { re: /\b(acheter|courses)\b/, type: "autre", minutes: 30 },
  { re: /\b(lire|lecture|fiche|revoir)\b/, type: "autre", minutes: 60 },
];

interface Span {
  start: number;
  end: number;
}

function removeSpans(text: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of sorted) out = out.slice(0, s.start) + " " + out.slice(s.end);
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "")
    .replace(/(^|\s)(pour|avant|d'ici|le|la|de|a|à|pendant|en|vers|ce|cette)\s*$/i, "")
    .trim();
}

export function parseQuickAdd(input: string, today: string, subjects: Subject[] = [], sports: { id: string; name: string }[] = []): ParsedEntry {
  const raw = input.trim();
  const n = norm(raw);
  const spans: Span[] = [];
  const mark = (m: RegExpExecArray | null, extra = 0) => {
    if (m) spans.push({ start: m.index, end: m.index + m[0].length + extra });
  };

  // ----- Date -----
  let date: string | undefined;
  let m: RegExpExecArray | null;
  // « vendredi » = le prochain vendredi (dans 7 jours si on est vendredi).
  const nextWeekday = (idx: number) => {
    let delta = idx + 1 - weekday(today);
    if (delta <= 0) delta += 7;
    return addDays(today, delta);
  };
  if ((m = /\b(aujourd'hui|ce soir|ce matin|cet apres-midi|tout a l'heure)\b/.exec(n))) {
    date = today;
    mark(m);
  } else if ((m = /\bapres-demain\b/.exec(n))) {
    date = addDays(today, 2);
    mark(m);
  } else if ((m = /\bdemain( matin| soir| apres-midi)?\b/.exec(n))) {
    date = addDays(today, 1);
    mark(m);
  } else if ((m = /\bdans (\d+|un|une|deux|trois) (jours?|semaines?)\b/.exec(n))) {
    const words: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3 };
    const q = words[m[1]] ?? Number(m[1]);
    date = addDays(today, m[2].startsWith("semaine") ? q * 7 : q);
    mark(m);
  } else if ((m = /\b(la )?semaine prochaine\b/.exec(n))) {
    date = addDays(today, 7 - weekday(today) + 5); // vendredi prochain
    mark(m);
  } else if ((m = /\b(ce |cette )?(fin de semaine|week-end|weekend)\b/.exec(n))) {
    date = addDays(today, 7 - weekday(today));
    mark(m);
  } else if ((m = /\bfin du mois\b/.exec(n))) {
    date = addDays(addMonths(today.slice(0, 8) + "01", 1), -1);
    mark(m);
  } else if ((m = /\b(le |pour le |avant le )?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(n))) {
    const d = Number(m[2]);
    const mo = Number(m[3]);
    let y = m[4] ? Number(m[4].length === 2 ? "20" + m[4] : m[4]) : Number(today.slice(0, 4));
    let iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!m[4] && isValidISO(iso) && diffDays(today, iso) < -30) {
      y += 1;
      iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    if (isValidISO(iso) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      date = iso;
      mark(m);
    }
  } else if ((m = new RegExp(`\\b(le |pour le |avant le )?(${DAYS.join("|")} )?(\\d{1,2}|1er) (${MONTHS.join("|")})\\b`).exec(n))) {
    const d = m[3] === "1er" ? 1 : Number(m[3]);
    const mo = MONTHS.indexOf(m[4]) + 1;
    let y = Number(today.slice(0, 4));
    let iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (diffDays(today, iso) < -30) iso = `${y + 1}-${iso.slice(5)}`;
    date = iso;
    mark(m);
  } else if ((m = new RegExp(`\\b(ce |cette |pour |avant |d'ici |le )?(${DAYS.join("|")})( prochain| d'apres)?\\b`).exec(n))) {
    const idx = DAYS.indexOf(m[2]);
    date = nextWeekday(idx);
    if (m[3]?.includes("apres")) date = addDays(date, 7);
    mark(m);
  } else if ((m = /\b(le |pour le )(\d{1,2}|1er)\b/.exec(n))) {
    const d = m[2] === "1er" ? 1 : Number(m[2]);
    let iso = `${today.slice(0, 8)}${String(d).padStart(2, "0")}`;
    if (iso < today) iso = addMonths(iso, 1);
    if (isValidISO(iso)) {
      date = iso;
      mark(m);
    }
  }

  // ----- Heure et durée -----
  let start: number | undefined;
  let end: number | undefined;
  let duration: number | undefined;
  const hm = (h: string, mi?: string) => Number(h) * 60 + (mi ? Number(mi) : 0);
  if ((m = /\b(?:de |entre )?(\d{1,2})\s*[h:](\d{2})?\s*(?:-|a|à|et|→)\s*(\d{1,2})\s*[h:](\d{2})?\b/.exec(n))) {
    start = hm(m[1], m[2]);
    end = hm(m[3], m[4]);
    mark(m);
  } else if ((m = /\b(?:a |à |vers |des )?(\d{1,2})\s*[h:](\d{2})?\b(?! ?min)/.exec(n))) {
    const h = Number(m[1]);
    const isDurationWord = /\b(pendant|duree|en|environ|~)\s*$/.test(n.slice(0, m.index));
    const hasPrep = /^(a|à|vers|des) /.test(m[0]);
    if (!isDurationWord && (hasPrep || h >= 7) && h <= 23) {
      start = hm(m[1], m[2]);
      mark(m);
    } else {
      duration = hm(m[1], m[2]);
      mark(m);
    }
  }
  if ((m = /\b(?:pendant |duree |environ |~ ?)?(\d{1,3})\s*(?:min|minutes|mn)\b/.exec(n))) {
    duration = Number(m[1]);
    mark(m);
  } else if (duration === undefined && (m = /\b(?:pendant|duree|environ|~)\s*(\d{1,2})\s*h(\d{2})?\b/.exec(n))) {
    duration = hm(m[1], m[2]);
    mark(m);
  }
  if (start !== undefined && end === undefined && duration) end = start + duration;

  // ----- Priorité -----
  let priority: Priority | undefined;
  if ((m = /\b(urgent|urgente|asap|au plus vite)\b|!!/.exec(n))) {
    priority = "urgente";
    mark(m);
  } else if ((m = /\b(important|importante|prioritaire)\b|!/.exec(n))) {
    priority = "importante";
    mark(m);
  } else if ((m = /\b(si possible|un jour|pas presse|quand j'ai le temps)\b/.exec(n))) {
    priority = "faible";
    mark(m);
  }
  const priorityExplicit = !!priority;

  // ----- Catégorie, matière, sport -----
  let category: Category | undefined;
  let subjectId: string | undefined;
  for (const sub of subjects) {
    const key = norm(sub.name);
    if (key.length >= 3 && n.includes(key)) {
      subjectId = sub.id;
      category = "ecole";
      break;
    }
  }
  let sport: string | undefined;
  for (const sp of sports) {
    if (n.includes(norm(sp.name))) {
      sport = sp.id;
      category = "sport";
    }
  }
  const has = (cat: Category) => KEYWORDS[cat].some((k) => new RegExp(`\\b${k}`).test(n));
  const explicitCategory = !!category || (["auchan", "ecole", "sport", "perso"] as Category[]).some(has);
  if (!category) {
    if (has("auchan")) category = "auchan";
    else if (has("sport")) category = "sport";
    else if (has("ecole")) category = "ecole";
    else if (has("perso")) category = "perso";
    else category = "perso";
  }

  // ----- Type et estimation -----
  let type: TaskType | undefined;
  let estimate = 60;
  let isExam = false;
  for (const rule of TYPE_RULES) {
    if (rule.re.test(n)) {
      type = rule.type;
      estimate = rule.minutes;
      isExam = rule.kind === "examen";
      break;
    }
  }
  if (type && category === "auchan" && type === "oral") estimate = 120;

  const title0 = removeSpans(raw, spans.map((sp) => mapSpan(raw, n, sp)));
  const title = title0 ? title0.charAt(0).toUpperCase() + title0.slice(1) : raw;

  // Un horaire + une date = un événement (rendez-vous, séance, réunion).
  let kind: ParsedEntry["kind"] = "tache";
  let eventKind: EventKind | undefined;
  if (isExam && date && start === undefined) kind = "examen";
  else if (start !== undefined && date) {
    kind = "evenement";
    eventKind =
      category === "sport" ? "sport" : isExam ? "examen" : type === "reunion" ? "reunion" : category === "ecole" ? "cours" : category === "auchan" ? "travail" : "rdv";
    if (type === "reunion" || /\b(reunion|point|entretien)\b/.test(n)) eventKind = "reunion";
    if (end === undefined) end = start + (category === "sport" ? 75 : eventKind === "reunion" ? 60 : 60);
  }

  if (!priority) {
    const days = date ? diffDays(today, date) : 99;
    if (days <= 1) priority = "urgente";
    else if (days <= 3 && (type === "oral" || type === "document" || type === "examen" || estimate >= 120)) priority = "importante";
    else if (days <= 7 && (type === "oral" || type === "examen")) priority = "importante";
    else priority = "normale";
  }

  return {
    kind,
    title,
    category,
    date,
    start,
    end,
    estimateMin: duration ?? estimate,
    priority,
    type,
    eventKind,
    subjectId,
    sport,
    explicit: {
      date: !!date,
      time: start !== undefined,
      duration: duration !== undefined,
      priority: priorityExplicit,
      category: explicitCategory,
    },
  };
}

// La version normalisée garde la même longueur que l'original (NFD retire des
// caractères combinants), donc on recalcule les positions caractère par caractère.
function mapSpan(raw: string, normalized: string, span: Span): Span {
  if (raw.length === normalized.length) return span;
  const map: number[] = [];
  let j = 0;
  for (let i = 0; i < raw.length; i++) {
    const piece = norm(raw[i]);
    for (let k = 0; k < piece.length; k++) map[j++] = i;
  }
  map[j] = raw.length;
  return { start: map[span.start] ?? span.start, end: map[span.end] ?? raw.length };
}
