// Préférences propres à cet appareil (jamais synchronisées) : thème, clé API,
// rappels déjà vus. La clé API ne quitte jamais ce navigateur.

export interface DevicePrefs {
  theme: "auto" | "clair" | "sombre";
  apiKey: string;
  model: string;
  notifications: boolean;
  dismissed: Record<string, string>;
  notified: Record<string, number>;
  lastPlanningView: "jour" | "semaine" | "mois";
}

const KEY = "cap:device:v1";

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (le plus capable)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (plus économique)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (le plus rapide)" },
];

const DEFAULTS: DevicePrefs = {
  theme: "auto",
  apiKey: "",
  model: "claude-opus-5",
  notifications: false,
  dismissed: {},
  notified: {},
  lastPlanningView: "semaine",
};

export function loadDevice(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDevice(p: DevicePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible */
  }
}
