import { useMemo, useState } from "react";
import { averageSleep, sleepDuration } from "../../core/energy";
import { monthStats, sportWeek, sportWeekMet } from "../../core/stats";
import { addDays, DAY_SHORT, fmtDateShort, fmtDayMonth, fmtDuration, fmtMonth, fmtTime, fromHHMM, mondayOf, relativeDay, toHHMM } from "../../lib/date";
import type { AppData, CalEvent, SportTarget } from "../../lib/types";
import { setBlockStatus, updateSettings } from "../../store/store";
import { Bars } from "../components/Bars";
import { Chip, Empty, Icon, Ring, Seg } from "../components/ui";
import { useData, useNow } from "../hooks";
import { open } from "../uiStore";

export function Sport() {
  const [tab, setTab] = useState<"sport" | "sommeil">("sport");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>🏋️ Sport et récupération</h1>
          <p className="muted">Objectifs de la semaine vérifiés automatiquement, sommeil suivi pour doser le reste.</p>
        </div>
        <div className="actions">
          <Seg
            label="Section"
            value={tab}
            onChange={setTab}
            options={[
              { value: "sport", label: "Sport" },
              { value: "sommeil", label: "Sommeil" },
            ]}
          />
          {tab === "sport" ? (
            <button className="btn btn-primary" onClick={() => open({ type: "event", draft: { kind: "sport", category: "sport" } })}>
              <Icon name="plus" /> Séance
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => open({ type: "sleep" })}>
              <Icon name="plus" /> Nuit
            </button>
          )}
        </div>
      </div>
      {tab === "sport" ? <SportTab /> : <SleepTab />}
    </>
  );
}

