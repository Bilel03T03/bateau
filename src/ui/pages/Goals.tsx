import { goalProgress } from "../../core/stats";
import { relativeDay } from "../../lib/date";
import type { Goal } from "../../lib/types";
import { patch } from "../../store/store";
import { CatChip, Check, Empty, Icon, Progress } from "../components/ui";
import { useData, useNow } from "../hooks";
import { open } from "../uiStore";

const HORIZONS: { id: Goal["horizon"]; title: string; hint: string }[] = [
  { id: "court", title: "Court terme", hint: "Cette semaine, ce mois-ci" },
  { id: "moyen", title: "Moyen terme", hint: "Les prochains mois" },
  { id: "long", title: "Long terme", hint: "Études, carrière, sport, projets" },
];

export function Goals() {
  const data = useData();
  const { today } = useNow(60_000);
  const goals = Object.values(data.goals);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>🎯 Objectifs</h1>
          <p className="muted">Découpe chaque objectif en petites étapes : la progression se calcule toute seule.</p>
        </div>
        <button className="btn btn-primary" onClick={() => open({ type: "goal" })}>
          <Icon name="plus" /> Objectif
        </button>
      </div>
      <div className="grid-3">
        {HORIZONS.map((h) => {
          const list = goals.filter((g) => g.horizon === h.id).sort((a, b) => goalProgress(a) - goalProgress(b));
          return (
            <div key={h.id} className="goal-col">
              <div>
                <h2>{h.title}</h2>
                <p className="small faint">{h.hint}</p>
              </div>
              {list.length ? (
                list.map((g) => <GoalCard key={g.id} goal={g} today={today} />)
              ) : (
                <Empty>
                  <button className="link" onClick={() => open({ type: "goal", draft: { horizon: h.id } })}>
                    Ajouter un objectif
                  </button>
                </Empty>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function GoalCard({ goal, today }: { goal: Goal; today: string }) {
  const pct = goalProgress(goal);
  return (
    <div className="goal" data-cat={goal.category}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <strong style={{ cursor: "pointer" }} onClick={() => open({ type: "goal", id: goal.id })}>
          {goal.title}
        </strong>
        <span className="pct">{pct} %</span>
      </div>
      <Progress value={pct} cat={goal.category} />
      <div className="row-wrap">
        <CatChip cat={goal.category} />
        {goal.targetDate && <span className="small faint">échéance {relativeDay(goal.targetDate, today)}</span>}
      </div>
      <div className="list">
        {goal.steps.map((s) => (
          <div key={s.id} className="item" style={{ padding: "6px 2px" }}>
            <Check
              checked={s.done}
              label={s.title}
              onChange={(v) => patch("goals", goal.id, { steps: goal.steps.map((x) => (x.id === s.id ? { ...x, done: v } : x)) })}
            />
            <span className={`item-title ${s.done ? "done" : ""}`} style={{ fontWeight: 450 }}>
              {s.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
