import { useEffect, useMemo, useState } from "react";
import { monthStats, weekStats } from "../../core/stats";
import { addDays, fmtDayMonth, fmtDuration, fmtHours, fmtMonth, mondayOf, relativeDay, weekday } from "../../lib/date";
import { uid } from "../../lib/meta";
import type { AppData } from "../../lib/types";
import { upsert } from "../../store/store";
import { Chip, Icon, Progress, Ring, Seg } from "../components/ui";
import { useData, useNow } from "../hooks";

export function Stats() {
  const { today } = useNow(60_000);
  const [tab, setTab] = useState<"stats" | "bilan">(weekday(today) === 7 ? "bilan" : "stats");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>📊 Statistiques</h1>
          <p className="muted">Peu de chiffres, mais ceux qui aident à décider.</p>
        </div>
        <Seg
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "stats", label: "Statistiques" },
            { value: "bilan", label: "Bilan de la semaine" },
          ]}
        />
      </div>
      {tab === "stats" ? <StatsTab today={today} /> : <Review today={today} />}
    </>
  );
}

function StatsTab({ today }: { today: string }) {
  const data = useData();
  const monday = mondayOf(today);
  const w = useMemo(() => weekStats(data, monday), [data, monday]);
  const m = useMemo(() => monthStats(data, today, today), [data, today]);
  return (
    <>
      <section className="section">
        <h2>Cette semaine</h2>
        <div className="kpis">
          <Kpi value={fmtHours(w.workMin)} label="💼 heures chez Auchan" />
          <Kpi value={fmtHours(w.courseMin)} label="🎓 heures de cours" />
          <Kpi value={fmtHours(w.sportMin)} label="🏋️ heures de sport effectuées" />
          <Kpi value={fmtHours(w.revisionMin)} label="📚 heures de révision effectuées" />
          <Kpi value={String(w.tasksDone)} label="✅ tâches terminées" />
          <Kpi value={w.sleepNights ? fmtDuration(w.sleepAvg) : "—"} label="😴 sommeil moyen par nuit" />
        </div>
      </section>
      <section className="section">
        <h2>{fmtMonth(today)}</h2>
        <div className="kpis">
          {m.sessions.map((s) => (
            <Kpi key={s.target.id} value={String(s.count)} label={`séances de ${s.target.name}`} />
          ))}
          <Kpi value={m.tasksDue ? `${m.taskRate} %` : "—"} label={`tâches terminées à temps (${m.tasksCompleted}/${m.tasksDue})`} />
          <Kpi value={m.sleepAvg ? fmtDuration(m.sleepAvg) : "—"} label="sommeil moyen" />
          <Kpi value={`${m.regularity} %`} label="semaines avec objectifs sport atteints" />
          <Kpi value={`${m.goalsAvg} %`} label="progression moyenne des objectifs" />
        </div>
      </section>
      <GoalsSummary data={data} />
    </>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <span className="v">{value}</span>
      <span className="k">{label}</span>
    </div>
  );
}

