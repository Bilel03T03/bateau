// Données d'exemple, recalculées autour de la date du jour pour que l'outil
// soit parlant dès l'ouverture. Tout est marqué `demo: true` et peut être
// supprimé en un clic (Paramètres → Données).
//
// Scénario : semaine en cours = 3e semaine chez Auchan, semaine prochaine =
// semaine d'école avec un partiel de finance et une présentation.

import { addDays, mondayOf } from "../lib/date";
import type {
  AppData,
  CalEvent,
  Exam,
  Goal,
  Meal,
  Recurring,
  Reminder,
  Review,
  SleepLog,
  Subject,
  Task,
} from "../lib/types";
import { planSchedule } from "../core/planner";
import { emptyData } from "./defaults";

const h = (hh: number, mm = 0) => hh * 60 + mm;

export function buildDemo(today: string, nowMin: number): AppData {
  const data = emptyData(today);
  data.settings.name = "";
  const monday = mondayOf(today);
  const d = (i: number) => addDays(monday, i);
  const st = (date: string, end: number) => (date < today || (date === today && end <= nowMin) ? "fait" : "prevu");

  // ----- Matières -----
  const subjects: Subject[] = [
    { id: "s-strat", name: "Stratégie commerciale", teacher: "M. Durand", room: "B12" },
    { id: "s-mkt", name: "Marketing digital", teacher: "Mme Benali", room: "A04" },
    { id: "s-fin", name: "Finance d'entreprise", teacher: "M. Martin", room: "C21" },
    { id: "s-mgt", name: "Management d'équipe", teacher: "Mme Rossi", room: "B08" },
    { id: "s-ang", name: "Anglais des affaires", teacher: "M. Clarke", room: "L02" },
    { id: "s-droit", name: "Droit commercial", teacher: "Mme Petit", room: "C03" },
  ];
  data.subjects = Object.fromEntries(subjects.map((s) => [s.id, { ...s, demo: true }]));
  const sub = (id: string) => subjects.find((s) => s.id === id)!;

  // ----- Horaires récurrents -----
  const course = (id: string, weekday: number, start: number, end: number, subjectId: string): Recurring => ({
    id,
    title: sub(subjectId).name,
    category: "ecole",
    kind: "cours",
    weekday,
    start,
    end,
    placeId: "p-perrimond",
    subjectId,
    teacher: sub(subjectId).teacher,
    room: sub(subjectId).room,
    weekTypes: ["ecole"],
    overrides: {},
    demo: true,
  });
  const shift = (id: string, weekday: number, start: number, end: number): Recurring => ({
    id,
    title: "Auchan · rayon épicerie",
    category: "auchan",
    kind: "travail",
    weekday,
    start,
    end,
    placeId: "p-auchan",
    weekTypes: ["entreprise"],
    overrides: {},
    demo: true,
  });
  const recurring: Recurring[] = [
    course("rc-strat-lun", 1, h(8, 30), h(12), "s-strat"),
    course("rc-mkt-lun", 1, h(13), h(16, 30), "s-mkt"),
    course("rc-fin-mar", 2, h(9), h(12, 30), "s-fin"),
    course("rc-droit-mar", 2, h(13, 30), h(17), "s-droit"),
    course("rc-mgt-mer", 3, h(8, 30), h(12), "s-mgt"),
    course("rc-ang-mer", 3, h(13, 30), h(15), "s-ang"),
    course("rc-mkt-jeu", 4, h(9), h(12, 30), "s-mkt"),
    course("rc-strat-jeu", 4, h(13, 30), h(17), "s-strat"),
    course("rc-ang-ven", 5, h(9), h(12), "s-ang"),
    course("rc-fin-ven", 5, h(13), h(16), "s-fin"),
    shift("rw-lun", 1, h(7), h(14)),
    shift("rw-mar", 2, h(9), h(17)),
    shift("rw-jeu", 4, h(9), h(17)),
    shift("rw-ven", 5, h(12), h(19, 30)),
    shift("rw-sam", 6, h(8), h(15)),
  ];
  // Le partiel remplace le cours de finance du mardi de la semaine d'école.
  recurring.find((r) => r.id === "rc-fin-mar")!.overrides[d(8)] = { cancelled: true };
  data.recurring = Object.fromEntries(recurring.map((r) => [r.id, r]));

  // ----- Événements ponctuels -----
  const events: CalEvent[] = [];
  const ev = (e: Omit<CalEvent, "origin" | "demo"> & Partial<Pick<CalEvent, "origin">>) =>
    events.push({ origin: "manuel", demo: true, ...e });
  const sport = (id: string, sportId: "crossfit" | "squash", date: string, start: number, extra: Partial<CalEvent> = {}) =>
    ev({
      id,
      title: sportId === "crossfit" ? "CrossFit" : "Squash",
      category: "sport",
      kind: "sport",
      sport: sportId,
      date,
      start,
      end: start + 60,
      placeId: sportId === "crossfit" ? "p-box" : "p-squash",
      status: st(date, start + 60),
      ...extra,
    });

  // Historique des trois semaines précédentes (pour les statistiques).
  sport("e-cf-1", "crossfit", d(-21), h(18, 30), { status: "fait", energyBefore: 4, fatigueAfter: 3 });
  sport("e-cf-2", "crossfit", d(-18), h(18, 30), { status: "fait", energyBefore: 3, fatigueAfter: 4 });
  sport("e-sq-1", "squash", d(-16), h(16), { status: "fait", energyBefore: 4, fatigueAfter: 3, notes: "Victoire 3-1 contre Karim" });
  sport("e-cf-3", "crossfit", d(-13), h(19, 30), { status: "fait", energyBefore: 3, fatigueAfter: 3 });
  sport("e-cf-4", "crossfit", d(-10), h(7), { status: "manque", notes: "Réveil raté après la soirée d'intégration" });
  sport("e-sq-2", "squash", d(-8), h(11), { status: "fait", energyBefore: 4, fatigueAfter: 2 });
  sport("e-cf-5", "crossfit", d(-7), h(18, 30), { status: "fait", energyBefore: 4, fatigueAfter: 4 });
  sport("e-cf-6", "crossfit", d(-5), h(18, 30), { status: "fait", energyBefore: 3, fatigueAfter: 3 });
  sport("e-sq-3", "squash", d(-2), h(16), { status: "fait", energyBefore: 5, fatigueAfter: 3 });
  // Semaine en cours : une séance de CrossFit le mercredi (jour de repos) et un squash
  // réservé trop tôt le vendredi → conflit avec la fin du service chez Auchan.
  sport("e-cf-7", "crossfit", d(2), h(18, 30), d(2) < today ? { energyBefore: 4, fatigueAfter: 3 } : {});
  sport("e-sq-4", "squash", d(4), h(19, 45), { notes: "Terrain réservé avec Karim" });

  ev({ id: "e-banque", title: "Rendez-vous banque (prêt étudiant)", category: "perso", kind: "rdv", date: d(2), start: h(11), end: h(11, 45) });
  ev({
    id: "e-tutrice",
    title: "Point hebdo avec ma tutrice",
    category: "auchan",
    kind: "reunion",
    date: d(3),
    start: h(14),
    end: h(14, 30),
    placeId: "p-auchan",
    notes: "Apporter les chiffres du rayon et la liste des questions",
  });
  ev({ id: "e-amis", title: "Soirée entre amis", category: "perso", kind: "libre", date: d(5), start: h(20), end: h(23, 30) });
  ev({ id: "e-famille", title: "Déjeuner en famille", category: "perso", kind: "libre", date: d(6), start: h(12, 30), end: h(15) });
  ev({
    id: "e-partiel",
    title: "Partiel · Finance d'entreprise",
    category: "ecole",
    kind: "examen",
    date: d(8),
    start: h(9),
    end: h(12),
    placeId: "p-perrimond",
    subjectId: "s-fin",
    room: "Amphi 2",
    examId: "x-fin",
  });
  ev({ id: "e-dentiste", title: "Dentiste", category: "perso", kind: "rdv", date: d(9), start: h(17, 30), end: h(18) });
  // Une révision déjà faite en début de semaine.
  if (d(0) < today) {
    ev({ id: "e-rev-1", title: "Révision · Finance d'entreprise", category: "ecole", kind: "revision", date: d(0), start: h(20, 30), end: h(21, 15), examId: "x-fin", status: "fait" });
  }
  data.events = Object.fromEntries(events.map((e) => [e.id, e]));

  // ----- Examens / révisions -----
  const exams: Exam[] = [
    { id: "x-fin", title: "Partiel Finance d'entreprise", subjectId: "s-fin", date: d(8), time: h(9), kind: "partiel", difficulty: 3, hoursNeeded: 6, notes: "Chapitres 1 à 5 : bilan, compte de résultat, SIG, BFR, rentabilité." },
    { id: "x-ang", title: "Oral d'anglais des affaires", subjectId: "s-ang", date: d(11), time: h(9), kind: "oral", difficulty: 1, hoursNeeded: 2, notes: "Pitch de 5 min sur mon entreprise d'accueil." },
  ];
  data.exams = Object.fromEntries(exams.map((x) => [x.id, { ...x, demo: true }]));

  // ----- Tâches -----
  const created = addDays(today, -6);
  const task = (t: Omit<Task, "createdAt" | "spentMin" | "subtasks" | "status" | "demo"> & Partial<Task>): Task => ({
    createdAt: created,
    spentMin: 0,
    subtasks: [],
    status: "a_faire",
    demo: true,
    ...t,
  });
  const sub3 = (...titles: string[]) => titles.map((title, i) => ({ id: `st${i}`, title, done: false }));
  const tasks: Task[] = [
    task({
      id: "t-pres",
      title: "Préparer présentation stratégie commerciale",
      category: "ecole",
      subjectId: "s-strat",
      type: "oral",
      deadline: d(10),
      estimateMin: 180,
      priority: "importante",
      description: "Présentation de 10 min en binôme sur la stratégie omnicanale d'une enseigne.",
      subtasks: sub3("Choisir l'enseigne et le plan", "Faire les slides", "Répéter à voix haute"),
    }),
    task({
      id: "t-dossier",
      title: "Dossier de groupe stratégie commerciale",
      category: "ecole",
      subjectId: "s-strat",
      type: "groupe",
      deadline: d(11),
      estimateMin: 360,
      spentMin: 120,
      priority: "importante",
      status: "en_cours",
      subtasks: [
        { id: "a", title: "Analyse du marché", done: true },
        { id: "b", title: "Matrice SWOT", done: true },
        { id: "c", title: "Recommandations", done: false },
        { id: "d", title: "Relecture commune", done: false },
      ],
    }),
    task({ id: "t-droit", title: "Étude de cas droit commercial", category: "ecole", subjectId: "s-droit", type: "devoir", deadline: addDays(today, 5), estimateMin: 120, priority: "normale" }),
    task({ id: "t-fiche", title: "Rendre la fiche de suivi d'alternance à l'école", category: "ecole", type: "document", deadline: addDays(today, 2), estimateMin: 20, priority: "importante" }),
    task({ id: "t-lecture", title: "Lire le chapitre 4 de management", category: "ecole", subjectId: "s-mgt", type: "autre", estimateMin: 45, priority: "faible" }),
    task({ id: "t-inventaire", title: "Préparer l'inventaire du rayon épicerie", category: "auchan", type: "mission", deadline: addDays(today, 6), estimateMin: 180, priority: "importante" }),
    task({ id: "t-conges", title: "Demander mes dates de congés de décembre", category: "auchan", type: "demande", estimateMin: 10, priority: "normale" }),
    task({ id: "t-retour", title: "Demander un retour sur ma mise en rayon", category: "auchan", type: "demande", estimateMin: 10, priority: "normale" }),
    task({ id: "t-kpi", title: "Apprendre à lire le tableau de bord des ventes", category: "auchan", type: "apprentissage", estimateMin: 60, priority: "normale" }),
    task({ id: "t-point", title: "Préparer le point mensuel avec ma tutrice", category: "auchan", type: "reunion", deadline: d(3) >= today ? d(3) : addDays(today, 3), estimateMin: 45, priority: "normale" }),
    task({ id: "t-promo", title: "Projet : réorganiser l'implantation promo", category: "auchan", type: "projet", deadline: addDays(today, 20), estimateMin: 300, spentMin: 60, priority: "normale", status: "en_cours" }),
    task({ id: "t-mission-done", title: "Mettre à jour les étiquettes prix", category: "auchan", type: "mission", estimateMin: 60, spentMin: 60, priority: "normale", status: "termine", completedAt: addDays(today, -1) }),
    task({ id: "t-dentiste", title: "Prendre rendez-vous chez l'ophtalmo", category: "perso", type: "autre", estimateMin: 10, priority: "normale" }),
    task({ id: "t-fiche-done", title: "Envoyer le planning Auchan à l'école", category: "ecole", type: "document", estimateMin: 15, spentMin: 15, priority: "normale", status: "termine", completedAt: addDays(today, -2) }),
  ];
  data.tasks = Object.fromEntries(tasks.map((t) => [t.id, t]));

  // ----- Rappels (choses faciles à oublier) -----
  const reminders: Reminder[] = [
    { id: "r-pass", title: "Recharger le pass transport", type: "renouvellement", dueDate: addDays(today, 3), repeat: "mensuelle", remindDays: 5, done: false, amount: 30 },
    { id: "r-mutuelle", title: "Envoyer l'attestation de mutuelle", type: "papier", dueDate: addDays(today, 6), repeat: "aucune", remindDays: 7, done: false },
    { id: "r-tel", title: "Forfait téléphone", type: "facture", dueDate: addDays(today, 12), repeat: "mensuelle", remindDays: 3, done: false, amount: 15 },
    { id: "r-box", title: "Abonnement box CrossFit", type: "abonnement", dueDate: addDays(today, 20), repeat: "mensuelle", remindDays: 5, done: false, amount: 70 },
    { id: "r-caf", title: "Compléter le dossier d'aide au logement", type: "administratif", dueDate: addDays(today, 10), repeat: "aucune", remindDays: 7, done: false },
    { id: "r-convention", title: "Faire signer l'avenant au contrat d'alternance", type: "alternance", dueDate: addDays(today, 4), repeat: "aucune", remindDays: 5, done: false },
    { id: "r-bourse", title: "Déposer le certificat de scolarité", type: "ecole", dueDate: addDays(today, 25), repeat: "aucune", remindDays: 7, done: false },
  ];
  data.reminders = Object.fromEntries(reminders.map((r) => [r.id, { ...r, demo: true }]));

  // ----- Sommeil : les 10 dernières nuits -----
  const nights: [number, number, number, number?][] = [
    [h(23, 30), h(6, 30), 3],
    [h(0, 15), h(7, 30), 3],
    [h(23), h(6, 15), 2],
    [h(1), h(9), 2, 30],
    [h(23, 45), h(7), 3],
    [h(22, 45), h(6), 2],
    [h(0, 30), h(6, 45), 4],
    [h(23, 15), h(7, 15), 2],
    [h(23, 40), h(6, 30), 3],
    [h(23, 10), h(7), 2],
  ];
  const sleep: SleepLog[] = nights.map(([bedtime, wake, fatigue, napMin], i) => ({
    id: `sl-${i}`,
    date: addDays(today, -(nights.length - i)),
    bedtime,
    wake,
    fatigue,
    napMin,
    demo: true,
  }));
  data.sleep = Object.fromEntries(sleep.map((s) => [s.id, s]));

  // ----- Repas -----
  const meals: Meal[] = [];
  for (let i = -2; i <= 0; i++) {
    const date = addDays(today, i);
    meals.push({ id: `m-dej-${i}`, date, slot: "dejeuner", text: "Boîte riz, poulet, légumes", mode: "emporter", demo: true });
    meals.push({ id: `m-din-${i}`, date, slot: "diner", text: i === 0 ? "Pâtes au thon" : "Omelette et salade", mode: "maison", demo: true });
  }
  meals.push({ id: "m-col-0", date: today, slot: "collation", text: "Banane + barre de céréales", mode: "emporter", demo: true });
  data.meals = Object.fromEntries(meals.map((m) => [m.id, m]));

  // ----- Objectifs -----
  const step = (title: string, done = false) => ({ id: Math.random().toString(36).slice(2, 8), title, done });
  const goals: Goal[] = [
    { id: "g-sport", title: "Tenir 3 séances de sport par semaine ce mois-ci", horizon: "court", category: "sport", createdAt: addDays(today, -20), steps: [step("Semaine 1", true), step("Semaine 2"), step("Semaine 3", true), step("Semaine 4")] },
    { id: "g-dossier", title: "Boucler le dossier de stratégie avant la semaine d'école", horizon: "court", category: "ecole", createdAt: addDays(today, -6), targetDate: d(11), steps: [step("Analyse du marché", true), step("SWOT", true), step("Recommandations"), step("Relecture")] },
    { id: "g-semestre", title: "Valider le semestre avec au moins 12 de moyenne", horizon: "moyen", category: "ecole", createdAt: addDays(today, -40), steps: [step("Partiel finance ≥ 12"), step("Présentation stratégie"), step("Dossier de groupe"), step("Rattraper le chapitre 3 de droit", true)] },
    { id: "g-inventaire", title: "Gérer seul l'inventaire du rayon", horizon: "moyen", category: "auchan", createdAt: addDays(today, -30), steps: [step("Observer un inventaire", true), step("Préparer les listes", true), step("Faire un inventaire accompagné"), step("Faire l'inventaire seul")] },
    { id: "g-cdi", title: "Obtenir mon diplôme et décrocher un CDI", horizon: "long", category: "auchan", createdAt: addDays(today, -60), steps: [step("Valider l'année"), step("Demander un entretien de fin d'alternance"), step("Mettre à jour mon CV et LinkedIn", true), step("Postuler à 3 offres")] },
    { id: "g-compet", title: "Participer à une compétition de CrossFit", horizon: "long", category: "sport", createdAt: addDays(today, -60), steps: [step("Réussir 5 tractions strictes", true), step("Double unders"), step("S'inscrire à une compétition locale")] },
    { id: "g-epargne", title: "Mettre 1 500 € de côté", horizon: "long", category: "perso", createdAt: addDays(today, -60), steps: [step("Ouvrir un livret", true), step("Virement auto de 100 €/mois", true), step("Atteindre 750 €"), step("Atteindre 1 500 €")] },
  ];
  data.goals = Object.fromEntries(goals.map((g) => [g.id, { ...g, demo: true }]));

  const reviews: Review[] = [
    {
      id: "rv-1",
      weekStart: d(-7),
      good: "3 séances de sport faites, bon feedback de ma tutrice sur la mise en rayon.",
      lostTime: "Trop de temps sur le téléphone le soir, et 1 h perdue à chercher mes cours de finance.",
      improve: "Réviser la finance 45 min après le travail, préparer mes repas le dimanche.",
      demo: true,
    },
  ];
  data.reviews = Object.fromEntries(reviews.map((r) => [r.id, r]));

  data.settings.onboarded = false;

  // Planning automatique déjà appliqué pour que la semaine soit lisible tout de suite.
  const plan = planSchedule(data, { today, nowMin, mode: "full" });
  for (const id of plan.remove) delete data.events[id];
  for (const e of plan.add) data.events[e.id] = { ...e, pending: false, demo: true };
  return data;
}
