import { useMemo } from "react";
import { occurrencesBetween } from "../../core/schedule";
import { goalProgress } from "../../core/stats";
import { addDays, fmtDayMonth, fmtHours, mondayOf } from "../../lib/date";
import type { TaskType } from "../../lib/types";
import { OccRow, TaskRow } from "../components/rows";
import { Empty, Icon, Progress } from "../components/ui";
import { useData, useNow } from "../hooks";
import { open } from "../uiStore";
import { InlineAdd, nextWeekOfType, RecurringList, useQuickTask } from "./School";

const GROUPS: { type: TaskType; title: string; hint: string; minutes: number }[] = [
  { type: "mission", title: "Missions", hint: "Ex. préparer l'inventaire du rayon", minutes: 90 },
  { type: "projet", title: "Projets", hint: "Ex. réorganiser l'implantation promo", minutes: 240 },
  { type: "demande", title: "À demander au responsable", hint: "Ex. mes dates de congés", minutes: 10 },
  { type: "apprentissage", title: "À apprendre", hint: "Ex. lire le tableau de bord des ventes", minutes: 60 },
  { type: "reunion", title: "Réunions à préparer", hint: "Ex. point mensuel avec ma tutrice", minutes: 45 },
  { type: "document", title: "Documents professionnels", hint: "Ex. rapport d'activité", minutes: 120 },
];

export function Work() {
  const data = useData();
  const { today } = useNow(60_000);
  const quick = useQuickTask("auchan");
  const monday = mondayOf(today);
  const weekOccs = useMemo(() => occurrencesBetween(data, monday, addDays(monday, 6), { includePending: false }), [data, monday]);
  const hours = weekOccs.filter((o) => o.kind === "travail").reduce((s, o) => s + o.end - o.start, 0);
  const meetings = useMemo(
    () => occurrencesBetween(data, today, addDays(today, 30), { includePending: false }).filter((o) => o.category === "auchan" && o.kind === "reunion"),
    [data, today],
  );
  const tasks = Object.values(data.tasks).filter((t) => t.category === "auchan");
  const goals = Object.values(data.goals).filter((g) => g.category === "auchan");
  const nextWork = nextWeekOfType(data, "entreprise", today);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>💼 Auchan</h1>
          <p className="muted">
            {fmtHours(hours)} prévues cette semaine
            {nextWork && nextWork > today ? ` · prochaine semaine en entreprise le ${fmtDayMonth(nextWork)}` : ""}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => open({ type: "task", draft: { category: "auchan", type: "mission" } })}>
            <Icon name="plus" /> Mission
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          {GROUPS.map((g) => {
            const list = tasks.filter((t) => t.type === g.type && t.status !== "termine");
            const done = tasks.filter((t) => t.type === g.type && t.status === "termine").length;
            return (
              <section key={g.type} className="panel">
                <div className="panel-head">
                  <h2>{g.title}</h2>
                  {done > 0 && <span className="small faint">{done} terminée{done > 1 ? "s" : ""}</span>}
                </div>
                {list.length > 0 && (
                  <div className="list">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} today={today} data={data} showCategory={false} />
                    ))}
                  </div>
                )}
                <InlineAdd placeholder={g.hint} onAdd={(title) => quick(title, g.type, g.minutes)} />
              </section>
            );
          })}
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Horaires · semaines Auchan</h2>
              <button
                className="btn btn-sm"
                onClick={() =>
                  open({
                    type: "recurring",
                    draft: { category: "auchan", kind: "travail", title: "Auchan", weekTypes: ["entreprise"], placeId: Object.values(data.places).find((p) => p.kind === "travail")?.id },
                  })
                }
              >
                <Icon name="plus" size={16} /> Créneau
              </button>
            </div>
            <RecurringList data={data} category="auchan" weekType="entreprise" />
            <p className="tiny faint">
              Tes horaires changent une semaine ? Déplace ou modifie le créneau directement dans le Planning : seule cette date change, et le reste de ta semaine s'adapte.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Réunions à venir</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "event", draft: { category: "auchan", kind: "reunion", date: today } })}>
                <Icon name="plus" size={16} />
              </button>
            </div>
            {meetings.length ? (
              <div className="list">
                {meetings.map((o) => (
                  <OccRow key={o.key} o={o} data={data} showDate today={today} />
                ))}
              </div>
            ) : (
              <Empty>Aucune réunion prévue.</Empty>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Objectifs professionnels</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "goal", draft: { category: "auchan", horizon: "moyen" } })}>
                <Icon name="plus" size={16} />
              </button>
            </div>
            {goals.length ? (
              <div className="stack-sm">
                {goals.map((g) => (
                  <button key={g.id} className="item clickable" style={{ border: 0, background: "none", textAlign: "left", width: "100%" }} onClick={() => open({ type: "goal", id: g.id })}>
                    <span className="item-main">
                      <span className="spread">
                        <span className="item-title">{g.title}</span>
                        <span className="small num">{goalProgress(g)} %</span>
                      </span>
                      <Progress value={goalProgress(g)} cat="auchan" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>Ajoute un objectif pro (ex. gérer seul l'inventaire).</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
