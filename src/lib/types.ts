// Modèle de données de Cap. Les heures sont stockées en minutes depuis minuit
// (ex. 8 h 30 = 510) et les dates au format "AAAA-MM-JJ" (heure locale).

export type Category = "ecole" | "auchan" | "sport" | "perso";

export type EventKind =
  | "cours"
  | "examen"
  | "travail"
  | "reunion"
  | "sport"
  | "rdv"
  | "revision"
  | "tache"
  | "libre"
  | "autre";

/** Type de semaine dans le rythme d'alternance. */
export type WeekType = "ecole" | "entreprise" | "vacances";

export type Priority = "faible" | "normale" | "importante" | "urgente";
export type TaskStatus = "a_faire" | "en_cours" | "termine" | "reporte";

/** État d'un bloc planifié (séance, révision, travail sur une tâche). */
export type BlockStatus = "prevu" | "fait" | "manque";

export interface Base {
  id: string;
  /** Donnée d'exemple : supprimable en un clic dans Paramètres. */
  demo?: boolean;
}

export interface Place extends Base {
  name: string;
  kind: "domicile" | "ecole" | "travail" | "sport" | "autre";
}

export interface Route extends Base {
  from: string;
  to: string;
  minutes: number;
}

export interface Subject extends Base {
  name: string;
  teacher?: string;
  room?: string;
}

export interface CalEvent extends Base {
  title: string;
  category: Category;
  kind: EventKind;
  date: string;
  start: number;
  end: number;
  placeId?: string;
  notes?: string;
  subjectId?: string;
  teacher?: string;
  room?: string;
  sport?: string;
  status?: BlockStatus;
  energyBefore?: number;
  fatigueAfter?: number;
  taskId?: string;
  examId?: string;
  /** manuel : saisi par toi. auto : placé par le planificateur. import : fichier .ics. */
  origin: "manuel" | "auto" | "import";
  /** Proposition du planificateur pas encore acceptée. */
  pending?: boolean;
  /** Occurrence d'un horaire récurrent (id du modèle). */
  templateId?: string;
  importKey?: string;
}

export interface OccurrenceOverride {
  cancelled?: boolean;
  date?: string;
  start?: number;
  end?: number;
  room?: string;
  title?: string;
  placeId?: string;
}

/** Horaire récurrent : un cours ou un créneau Auchan qui revient chaque semaine d'un type donné. */
export interface Recurring extends Base {
  title: string;
  category: Category;
  kind: EventKind;
  /** 1 = lundi … 7 = dimanche */
  weekday: number;
  start: number;
  end: number;
  placeId?: string;
  subjectId?: string;
  teacher?: string;
  room?: string;
  weekTypes: WeekType[];
  from?: string;
  until?: string;
  overrides: Record<string, OccurrenceOverride>;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export type TaskType =
  | "devoir"
  | "examen"
  | "groupe"
  | "oral"
  | "projet"
  | "document"
  | "mission"
  | "demande"
  | "apprentissage"
  | "reunion"
  | "autre";

export interface Task extends Base {
  title: string;
  category: Category;
  description?: string;
  createdAt: string;
  deadline?: string;
  estimateMin: number;
  spentMin: number;
  priority: Priority;
  status: TaskStatus;
  subtasks: Subtask[];
  subjectId?: string;
  type?: TaskType;
  completedAt?: string;
}

export interface Exam extends Base {
  title: string;
  subjectId?: string;
  date: string;
  time?: number;
  kind: "examen" | "partiel" | "oral" | "devoir";
  /** 1 facile, 2 moyen, 3 difficile */
  difficulty: 1 | 2 | 3;
  hoursNeeded: number;
  notes?: string;
}

export interface SleepLog extends Base {
  /** Date du réveil */
  date: string;
  bedtime: number;
  wake: number;
  napMin?: number;
  /** 1 en forme … 5 épuisé */
  fatigue?: number;
}

export type MealSlot = "petit_dej" | "dejeuner" | "collation" | "diner";
export type MealMode = "maison" | "prepare" | "acheter" | "emporter" | "dehors";

export interface Meal extends Base {
  date: string;
  slot: MealSlot;
  text: string;
  mode: MealMode;
}

export interface Goal extends Base {
  title: string;
  horizon: "court" | "moyen" | "long";
  category: Category;
  steps: Subtask[];
  targetDate?: string;
  note?: string;
  createdAt: string;
}

export type ReminderType =
  | "administratif"
  | "papier"
  | "rdv"
  | "renouvellement"
  | "achat"
  | "facture"
  | "abonnement"
  | "ecole"
  | "alternance";

export interface Reminder extends Base {
  title: string;
  type: ReminderType;
  dueDate?: string;
  repeat: "aucune" | "mensuelle" | "annuelle";
  remindDays: number;
  done: boolean;
  amount?: number;
  note?: string;
}

export interface Review extends Base {
  weekStart: string;
  good: string;
  lostTime: string;
  improve: string;
}

export interface SportTarget {
  id: string;
  name: string;
  perWeek: number;
  durationMin: number;
  placeId?: string;
  /** Créneaux habituels (ex. cours de la box). Vide = horaires libres. */
  slots: { weekday: number; start: number }[];
}

export interface Settings {
  name: string;
  homePlaceId: string;
  wakeTime: number;
  bedTime: number;
  sleepTargetMin: number;
  morningRoutineMin: number;
  windDownMin: number;
  lunch: { start: number; end: number; duration: number };
  dinner: { start: number; end: number; duration: number };
  /** Minutes maximales de travail personnel (tâches, révisions) par jour selon le type de journée. */
  maxFocus: { cours: number; travail: number; libre: number };
  focusBlockMin: number;
  noFocusAfter: number;
  minFreeMin: number;
  /** Soirées protégées (1 = lundi … 7 = dimanche) : rien n'y est planifié automatiquement. */
  freeEvenings: number[];
  bufferMin: number;
  sports: SportTarget[];
  alternance: {
    anchorMonday: string;
    pattern: WeekType[];
    overrides: Record<string, WeekType>;
  };
  onboarded: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  places: Record<string, Place>;
  routes: Record<string, Route>;
  subjects: Record<string, Subject>;
  recurring: Record<string, Recurring>;
  events: Record<string, CalEvent>;
  tasks: Record<string, Task>;
  exams: Record<string, Exam>;
  sleep: Record<string, SleepLog>;
  meals: Record<string, Meal>;
  goals: Record<string, Goal>;
  reminders: Record<string, Reminder>;
  reviews: Record<string, Review>;
}

export type CollectionName = Exclude<keyof AppData, "version" | "settings">;

/** Événement tel qu'affiché : occurrence concrète (ponctuelle ou issue d'un horaire récurrent). */
export interface Occurrence extends CalEvent {
  /** Clé stable : id de l'événement, ou "modèle@date" pour une occurrence récurrente. */
  key: string;
  recurring?: boolean;
}
