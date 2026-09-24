import { addDays, mondayOf, todayISO } from "../lib/date";
import type { AppData, Place, Route, Settings } from "../lib/types";

export const HOME_ID = "p-domicile";

export function defaultPlaces(): Record<string, Place> {
  const list: Place[] = [
    { id: HOME_ID, name: "Domicile", kind: "domicile" },
    { id: "p-perrimond", name: "Perrimond", kind: "ecole" },
    { id: "p-auchan", name: "Auchan", kind: "travail" },
    { id: "p-box", name: "Box CrossFit", kind: "sport" },
    { id: "p-squash", name: "Club de squash", kind: "sport" },
  ];
  return Object.fromEntries(list.map((p) => [p.id, p]));
}

export function defaultRoutes(): Record<string, Route> {
  const list: [string, string, number][] = [
    [HOME_ID, "p-perrimond", 40],
    [HOME_ID, "p-auchan", 25],
    [HOME_ID, "p-box", 15],
    [HOME_ID, "p-squash", 20],
    ["p-perrimond", "p-box", 35],
    ["p-perrimond", "p-squash", 30],
    ["p-auchan", "p-box", 20],
    ["p-auchan", "p-squash", 30],
  ];
  return Object.fromEntries(list.map(([from, to, minutes]) => [`r-${from}-${to}`, { id: `r-${from}-${to}`, from, to, minutes }]));
}

export function defaultSettings(today = todayISO()): Settings {
  return {
    name: "",
    homePlaceId: HOME_ID,
    wakeTime: 7 * 60,
    bedTime: 23 * 60,
    sleepTargetMin: 7 * 60 + 30,
    morningRoutineMin: 45,
    windDownMin: 30,
    lunch: { start: 11 * 60 + 45, end: 14 * 60, duration: 45 },
    dinner: { start: 19 * 60, end: 21 * 60, duration: 45 },
    maxFocus: { cours: 90, travail: 60, libre: 180 },
    focusBlockMin: 45,
    noFocusAfter: 21 * 60 + 30,
    minFreeMin: 90,
    freeEvenings: [6],
    bufferMin: 10,
    sports: [
      {
        id: "crossfit",
        name: "CrossFit",
        perWeek: 2,
        durationMin: 60,
        placeId: "p-box",
        slots: [
          ...[1, 2, 3, 4, 5].flatMap((weekday) => [
            { weekday, start: 7 * 60 },
            { weekday, start: 18 * 60 + 30 },
            { weekday, start: 19 * 60 + 30 },
          ]),
          { weekday: 6, start: 10 * 60 },
          { weekday: 7, start: 10 * 60 },
        ],
      },
      { id: "squash", name: "Squash", perWeek: 1, durationMin: 60, placeId: "p-squash", slots: [] },
    ],
    alternance: {
      // La semaine prochaine est une semaine d'école, puis 3 semaines chez Auchan.
      anchorMonday: addDays(mondayOf(today), 7),
      pattern: ["ecole", "entreprise", "entreprise", "entreprise"],
      overrides: {},
    },
    onboarded: false,
  };
}

export function emptyData(today = todayISO()): AppData {
  return {
    version: 1,
    settings: defaultSettings(today),
    places: defaultPlaces(),
    routes: defaultRoutes(),
    subjects: {},
    recurring: {},
    events: {},
    tasks: {},
    exams: {},
    sleep: {},
    meals: {},
    goals: {},
    reminders: {},
    reviews: {},
  };
}

/** Complète des données anciennes ou partielles avec les valeurs par défaut. */
export function normalizeData(input: Partial<AppData> | null | undefined, today = todayISO()): AppData {
  const base = emptyData(today);
  if (!input) return base;
  const settings = { ...base.settings, ...(input.settings ?? {}) };
  settings.alternance = { ...base.settings.alternance, ...(input.settings?.alternance ?? {}) };
  settings.maxFocus = { ...base.settings.maxFocus, ...(input.settings?.maxFocus ?? {}) };
  return {
    version: 1,
    settings,
    places: input.places && Object.keys(input.places).length ? input.places : base.places,
    routes: input.routes ?? base.routes,
    subjects: input.subjects ?? {},
    recurring: input.recurring ?? {},
    events: input.events ?? {},
    tasks: input.tasks ?? {},
    exams: input.exams ?? {},
    sleep: input.sleep ?? {},
    meals: input.meals ?? {},
    goals: input.goals ?? {},
    reminders: input.reminders ?? {},
    reviews: input.reviews ?? {},
  };
}
