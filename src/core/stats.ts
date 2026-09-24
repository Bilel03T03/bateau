import { addDays, firstOfMonth, mondayOf } from "../lib/date";
import type { AppData, Goal, SportTarget, Task } from "../lib/types";
import { averageSleep } from "./energy";
import { occurrencesBetween } from "./schedule";

export interface SportWeekRow {
  target: SportTarget;
  done: number;
  planned: number;
  missed: number;
}

export function sportWeek(data: AppData, monday: string): SportWeekRow[] {
  const end = addDays(monday, 6);
  const sessions = Object.values(data.events).filter(
    (e) => e.kind === "sport" && !e.pending && e.date >= monday && e.date <= end,
  );
  return data.settings.sports.map((target) => {
    const mine = sessions.filter((e) => e.sport === target.id);
    return {
      target,
      done: mine.filter((e) => e.status === "fait").length,
      planned: mine.filter((e) => !e.status || e.status === "prevu").length,
      missed: mine.filter((e) => e.status === "manque").length,
    };
  });
}

export function sportWeekMet(rows: SportWeekRow[]): boolean {
  return rows.every((r) => r.done >= r.target.perWeek);
}

export interface WeekStats {
  monday: string;
  workMin: number;
  courseMin: number;
  sportMin: number;
  revisionMin: number;
  tasksDone: number;
  tasksDoneList: Task[];
  focusPlanned: number;
  focusDone: number;
  sleepAvg: number;
  sleepNights: number;
  school: { done: number; remaining: number };
  auchan: { done: number; remaining: number };
  sport: SportWeekRow[];
}

export function weekStats(data: AppData, monday: string): WeekStats {
  const end = addDays(monday, 6);
  const occs = occurrencesBetween(data, monday, end, { includePending: false });
  const sum = (pred: (k: string, status?: string) => boolean) =>
    occs.filter((o) => pred(o.kind, o.status)).reduce((s, o) => s + (o.end - o.start), 0);
  const inWeek = (d?: string) => !!d && d >= monday && d <= end;
  const tasks = Object.values(data.tasks);
  const doneList = tasks.filter((t) => t.status === "termine" && inWeek(t.completedAt));
  const open = (cat: Task["category"]) =>
    tasks.filter((t) => t.category === cat && t.status !== "termine" && (!t.deadline || t.deadline <= addDays(end, 7))).length;
  const focus = occs.filter((o) => o.kind === "tache" || o.kind === "revision");
  const sleep = averageSleep(data, monday, end);
  return {
    monday,
    workMin: sum((k) => k === "travail"),
    courseMin: sum((k) => k === "cours" || k === "examen"),
    sportMin: sum((k, st) => k === "sport" && st === "fait"),
    revisionMin: sum((k, st) => k === "revision" && st === "fait"),
    tasksDone: doneList.length,
    tasksDoneList: doneList,
    focusPlanned: focus.length,
    focusDone: focus.filter((o) => o.status === "fait").length,
    sleepAvg: sleep.avg,
    sleepNights: sleep.nights,
    school: { done: doneList.filter((t) => t.category === "ecole").length, remaining: open("ecole") },
    auchan: { done: doneList.filter((t) => t.category === "auchan").length, remaining: open("auchan") },
    sport: sportWeek(data, monday),
  };
}

export interface MonthStats {
  month: string;
  sessions: { target: SportTarget; count: number }[];
  weeks: { monday: string; met: boolean; rows: SportWeekRow[]; current: boolean }[];
  regularity: number;
  taskRate: number;
  tasksCompleted: number;
  tasksDue: number;
  sleepAvg: number;
  goalsAvg: number;
}

export function monthStats(data: AppData, anyDate: string, today: string): MonthStats {
  const first = firstOfMonth(anyDate);
  const month = first.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
  const sport = Object.values(data.events).filter(
    (e) => e.kind === "sport" && e.status === "fait" && e.date >= first && e.date <= last,
  );
  const sessions = data.settings.sports.map((target) => ({
    target,
    count: sport.filter((e) => e.sport === target.id).length,
  }));

  const weeks: MonthStats["weeks"] = [];
  const currentMonday = mondayOf(today);
  for (let mon = mondayOf(first); mon <= last; mon = addDays(mon, 7)) {
    // Une semaine appartient au mois où tombe son jeudi (convention ISO).
    if (addDays(mon, 3).slice(0, 7) !== month || mon > currentMonday) continue;
    const rows = sportWeek(data, mon);
    weeks.push({ monday: mon, met: sportWeekMet(rows), rows, current: mon === currentMonday });
  }
  const closed = weeks.filter((w) => !w.current);
  const regularity = closed.length ? Math.round((closed.filter((w) => w.met).length / closed.length) * 100) : 0;

  const tasks = Object.values(data.tasks);
  const completed = tasks.filter((t) => t.status === "termine" && t.completedAt && t.completedAt >= first && t.completedAt <= last);
  const dueOpen = tasks.filter((t) => t.status !== "termine" && t.deadline && t.deadline >= first && t.deadline <= last && t.deadline <= today);
  const tasksDue = completed.length + dueOpen.length;
  const goals = Object.values(data.goals);
  return {
    month,
    sessions,
    weeks,
    regularity,
    taskRate: tasksDue ? Math.round((completed.length / tasksDue) * 100) : 0,
    tasksCompleted: completed.length,
    tasksDue,
    sleepAvg: averageSleep(data, first, last).avg,
    goalsAvg: goals.length ? Math.round(goals.reduce((s, g) => s + goalProgress(g), 0) / goals.length) : 0,
  };
}

export function goalProgress(goal: Goal): number {
  if (!goal.steps.length) return 0;
  return Math.round((goal.steps.filter((s) => s.done).length / goal.steps.length) * 100);
}

export function taskProgress(task: Task): number {
  if (task.status === "termine") return 100;
  if (task.subtasks.length) return Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100);
  if (!task.estimateMin) return 0;
  return Math.min(95, Math.round((task.spentMin / task.estimateMin) * 100));
}