function SportTab() {
  const data = useData();
  const { today } = useNow(60_000);
  const monday = mondayOf(today);
  const rows = useMemo(() => sportWeek(data, monday), [data, monday]);
  const month = useMemo(() => monthStats(data, today, today), [data, today]);
  const weekSessions = Object.values(data.events)
    .filter((e) => e.kind === "sport" && !e.pending && e.date >= monday && e.date <= addDays(monday, 6))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const history = Object.values(data.events)
    .filter((e) => e.kind === "sport" && e.status === "fait" && e.date < monday)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(monday, (i - 7) * 7));
  const perWeekTarget = data.settings.sports.reduce((s, t) => s + t.perWeek, 0);
  const bars = weeks.map((mon) => {
    const r = sportWeek(data, mon);
    const done = r.reduce((s, x) => s + x.done, 0);
    return {
      key: mon,
      label: `${Number(mon.slice(8))}/${mon.slice(5, 7)}`,
      value: done,
      tip: `Semaine du ${fmtDayMonth(mon)} : ${done} séance${done > 1 ? "s" : ""}${sportWeekMet(r) ? " · objectif atteint" : ""}`,
      dim: mon === monday,
    };
  });

  return (
    <>
      <section className="section">
        <h2>Cette semaine</h2>
        <div className="kpis">
          {rows.map((r) => (
            <div key={r.target.id} className="kpi" data-cat="sport" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Ring value={r.done} max={r.target.perWeek} size={62} cat="sport" />
              <div>
                <div style={{ fontWeight: 650, fontSize: 16 }}>
                  {r.target.name} : {r.done}/{r.target.perWeek}
                </div>
                <div className="k">
                  {r.done >= r.target.perWeek
                    ? "Objectif atteint ✓"
                    : r.planned
                      ? `${r.planned} séance${r.planned > 1 ? "s" : ""} prévue${r.planned > 1 ? "s" : ""}`
                      : `Il manque ${r.target.perWeek - r.done} séance${r.target.perWeek - r.done > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
          ))}
        </div>
        {rows.some((r) => r.done + r.planned < r.target.perWeek) && (
          <div className="banner">
            <span className="grow small">Des séances manquent encore cette semaine. Le planificateur peut les placer dans tes créneaux libres.</span>
            <button className="btn btn-sm btn-primary" onClick={() => open({ type: "weekplan" })}>
              Trouver des créneaux
            </button>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Séances de la semaine</h2>
          </div>
          {weekSessions.length ? (
            <div className="list">
              {weekSessions.map((e) => (
                <SessionRow key={e.id} e={e} today={today} />
              ))}
            </div>
          ) : (
            <Empty>Aucune séance prévue cette semaine.</Empty>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Bilan de {fmtMonth(today)}</h2>
          </div>
          <div className="kpis">
            {month.sessions.map((s) => (
              <div key={s.target.id} className="kpi">
                <span className="v">{s.count}</span>
                <span className="k">séances de {s.target.name}</span>
              </div>
            ))}
            <div className="kpi">
              <span className="v">
                {month.regularity}
                <small> %</small>
              </span>
              <span className="k">semaines réussies</span>
            </div>
          </div>
          <div className="stack-sm">
            {month.weeks.map((w) => (
              <div key={w.monday} className="spread small">
                <span>Semaine du {fmtDayMonth(w.monday)}</span>
                <span className="row">
                  {w.rows.map((r) => (
                    <span key={r.target.id} className="faint">
                      {r.target.name} {r.done}/{r.target.perWeek}
                    </span>
                  ))}
                  {w.current ? <Chip>en cours</Chip> : w.met ? <Chip tone="good">✓ réussie</Chip> : <Chip tone="bad">✗ manquée</Chip>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Séances effectuées par semaine</h2>
          <span className="small faint">8 dernières semaines</span>
        </div>
        <Bars data={bars} max={Math.max(...bars.map((b) => b.value), perWeekTarget)} target={perWeekTarget} targetLabel={`objectif ${perWeekTarget}`} cat="sport" />
      </section>

      <section className="section">
        <h2>Objectifs et créneaux habituels</h2>
        <div className="grid-2 even">
          {data.settings.sports.map((t) => (
            <SportTargetEditor key={t.id} target={t} data={data} />
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="panel">
          <h2>Historique</h2>
          <div className="list">
            {history.map((e) => (
              <SessionRow key={e.id} e={e} today={today} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SessionRow({ e, today }: { e: CalEvent; today: string }) {
  const past = e.date < today;
  return (
    <div className="item clickable" data-cat="sport" onClick={() => open({ type: "event", key: e.id })}>
      <span className="cat-bar" />
      <div className="item-main">
        <span className="item-title">{e.title}</span>
        <span className="item-meta">
          <span>
            {relativeDay(e.date, today)} · {fmtTime(e.start)} · {fmtDuration(e.end - e.start)}
          </span>
          {e.energyBefore && <span>⚡ énergie {e.energyBefore}/5</span>}
          {e.fatigueAfter && <span>😮‍💨 fatigue {e.fatigueAfter}/5</span>}
          {e.notes && <span>« {e.notes} »</span>}
        </span>
      </div>
      {e.status === "fait" ? (
        <Chip tone="good">Effectuée</Chip>
      ) : e.status === "manque" ? (
        <Chip tone="bad">Manquée</Chip>
      ) : past || e.date === today ? (
        <span className="row" onClick={(ev) => ev.stopPropagation()}>
          <button className="btn btn-soft btn-xs" onClick={() => setBlockStatus(e.id, "fait")}>
            ✓ Faite
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setBlockStatus(e.id, "manque")}>
            ✗
          </button>
        </span>
      ) : (
        <Chip>Prévue</Chip>
      )}
    </div>
  );
}

function SportTargetEditor({ target, data }: { target: SportTarget; data: AppData }) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("18:30");
  const save = (changes: Partial<SportTarget>) =>
    updateSettings({ sports: data.settings.sports.map((s) => (s.id === target.id ? { ...s, ...changes } : s)) });
  const slots = [...target.slots].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{target.name}</h3>
        <span className="row small">
          <input
            className="input sm"
            type="number"
            min={0}
            max={14}
            style={{ width: 64 }}
            value={target.perWeek}
            aria-label={`Séances de ${target.name} par semaine`}
            onChange={(e) => save({ perWeek: Math.max(0, Number(e.target.value)) })}
          />
          / semaine
        </span>
      </div>
      <div className="fields-2">
        <label className="field">
          <span>Durée</span>
          <select className="select" value={target.durationMin} onChange={(e) => save({ durationMin: Number(e.target.value) })}>
            {[45, 60, 75, 90, 120].map((m) => (
              <option key={m} value={m}>
                {fmtDuration(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Lieu</span>
          <select className="select" value={target.placeId ?? ""} onChange={(e) => save({ placeId: e.target.value || undefined })}>
            <option value="">—</option>
            {Object.values(data.places).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="stack-sm">
        <span className="small muted">
          {slots.length ? "Créneaux possibles (le planificateur choisit parmi eux) :" : "Horaires libres : le planificateur choisit un moment réaliste."}
        </span>
        <div className="row-wrap">
          {slots.map((s, i) => (
            <button
              key={i}
              className="chip outline"
              style={{ cursor: "pointer", height: 26 }}
              onClick={() => save({ slots: target.slots.filter((x) => !(x.weekday === s.weekday && x.start === s.start)) })}
              title="Retirer ce créneau"
            >
              {DAY_SHORT[s.weekday - 1]} {fmtTime(s.start)} ✕
            </button>
          ))}
        </div>
        <div className="row-wrap">
          <select className="select" style={{ width: 96, height: 34 }} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Jour">
            {DAY_SHORT.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
          <input className="input sm" type="time" style={{ width: 110 }} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Heure" />
          <button
            className="btn btn-sm"
            onClick={() => {
              const start = fromHHMM(time);
              if (!target.slots.some((x) => x.weekday === day && x.start === start)) save({ slots: [...target.slots, { weekday: day, start }] });
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sommeil ----------

function SleepTab() {
  const data = useData();
  const { today } = useNow(60_000);
  const target = data.settings.sleepTargetMin;
  const week = averageSleep(data, addDays(today, -6), today);
  const month = averageSleep(data, addDays(today, -29), today);
  const logs = Object.values(data.sleep).sort((a, b) => b.date.localeCompare(a.date));
  const nights = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const bars = nights.map((d) => {
    const log = logs.find((l) => l.date === d);
    const dur = log ? sleepDuration(log) : 0;
    return {
      key: d,
      label: String(Number(d.slice(8))),
      value: dur / 60,
      tip: log ? `${fmtDateShort(d)} : ${fmtDuration(dur)}${log.fatigue ? ` · fatigue ${log.fatigue}/5` : ""}` : `${fmtDateShort(d)} : non renseigné`,
    };
  });
  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <span className="v">{week.nights ? fmtDuration(week.avg) : "—"}</span>
          <span className="k">moyenne sur 7 jours</span>
        </div>
        <div className="kpi">
          <span className="v">{month.nights ? fmtDuration(month.avg) : "—"}</span>
          <span className="k">moyenne sur 30 jours</span>
        </div>
        <div className="kpi">
          <span className="v">{fmtDuration(target)}</span>
          <span className="k">ton objectif (modifiable dans Paramètres)</span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Heures de sommeil par nuit</h2>
          <span className="small faint">14 dernières nuits</span>
        </div>
        <Bars data={bars} max={Math.max(9, ...bars.map((b) => b.value))} target={target / 60} targetLabel={`objectif ${fmtDuration(target)}`} cat="perso" />
        <p className="tiny faint">Après une nuit courte ou si tu notes une fatigue de 4 ou 5, le planificateur réduit le travail perso prévu ce jour-là.</p>
      </section>
      <section className="panel">
        <h2>Journal</h2>
        {logs.length ? (
          <div className="list">
            {logs.slice(0, 30).map((l) => {
              const dur = sleepDuration(l);
              return (
                <div key={l.id} className="item clickable" onClick={() => open({ type: "sleep", id: l.id })}>
                  <div className="item-main">
                    <span className="item-title">
                      Nuit du {fmtDateShort(addDays(l.date, -1))} au {fmtDateShort(l.date)}
                    </span>
                    <span className="item-meta">
                      <span className="num">
                        {toHHMM(l.bedtime)} → {toHHMM(l.wake)}
                      </span>
                      {l.napMin ? <span>+ sieste {fmtDuration(l.napMin)}</span> : null}
                      {l.fatigue ? <span>fatigue {l.fatigue}/5</span> : null}
                    </span>
                  </div>
                  <Chip tone={dur < target - 60 ? "warn" : undefined}>{fmtDuration(dur)}</Chip>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>Aucune nuit enregistrée. Le matin, l'accueil te propose de la saisir en 2 secondes.</Empty>
        )}
      </section>
    </>
  );
}
