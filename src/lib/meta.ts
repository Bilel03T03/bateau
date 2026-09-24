import type {
  BlockStatus,
  Category,
  EventKind,
  MealMode,
  MealSlot,
  Priority,
  ReminderType,
  TaskStatus,
  TaskType,
  WeekType,
} from "./types";

export function uid(prefix = ""): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

export const CATEGORIES: Record<Category, { label: string; short: string; icon: string }> = {
  ecole: { label: "Perrimond", short: "École", icon: "🎓" },
  auchan: { label: "Auchan", short: "Alternance", icon: "💼" },
  sport: { label: "Sport", short: "Sport", icon: "🏋️" },
  perso: { label: "Personnel", short: "Perso", icon: "🙂" },
};

export const CATEGORY_ORDER: Category[] = ["ecole", "auchan", "sport", "perso"];

export const KINDS: Record<EventKind, { label: string; category: Category }> = {
  cours: { label: "Cours", category: "ecole" },
  examen: { label: "Examen", category: "ecole" },
  revision: { label: "Révision", category: "ecole" },
  travail: { label: "Travail", category: "auchan" },
  reunion: { label: "Réunion", category: "auchan" },
  sport: { label: "Sport", category: "sport" },
  rdv: { label: "Rendez-vous", category: "perso" },
  tache: { label: "Tâche", category: "perso" },
  libre: { label: "Temps libre", category: "perso" },
  autre: { label: "Autre", category: "perso" },
};

export const PRIORITIES: Record<Priority, { label: string; weight: number }> = {
  faible: { label: "Faible", weight: 1 },
  normale: { label: "Normale", weight: 2 },
  importante: { label: "Importante", weight: 3 },
  urgente: { label: "Urgente", weight: 4 },
};
export const PRIORITY_ORDER: Priority[] = ["urgente", "importante", "normale", "faible"];

export const STATUSES: Record<TaskStatus, { label: string }> = {
  a_faire: { label: "À faire" },
  en_cours: { label: "En cours" },
  termine: { label: "Terminé" },
  reporte: { label: "Reporté" },
};

export const BLOCK_STATUS: Record<BlockStatus, string> = {
  prevu: "Prévue",
  fait: "Effectuée",
  manque: "Manquée",
};

export const TASK_TYPES: Record<TaskType, { label: string; categories: Category[] }> = {
  devoir: { label: "Devoir", categories: ["ecole"] },
  examen: { label: "Examen", categories: ["ecole"] },
  groupe: { label: "Travail de groupe", categories: ["ecole"] },
  oral: { label: "Oral / présentation", categories: ["ecole", "auchan"] },
  projet: { label: "Projet", categories: ["ecole", "auchan", "perso"] },
  document: { label: "Document à rendre", categories: ["ecole", "auchan"] },
  mission: { label: "Mission", categories: ["auchan"] },
  demande: { label: "À demander au responsable", categories: ["auchan"] },
  apprentissage: { label: "À apprendre", categories: ["auchan", "ecole"] },
  reunion: { label: "Réunion à préparer", categories: ["auchan"] },
  autre: { label: "Autre", categories: ["ecole", "auchan", "sport", "perso"] },
};

export const REMINDER_TYPES: Record<ReminderType, string> = {
  administratif: "Démarche administrative",
  papier: "Papier à envoyer",
  rdv: "Rendez-vous",
  renouvellement: "Renouvellement",
  achat: "Achat important",
  facture: "Facture",
  abonnement: "Abonnement",
  ecole: "Démarche école",
  alternance: "Démarche alternance",
};

export const MEAL_SLOTS: Record<MealSlot, string> = {
  petit_dej: "Petit-déjeuner",
  dejeuner: "Déjeuner",
  collation: "Collation",
  diner: "Dîner",
};
export const MEAL_SLOT_ORDER: MealSlot[] = ["petit_dej", "dejeuner", "collation", "diner"];

export const MEAL_MODES: Record<MealMode, string> = {
  maison: "À la maison",
  prepare: "Préparé à l'avance",
  acheter: "À acheter",
  emporter: "À emporter",
  dehors: "Dehors / cantine",
};

export const WEEK_TYPES: Record<WeekType, { label: string; short: string }> = {
  ecole: { label: "Semaine école", short: "École" },
  entreprise: { label: "Semaine Auchan", short: "Auchan" },
  vacances: { label: "Congés", short: "Congés" },
};
