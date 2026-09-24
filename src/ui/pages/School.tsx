import { useMemo, useState } from "react";
import { revisionProgress } from "../../core/revisions";
import { weekTypeOf } from "../../core/schedule";
import { addDays, DAY_NAMES, fmtDayMonth, fmtDuration, fmtTime, mondayOf, relativeDay, todayISO } from "../../lib/date";
import { uid } from "../../lib/meta";
import type { AppData, Category, Recurring, TaskType } from "../../lib/types";
import { upsert } from "../../store/store";
import { TaskRow } from "../components/rows";
import { Empty, Icon, Progress } from "../components/ui";
import { useData, useNow } from "../hooks";
import { go, open } from "../uiStore";

export function nextWeekOfType(data: AppData, type: "ecole" | "entreprise", from: string): string | null {
  for (let i = 0; i < 20; i++) {
    const mon = addDays(mondayOf(from), i * 7);
    if (weekTypeOf(mon, data.settings.alternance) === type) return mon;
  }
  return null;
}

export function RecurringList({ data, category, weekType }: { data: AppData; category: Category; weekType: "ecole" | "entreprise" }) {
  const list = Object.values(data.recurring)
    .filter((r) => r.category === category && r.weekTypes.includes(weekType))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  if (!list.length) return <Empty>Aucun horaire enregistré pour l'instant.</Empty>;
  const byDay = new Map<number, Recurring[]>();
  for (const r of list) byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]);
  return (
    <div className="list">
      {[...byDay.entries()].map(([wd, items]) => (
        <div key={wd} className="item" style={{ alignItems: "flex-start" }}>
          <span className="small" style={{ width: 76, flex: "none", fontWeight: 600, textTransform: "capitalize", paddingTop: 6 }}>
            {DAY_NAMES[wd - 1]}
          </span>
          <div className="grow stack-sm">
            {items.map((r) => (
              <button
                key={r.id}
                className="item clickable"
                data-cat={r.category}
                style={{ border: 0, background: "none", textAlign: "left", padding: "6px 6px", width: "100%" }}
                onClick={() => open({ type: "recurring", id: r.id })}
              >
                <span className="cat-bar" />
                <span className="item-main">
                  <span className="item-title">{r.title}</span>
                  <span className="item-meta">
                    <span className="num">
                      {fmtTime(r.start)}–{fmtTime(r.end)}
                    </span>
                    {r.room && <span>salle {r.room}</span>}
                    {r.teacher && <span>{r.teacher}</span>}
                    {r.placeId && data.places[r.placeId] && <span>📍 {data.places[r.placeId].name}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const SCHOOL_GROUPS: { type: TaskType; title: string }[] = [
  { type: "devoir", title: "Devoirs" },
  { type: "oral", title: "Présentations et oraux" },
  { type: "groupe", title: "Travaux de groupe" },
  { type: "projet", title: "Projets" },
  { type: "document", title: "Documents à rendre" },
];

export function School() {
  const data = useData();
  const { today, minutes } = useNow(60_000);
  const nextSchool = nextWeekOfType(data, "ecole", today);
  const tasks = Object.values(data.tasks).filter((t) => t.category === "ecole" && t.status !== "termine");
  const exams = Object.values(data.exams)
    .filter((x) => x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const other = tasks.filter((t) => !SCHOOL_GROUPS.some((g) => g.type === t.type));
  const subjects = Object.values(data.subjects).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🎓 Perrimond</h1>
          <p className="muted">
            {nextSchool
              ? nextSchool <= today
                ? "Tu es en semaine d'école."
                : `Prochaine semaine d'école : du ${fmtDayMonth(nextSchool)} au ${fmtDayMonth(addDays(nextSchool, 4))}.`
              : "Aucune semaine d'école trouvée dans ton rythme : vérifie les Paramètres."}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => open({ type: "timetable" })}>
            <Icon name="image" /> Importer mon emploi du temps
          </button>
          <button className="btn btn-primary" onClick={() => open({ type: "task", draft: { category: "ecole", type: "devoir" } })}>
            <Icon name="plus" /> Devoir
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Emploi du temps · semaine d'école</h2>
              <button
                className="btn btn-sm"
                onClick={() => open({ type: "recurring", draft: { category: "ecole", kind: "cours", weekTypes: ["ecole"], placeId: Object.values(data.places).find((p) => p.kind === "ecole")?.id } })}
              >
                <Icon name="plus" size={16} /> Cours
              </button>
            </div>
            <RecurringList data={data} category="ecole" weekType="ecole" />
            <p className="tiny faint">
              Ces cours reviennent à chaque semaine d'école. Un cours annulé ou déplacé ? Modifie-le directement dans le Planning : seule cette date change.
            </p>
          </section>

          {SCHOOL_GROUPS.map((g) => {
            const list = tasks.filter((t) => t.type === g.type);
            if (!list.length) return null;
            return (
              <section key={g.type} className="panel">
                <div className="panel-head">
                  <h2>{g.title}</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "task", draft: { category: "ecole", type: g.type } })}>
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                <div className="list">
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} data={data} showCategory={false} />
                  ))}
                </div>
              </section>
            );
          })}
          {other.length > 0 && (
            <section className="panel">
              <h2>Autres tâches d'école</h2>
              <div className="list">
                {other.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} data={data} showCategory={false} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Examens et oraux</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => go("revisions")}>
                Révisions <Icon name="right" size={16} />
              </button>
            </div>
            {exams.length ? (
              <div className="list">
                {exams.map((x) => {
                  const p = revisionProgress(data, x, today, minutes);
                  return (
                    <div key={x.id} className="item clickable" onClick={() => open({ type: "exam", id: x.id })}>
                      <div className="item-main">
                        <span className="item-title">{x.title}</span>
                        <span className="item-meta">
                          📝 {relativeDay(x.date, today)}
                          {x.time !== undefined ? ` à ${fmtTime(x.time)}` : ""} · {fmtDuration(p.doneMin)} / {fmtDuration(p.neededMin)} révisées
                        </span>
                        <Progress value={p.pct} cat="ecole" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>Aucun examen à venir.</Empty>
            )}
            <button className="btn btn-sm" onClick={() => open({ type: "exam" })}>
              <Icon name="plus" size={16} /> Ajouter un examen
            </button>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Matières</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "subject" })}>
                <Icon name="plus" size={16} />
              </button>
            </div>
            {subjects.length ? (
              <div className="list">
                {subjects.map((s) => (
                  <div key={s.id} className="item clickable" onClick={() => open({ type: "subject", id: s.id })}>
                    <div className="item-main">
                      <span className="item-title">{s.name}</span>
                      <span className="item-meta">
                        {s.teacher && <span>{s.teacher}</span>}
                        {s.room && <span>salle {s.room}</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Ajoute tes matières pour les retrouver dans tes cours et devoirs.</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** Petit champ « ajouter » pour les listes par type (missions, questions au responsable…). */
export function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text.trim());
        setText("");
      }}
    >
      <input className="input sm grow" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} aria-label={placeholder} />
      <button className="btn btn-sm" type="submit" disabled={!text.trim()}>
        Ajouter
      </button>
    </form>
  );
}

export function useQuickTask(category: Category) {
  return useMemo(
    () => (title: string, type: TaskType, estimateMin: number) =>
      upsert(
        "tasks",
        {
          id: uid("t"),
          title,
          category,
          type,
          createdAt: todayISO(),
          estimateMin,
          spentMin: 0,
          priority: "normale",
          status: "a_faire",
          subtasks: [],
        },
        `Ajouté : ${title}`,
      ),
    [category],
  );
}