function GoalsSummary({ data }: { data: AppData }) {
  const goals = Object.values(data.goals);
  if (!goals.length) return null;
  return (
    <section className="panel">
      <h2>Progression des objectifs</h2>
      <div className="stack-sm">
        {goals.map((g) => {
          const pct = g.steps.length ? Math.round((g.steps.filter((s) => s.done).length / g.steps.length) * 100) : 0;
          return (
            <div key={g.id} className="stack-sm" data-cat={g.category}>
              <div className="spread small">
                <span>{g.title}</span>
                <span className="num faint">{pct} %</span>
              </div>
              <Progress value={pct} cat={g.category} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Bilan de la semaine ----------

function Review({ today }: { today: string }) {
  const data = useData();
  const [monday, setMonday] = useState(mondayOf(today));
  const w = useMemo(() => weekStats(data, monday), [data, monday]);
  const sunday = addDays(monday, 6);
  const existing = Object.values(data.reviews).find((r) => r.weekStart === monday);
  const [good, setGood] = useState(existing?.good ?? "");
  const [lost, setLost] = useState(existing?.lostTime ?? "");
  const [improve, setImprove] = useState(existing?.improve ?? "");
  useEffect(() => {
    setGood(existing?.good ?? "");
    setLost(existing?.lostTime ?? "");
    setImprove(existing?.improve ?? "");
  }, [monday]);

  const tasks = Object.values(data.tasks);
  const school = tasks.filter((t) => t.category === "ecole");
  const schoolDone = school.filter((t) => t.status === "termine" && t.completedAt && t.completedAt >= monday && t.completedAt <= sunday);
  const schoolLeft = school.filter((t) => t.status !== "termine");
  const nextDeadlines = school
    .filter((t) => t.status !== "termine" && t.deadline && t.deadline > sunday && t.deadline <= addDays(sunday, 10))
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const exams = Object.values(data.exams).filter((x) => x.date > sunday && x.date <= addDays(sunday, 14));
  const auchan = tasks.filter((t) => t.category === "auchan" && ["mission", "projet", "document"].includes(t.type ?? ""));
  const missionsDone = auchan.filter((t) => t.status === "termine" && t.completedAt && t.completedAt >= monday && t.completedAt <= sunday).length;
  const missionsLeft = auchan.filter((t) => t.status !== "termine").length;

  const save = () =>
    upsert(
      "reviews",
      { id: existing?.id ?? uid("rv"), weekStart: monday, good, lostTime: lost, improve },
      "Bilan enregistré",
    );

  return (
    <>
      <div className="row">
        <button className="btn btn-icon btn-sm" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente">
          <Icon name="left" />
        </button>
        <strong>
          Semaine du {fmtDayMonth(monday)} au {fmtDayMonth(sunday)}
        </strong>
        <button className="btn btn-icon btn-sm" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante" disabled={monday >= mondayOf(today)}>
          <Icon name="right" />
        </button>
      </div>
      <div className="grid-2 even">
        <section className="panel">
          <h2>🏋️ Sport</h2>
          <div className="row-wrap" style={{ gap: 18 }}>
            {w.sport.map((r) => (
              <div key={r.target.id} className="row">
                <Ring value={r.done} max={r.target.perWeek} size={54} cat="sport" />
                <strong>{r.target.name}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>🎓 École</h2>
          <p>
            <strong>{schoolDone.length}</strong> tâche{schoolDone.length > 1 ? "s" : ""} terminée{schoolDone.length > 1 ? "s" : ""} ·{" "}
            <strong>{schoolLeft.length}</strong> restante{schoolLeft.length > 1 ? "s" : ""}
          </p>
          {(nextDeadlines.length > 0 || exams.length > 0) && (
            <div className="stack-sm small">
              <span className="label">Prochaines échéances</span>
              {exams.map((x) => (
                <span key={x.id}>📝 {x.title} · {relativeDay(x.date, today)}</span>
              ))}
              {nextDeadlines.map((t) => (
                <span key={t.id}>📌 {t.title} · {relativeDay(t.deadline!, today)}</span>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2>💼 Auchan</h2>
          <p>
            <strong>{missionsDone}</strong> mission{missionsDone > 1 ? "s" : ""} réalisée{missionsDone > 1 ? "s" : ""} · <strong>{missionsLeft}</strong> restante
            {missionsLeft > 1 ? "s" : ""}
          </p>
          <p className="small muted">{fmtHours(w.workMin)} de travail sur la semaine.</p>
        </section>
        <section className="panel">
          <h2>🧭 Organisation et sommeil</h2>
          <p>
            <strong>
              {w.focusDone}/{w.focusPlanned}
            </strong>{" "}
            blocs de travail perso réalisés · <strong>{w.tasksDone}</strong> tâches terminées
          </p>
          {w.focusPlanned > 0 && <Progress value={(w.focusDone / w.focusPlanned) * 100} />}
          <p className="small muted">
            Sommeil : {w.sleepNights ? `${fmtDuration(w.sleepAvg)} en moyenne par nuit (${w.sleepNights} nuits notées)` : "aucune nuit notée"}
            {w.sleepNights && w.sleepAvg < data.settings.sleepTargetMin - 30 ? " · sous ton objectif" : ""}
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Trois questions</h2>
        <div className="form">
          <label className="field">
            <span>Qu'est-ce qui s'est bien passé cette semaine ?</span>
            <textarea id="rv-good" className="textarea" value={good} onChange={(e) => setGood(e.target.value)} />
          </label>
          <label className="field">
            <span>Qu'est-ce qui m'a fait perdre du temps ?</span>
            <textarea id="rv-lost" className="textarea" value={lost} onChange={(e) => setLost(e.target.value)} />
          </label>
          <label className="field">
            <span>Qu'est-ce que je veux améliorer la semaine prochaine ?</span>
            <textarea id="rv-improve" className="textarea" value={improve} onChange={(e) => setImprove(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn btn-primary" onClick={save}>
              Enregistrer le bilan
            </button>
            {existing && <Chip tone="good">Bilan déjà rempli</Chip>}
          </div>
        </div>
      </section>
      <PastReviews data={data} current={monday} />
    </>
  );
}

function PastReviews({ data, current }: { data: AppData; current: string }) {
  const past = Object.values(data.reviews)
    .filter((r) => r.weekStart < current && (r.good || r.improve || r.lostTime))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, 4);
  if (!past.length) return null;
  return (
    <section className="panel">
      <h2>Bilans précédents</h2>
      <div className="list">
        {past.map((r) => (
          <div key={r.id} className="item">
            <div className="item-main">
              <span className="item-title">Semaine du {fmtDayMonth(r.weekStart)}</span>
              {r.good && <span className="small">✓ {r.good}</span>}
              {r.lostTime && <span className="small muted">⏳ {r.lostTime}</span>}
              {r.improve && <span className="small">→ {r.improve}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
