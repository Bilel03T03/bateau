import { useMemo, useState } from "react";
import { addDays, diffDays, mondayOf, relativeDay } from "../../lib/date";
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, REMINDER_TYPES } from "../../lib/meta";
import type { Category, Reminder, Task } from "../../lib/types";
import { completeReminder } from "../../store/store";
import { TaskRow } from "../components/rows";
import { Check, Chip, Empty, Icon, Seg } from "../components/ui";
import { useData, useNow } from "../hooks";
import { open } from "../uiStore";

export function Tasks() {
  const [tab, setTab] = useState<"taches" | "rappels">("taches");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tâches</h1>
          <p className="muted">Tout ce qui est à faire, triés par urgence. Ajoute vite en haut de l'écran, en langage naturel.</p>
        </div>
        <div className="actions">
          <Seg
            label="Section"
            value={tab}
            onChange={setTab}
            options={[
              { value: "taches", label: "Tâches" },
              { value: "rappels", label: "À ne pas oublier" },
            ]}
          />
          <button className="btn btn-primary" onClick={() => open(tab === "taches" ? { type: "task" } : { type: "reminder" })}>
            <Icon name="plus" /> {tab === "taches" ? "Nouvelle tâche" : "Nouveau rappel"}
          </button>
        </div>
      </div>
      {tab === "taches" ? <TaskBoard /> : <Reminders />}
    </>
  );
}

function TaskBoard() {
  const data = useData();
  const { today } = useNow(60_000);
  const [cat, setCat] = useState<Category | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const sunday = addDays(mondayOf(today), 6);

  const groups = useMemo(() => {
    const list = Object.values(data.tasks).filter((t) => cat === "all" || t.category === cat);
    const open = list.filter((t) => t.status !== "termine");
    const sortFn = (a: Task, b: Task) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || PRIORITIES[b.priority].weight - PRIORITIES[a.priority].weight;
    return {
      late: open.filter((t) => t.deadline && t.deadline < today && t.status !== "reporte").sort(sortFn),
      week: open.filter((t) => t.deadline && t.deadline >= today && t.deadline <= sunday && t.status !== "reporte").sort(sortFn),
      later: open.filter((t) => t.deadline && t.deadline > sunday && t.status !== "reporte").sort(sortFn),
      nodate: open.filter((t) => !t.deadline && t.status !== "reporte").sort(sortFn),
      postponed: open.filter((t) => t.status === "reporte").sort(sortFn),
      done: list.filter((t) => t.status === "termine").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [data.tasks, cat, today, sunday]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const t of Object.values(data.tasks)) {
      if (t.status === "termine") continue;
      c.all++;
      c[t.category] = (c[t.category] ?? 0) + 1;
    }
    return c;
  }, [data.tasks]);

  const Group = ({ title, tasks, tone }: { title: string; tasks: Task[]; tone?: "bad" }) =>
    tasks.length ? (
      <section className="panel">
        <div className="panel-head">
          <h2 style={tone ? { color: "var(--bad)" } : undefined}>{title}</h2>
          <span className="small faint">{tasks.length}</span>
        </div>
        <div className="list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} data={data} showCategory={cat === "all"} />
          ))}
        </div>
      </section>
    ) : null;

  const nothing = !groups.late.length && !groups.week.length && !groups.later.length && !groups.nodate.length;

  return (
    <>
      <div className="filters" role="group" aria-label="Filtrer par catégorie">
        <button className="filter" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
          Tout <span className="faint">{counts.all ?? 0}</span>
        </button>
        {CATEGORY_ORDER.map((c) => (
          <button key={c} className="filter" aria-pressed={cat === c} onClick={() => setCat(c)} data-cat={c}>
            <span className="chip-dot" /> {CATEGORIES[c].label} <span className="faint">{counts[c] ?? 0}</span>
          </button>
        ))}
      </div>
      {nothing && <Empty>Rien à faire dans cette catégorie. Profite ! 🎉</Empty>}
      <Group title="En retard" tasks={groups.late} tone="bad" />
      <Group title="Cette semaine" tasks={groups.week} />
      <Group title="Plus tard" tasks={groups.later} />
      <Group title="Sans date" tasks={groups.nodate} />
      <Group title="Reportées" tasks={groups.postponed} />
      {groups.done.length > 0 && (
        <div>
          <button className="link" onClick={() => setShowDone(!showDone)}>
            {showDone ? "Masquer" : "Afficher"} les tâches terminées ({groups.done.length})
          </button>
        </div>
      )}
      {showDone && <Group title="Terminées" tasks={groups.done} />}
    </>
  );
}

function Reminders() {
  const data = useData();
  const { today } = useNow(60_000);
  const list = Object.values(data.reminders).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const active = list.filter((r) => !r.done);
  const done = list.filter((r) => r.done);
  return (
    <>
      <p className="muted small">
        Démarches, papiers, factures, abonnements, renouvellements : tu recevras un rappel quelques jours avant l'échéance. Les rappels mensuels ou annuels se
        reprogramment tout seuls.
      </p>
      <section className="panel">
        {active.length ? (
          <div className="list">
            {active.map((r) => (
              <ReminderRow key={r.id} r={r} today={today} />
            ))}
          </div>
        ) : (
          <Empty>Aucun rappel en cours.</Empty>
        )}
      </section>
      {done.length > 0 && (
        <section className="panel">
          <h2>Réglés</h2>
          <div className="list">
            {done.map((r) => (
              <ReminderRow key={r.id} r={r} today={today} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ReminderRow({ r, today }: { r: Reminder; today: string }) {
  const n = r.dueDate ? diffDays(today, r.dueDate) : undefined;
  return (
    <div className="item clickable" onClick={() => open({ type: "reminder", id: r.id })}>
      <Check checked={r.done} onChange={() => !r.done && completeReminder(r.id)} label={`Régler ${r.title}`} round />
      <div className="item-main">
        <span className={`item-title ${r.done ? "done" : ""}`}>{r.title}</span>
        <div className="item-meta">
          <span>{REMINDER_TYPES[r.type]}</span>
          {r.dueDate && !r.done && (
            <Chip tone={n! < 0 ? "bad" : n! <= r.remindDays ? "warn" : undefined}>{relativeDay(r.dueDate, today)}</Chip>
          )}
          {r.repeat !== "aucune" && <span>🔁 {r.repeat}</span>}
          {r.amount !== undefined && <span>{r.amount} €</span>}
        </div>
      </div>
    </div>
  );
}
