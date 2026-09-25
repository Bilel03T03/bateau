import { useMemo, useState } from "react";
import { computeAlerts } from "../../core/alerts";
import { buildDayPlan } from "../../core/dayPlan";
import { sleepDuration, sleepOn } from "../../core/energy";
import { buildFrame } from "../../core/frame";
import { weekLoad } from "../../core/load";
import { whatNow, type Advice } from "../../core/nowAdvisor";
import { weekTypeOf } from "../../core/schedule";
import { sportWeek, weekStats } from "../../core/stats";
import { addDays, capitalize, diffDays, fmtDateLong, fmtDuration, fmtHours, fmtTime, fromHHMM, mondayOf, relativeDay, toHHMM } from "../../lib/date";
import { CATEGORIES, MEAL_MODES, MEAL_SLOTS, MEAL_SLOT_ORDER, PRIORITIES, uid, WEEK_TYPES } from "../../lib/meta";
import type { AppData, CalEvent, MealMode, MealSlot, Occurrence } from "../../lib/types";
import { completeReminder, removeDemo, setDevice, updateSettings, upsert, useStore } from "../../store/store";
import { markBlock } from "../actions";
import { TaskRow } from "../components/rows";
import { CatChip, Chip, Dots, Icon, Ring } from "../components/ui";
import { useData, useNow } from "../hooks";
import { askConfirm, go, open } from "../uiStore";

export function Home() {
  const data = useData();
  const { now, today, minutes } = useNow();
  const slot = Math.floor(minutes / 5);
  const [advice, setAdvice] = useState<Advice | null>(null);

  const frame = useMemo(() => buildFrame(data, today), [data, today, slot]);
  const alerts = useMemo(() => computeAlerts(data, today, minutes), [data, today, slot]);
  const dismissed = useStore((s) => s.device.dismissed);
  const visibleAlerts = alerts.filter((a) => !dismissed[a.id]);
  const hasDemo = useMemo(() => Object.values(data.tasks).some((t) => t.demo) || Object.values(data.recurring).some((r) => r.demo), [data]);
  const weekType = weekTypeOf(today, data.settings.alternance);

  // Prochaine semaine d'un autre type (ex. « semaine école dans 4 jours »).
  const nextSwitch = useMemo(() => {
    for (let i = 1; i <= 8; i++) {
      const mon = addDays(mondayOf(today), i * 7);
      const t = weekTypeOf(mon, data.settings.alternance);
      if (t !== weekType) return { type: t, days: diffDays(today, mon) };
    }
    return null;
  }, [today, weekType, data.settings.alternance]);

  const upcoming = frame.occs.filter((o) => !o.pending && o.end > minutes && o.kind !== "libre");
  const current = upcoming.find((o) => o.start <= minutes);
  const next = upcoming.find((o) => o.start > minutes);

  return (
    <>
      <div className="hero">
        <div>
          <div className="label">Aujourd'hui</div>
          <div className="clock" aria-label={`Il est ${fmtTime(minutes)}`}>
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </div>
          <div className="hero-date">
            <strong>{capitalize(fmtDateLong(today))}</strong>
            {data.settings.name ? ` · Bonjour ${data.settings.name}` : ""}
          </div>
        </div>
        <div className="row-wrap">
          <span className="weektype" data-cat={weekType === "ecole" ? "ecole" : weekType === "entreprise" ? "auchan" : "perso"}>
            {WEEK_TYPES[weekType].label}
          </span>
          {nextSwitch && (
            <span className="small muted">
              {WEEK_TYPES[nextSwitch.type].label.toLowerCase()} dans {nextSwitch.days} jour{nextSwitch.days > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {hasDemo ? <DemoBanner /> : !data.settings.onboarded ? <Onboarding /> : null}

      <div className="cta-row">
        <button className="btn btn-big btn-primary" onClick={() => setAdvice(whatNow(data, new Date()))}>
          <span className="big-icon">👉</span>
          <span>
            <strong>Que dois-je faire maintenant ?</strong>
            <span className="small" style={{ opacity: 0.75 }}>
              Une seule action, selon l'heure, tes échéances et ta forme
            </span>
          </span>
        </button>
        <button className="btn btn-big" onClick={() => open({ type: "dayplan", date: today })}>
          <span className="big-icon">🗓️</span>
          <span>
            <strong>Organiser ma journée</strong>
            <span className="small muted">Réveil, trajets, repas, travail, temps libre</span>
          </span>
        </button>
        <button className="btn btn-big" onClick={() => open({ type: "weekplan" })}>
          <span className="big-icon">✨</span>
          <span>
            <strong>Planifier ma semaine</strong>
            <span className="small muted">Sport, révisions et tâches placés pour toi</span>
          </span>
        </button>
      </div>

      {advice && <AdviceCard advice={advice} onClose={() => setAdvice(null)} onRefresh={() => setAdvice(whatNow(useStore.getState().data, new Date()))} />}

      <div className="grid-2">
        <div className="stack">
          {next || current ? (
            <NextEvent o={next} current={current} data={data} minutes={minutes} frameLegs={frame.legs} />
          ) : (
            <div className="panel">
              <p className="muted">Plus rien de prévu aujourd'hui. Profite de ton temps libre.</p>
            </div>
          )}
          <TodayTimeline data={data} today={today} minutes={minutes} slot={slot} />
          <MealsToday data={data} today={today} />
        </div>
        <div className="stack">
          <section className="panel" aria-labelledby="alerts-h">
            <div className="panel-head">
              <h2 id="alerts-h">À retenir</h2>
              {visibleAlerts.length > 4 && <span className="small faint">{visibleAlerts.length} rappels</span>}
            </div>
            {visibleAlerts.length ? (
              <AlertList alerts={visibleAlerts} />
            ) : (
              <p className="muted small">Rien d'important à signaler. 👌</p>
            )}
          </section>
          <CheckIn data={data} today={today} minutes={minutes} wake={frame.wake} />
          <ImportantTasks data={data} today={today} />
        </div>
      </div>

      <ThisWeek data={data} today={today} minutes={minutes} slot={slot} />
    </>
  );
}

// ---------- Conseil « maintenant » ----------

function AdviceCard({ advice, onClose, onRefresh }: { advice: Advice; onClose: () => void; onRefresh: () => void }) {
  const [showAlt, setShowAlt] = useState(false);
  const { today, minutes } = useNow();
  const startBlock = (title: string, extra: Partial<CalEvent>, dur: number) => {
    const start = Math.ceil(minutes / 5) * 5;
    const ev: CalEvent = {
      id: uid("e"),
      title,
      category: "ecole",
      kind: "tache",
      date: today,
      start,
      end: Math.min(start + dur, 23 * 60 + 55),
      status: "prevu",
      origin: "manuel",
      ...extra,
    };
    upsert("events", ev, `C'est parti : ${title} jusqu'à ${fmtTime(ev.end)}`);
    onClose();
  };
  const a = advice.action;
  const data = useStore.getState().data;
  return (
    <div className="advice" role="status">
      <span className="advice-icon" aria-hidden="true">
        {advice.icon}
      </span>
      <div className="grow stack-sm">
        <p className="headline">{advice.headline}</p>
        {advice.detail && <p className="detail">{advice.detail}</p>}
        {showAlt && advice.alternatives.length > 0 && <p className="detail">Autres options : {advice.alternatives.join(" · ")}</p>}
        <div className="row-wrap" style={{ marginTop: 6 }}>
          {a?.kind === "task" && data.tasks[a.id] && (
            <button className="btn btn-primary btn-sm" onClick={() => startBlock(data.tasks[a.id].title, { taskId: a.id, category: data.tasks[a.id].category }, a.minutes)}>
              Démarrer {fmtDuration(a.minutes)}
            </button>
          )}
          {a?.kind === "exam" && data.exams[a.id] && (
            <button className="btn btn-primary btn-sm" onClick={() => startBlock(`Révision · ${data.exams[a.id].title}`, { kind: "revision", examId: a.id }, a.minutes)}>
              Démarrer {fmtDuration(a.minutes)}
            </button>
          )}
          {a?.kind === "block" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                markBlock(a.key, "fait");
                onClose();
              }}
            >
              C'est fait
            </button>
          )}
          {a?.kind === "reminder" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                completeReminder(a.id);
                onClose();
              }}
            >
              C'est réglé
            </button>
          )}
          {a?.kind === "sport" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const target = data.settings.sports.find((s) => s.id === a.sport);
                open({ type: "event", draft: { title: target?.name, kind: "sport", category: "sport", sport: a.sport, date: today, start: Math.ceil((minutes + 20) / 15) * 15, end: Math.ceil((minutes + 20) / 15) * 15 + (target?.durationMin ?? 60), placeId: target?.placeId } });
                onClose();
              }}
            >
              Ajouter la séance
            </button>
          )}
          {advice.alternatives.length > 0 && !showAlt && (
            <button className="btn btn-sm" onClick={() => setShowAlt(true)}>
              Autre idée
            </button>
          )}
          <button className="btn btn-sm" onClick={onRefresh}>
            <Icon name="refresh" size={15} /> Actualiser
          </button>
          <button className="btn btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Prochain événement ----------

function NextEvent({
  o,
  current,
  data,
  minutes,
  frameLegs,
}: {
  o?: Occurrence;
  current?: Occurrence;
  data: AppData;
  minutes: number;
  frameLegs: { toKey?: string; start: number; minutes: number }[];
}) {
  const leg = o && frameLegs.find((l) => l.toKey === o.key);
  const leaveIn = leg ? leg.start - minutes : undefined;
  const place = o?.placeId && data.places[o.placeId]?.name;
  return (
    <section className="panel" data-cat={o?.category ?? current?.category} aria-label="Prochain événement">
      {current && (
        <div className="row small" data-cat={current.category}>
          <span className="chip-dot" />
          <span>
            En ce moment : <strong>{current.title}</strong> jusqu'à {fmtTime(current.end)}
          </span>
        </div>
      )}
      {o ? (
        <>
          <div className="spread">
            <span className="label">Prochain événement</span>
            <CatChip cat={o.category} />
          </div>
          <div className="next">
            <span className="cat-bar" />
            <div className="grow stack-sm">
              <div className="when">{fmtTime(o.start)}</div>
              <div style={{ fontWeight: 620, fontSize: 17 }}>{o.title}</div>
              <div className="item-meta">
                {place && <span>📍 {place}</span>}
                {o.room && <span>salle {o.room}</span>}
                {o.teacher && <span>{o.teacher}</span>}
              </div>
              <div className="countdown">
                {leg && leaveIn !== undefined
                  ? leaveIn > 0
                    ? `Départ à ${fmtTime(leg.start)} (dans ${fmtDuration(leaveIn)}) · ${fmtDuration(leg.minutes)} de trajet`
                    : `Tu devrais être parti (trajet de ${fmtDuration(leg.minutes)})`
                  : `Dans ${fmtDuration(o.start - minutes)}`}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="small muted">Ensuite, plus rien de prévu aujourd'hui.</p>
      )}
    </section>
  );
}

// ---------- Planning du jour ----------

function TodayTimeline({ data, today, minutes, slot }: { data: AppData; today: string; minutes: number; slot: number }) {
  const plan = useMemo(() => buildDayPlan(data, today, today, minutes, false), [data, today, slot]);
  const items = plan.items.filter((i) => i.type !== "preparation" && !(i.type === "libre" && !i.key && (i.end ?? 0) - i.start < 60));
  let nowPlaced = false;
  return (
    <section className="panel" aria-labelledby="today-h">
      <div className="panel-head">
        <h2 id="today-h">Planning de la journée</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => go("planning", today)}>
          Voir <Icon name="right" size={16} />
        </button>
      </div>
      <div className="timeline">
        {items.map((i, idx) => {
          const end = i.end ?? i.start;
          const past = end <= minutes && i.type !== "sommeil";
          const showNow = !nowPlaced && i.start >= minutes;
          if (showNow) nowPlaced = true;
          const cls = ["tl", past ? "past" : "", showNow ? "now-line" : "", i.type === "libre" && !i.key ? "free" : "", i.type === "trajet" || i.type === "repas" || i.type === "sommeil" || i.type === "reveil" ? "muted" : ""].join(" ");
          return (
            <div key={idx} className={cls}>
              <span className="tl-time">{fmtTime(i.start)}</span>
              <span className="tl-rail" data-cat={i.category}>
                <span className="tl-dot" />
              </span>
              <div
                className="tl-body"
                data-cat={i.category}
                onClick={i.key ? () => open({ type: "event", key: i.key }) : undefined}
                style={{ cursor: i.key ? "pointer" : undefined }}
              >
                <div className="t">
                  {icon(i.type)} {i.label}
                </div>
                {(i.detail || i.end) && (
                  <div className="m">
                    {i.end ? `${fmtTime(i.start)}–${fmtTime(i.end)}` : ""}
                    {i.detail ? `${i.end ? " · " : ""}${i.detail}` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {plan.notes.filter((n) => n.startsWith("⚠️")).map((n) => (
        <p key={n} className="small" style={{ color: "var(--bad)" }}>
          {n}
        </p>
      ))}
    </section>
  );
}

function icon(type: string) {
  return (
    { reveil: "⏰", trajet: "🚆", repas: "🍽️", libre: "🌿", sommeil: "🌙", focus: "📖" } as Record<string, string>
  )[type] ?? "";
}

// ---------- Repas du jour ----------

function MealsToday({ data, today }: { data: AppData; today: string }) {
  const frame = useMemo(() => buildFrame(data, today), [data, today]);
  const meals = Object.values(data.meals).filter((m) => m.date === today);
  return (
    <section className="panel" aria-labelledby="meals-h">
      <div className="panel-head">
        <h2 id="meals-h">Repas du jour</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => go("planning")}>
          Semaine <Icon name="right" size={16} />
        </button>
      </div>
      <div className="stack-sm">
        {MEAL_SLOT_ORDER.map((slot) => {
          const m = meals.find((x) => x.slot === slot);
          const onSite = slot === "dejeuner" && frame.lunch?.onSite;
          return <MealLine key={slot} date={today} slot={slot} text={m?.text ?? ""} mode={m?.mode} id={m?.id} hint={onSite ? "à emporter" : undefined} />;
        })}
      </div>
    </section>
  );
}

export function MealLine({ date, slot, text, mode, id, hint }: { date: string; slot: MealSlot; text: string; mode?: MealMode; id?: string; hint?: string }) {
  const [value, setValue] = useState(text);
  const save = (t: string, md?: MealMode) => {
    if (t === text && md === mode) return;
    upsert("meals", { id: id ?? uid("m"), date, slot, text: t, mode: md ?? mode ?? (hint ? "emporter" : "maison") });
  };
  return (
    <div className="row">
      <span className="small muted" style={{ width: 96, flex: "none" }}>
        {MEAL_SLOTS[slot]}
      </span>
      <input
        className="input sm grow"
        value={value}
        placeholder={hint ? "À prévoir (à emporter)" : "—"}
        aria-label={MEAL_SLOTS[slot]}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save(value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <select
        className="select sm"
        style={{ width: 128, height: 34, fontSize: 13 }}
        value={mode ?? ""}
        aria-label={`Organisation du ${MEAL_SLOTS[slot].toLowerCase()}`}
        onChange={(e) => save(value, e.target.value as MealMode)}
      >
        <option value="" disabled>
          Comment ?
        </option>
        {Object.entries(MEAL_MODES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------- Alertes ----------

function AlertList({ alerts }: { alerts: ReturnType<typeof computeAlerts> }) {
  const [all, setAll] = useState(false);
  const shown = all ? alerts : alerts.slice(0, 4);
  const dismiss = (id: string) => setDevice({ dismissed: { ...useStore.getState().device.dismissed, [id]: new Date().toISOString() } });
  return (
    <div>
      {shown.map((a) => (
        <div key={a.id} className="alert-item" data-level={a.level}>
          <span className="ic" aria-hidden="true">
            {a.icon}
          </span>
          <span className="grow txt small">{a.text}</span>
          {a.route && (
            <button className="btn btn-ghost btn-xs" onClick={() => (a.id.startsWith("conflit") ? go("planning") : go(a.route as never))}>
              Voir
            </button>
          )}
          <button className="btn btn-ghost btn-xs" aria-label="Masquer ce rappel" onClick={() => dismiss(a.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {alerts.length > 4 && (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? "Afficher moins" : `Afficher les ${alerts.length - 4} autres`}
        </button>
      )}
    </div>
  );
}

// ---------- Confirmations rapides : séances passées et sommeil ----------

function CheckIn({ data, today, minutes, wake }: { data: AppData; today: string; minutes: number; wake: number }) {
  const toConfirm = Object.values(data.events)
    .filter(
      (e) =>
        ["sport", "revision", "tache"].includes(e.kind) &&
        !e.pending &&
        (!e.status || e.status === "prevu") &&
        (e.date < today || (e.date === today && e.end <= minutes)) &&
        e.date >= addDays(today, -7),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start)
    .slice(0, 5);
  const slept = sleepOn(data, today);
  const showSleep = !slept && minutes >= wake - 30;
  if (!toConfirm.length && !showSleep) return null;
  return (
    <section className="panel" aria-labelledby="checkin-h">
      <h2 id="checkin-h">À confirmer</h2>
      {showSleep && <SleepQuick data={data} today={today} />}
      {toConfirm.length > 0 && (
        <div className="list">
          {toConfirm.map((e) => (
            <div key={e.id} className="item" data-cat={e.category}>
              <span className="cat-bar" />
              <div className="item-main">
                <span className="item-title">{e.title}</span>
                <span className="item-meta">
                  {relativeDay(e.date, today)} · {fmtTime(e.start)}–{fmtTime(e.end)}
                </span>
              </div>
              <button className="btn btn-soft btn-xs" onClick={() => markBlock(e.id, "fait")}>
                ✓ Fait
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => markBlock(e.id, "manque")}>
                ✗ Manqué
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SleepQuick({ data, today }: { data: AppData; today: string }) {
  const last = Object.values(data.sleep).sort((a, b) => b.date.localeCompare(a.date))[0];
  const [bed, setBed] = useState(toHHMM(last?.bedtime ?? data.settings.bedTime));
  const [wake, setWake] = useState(toHHMM(data.settings.wakeTime));
  const [fatigue, setFatigue] = useState<number | undefined>();
  const dur = sleepDuration({ bedtime: fromHHMM(bed), wake: fromHHMM(wake) });
  return (
    <div className="stack-sm">
      <span className="small muted">Comment as-tu dormi cette nuit ?</span>
      <div className="row-wrap">
        <label className="row small">
          Couché
          <input className="input sm" style={{ width: 120 }} type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        </label>
        <label className="row small">
          Levé
          <input className="input sm" style={{ width: 120 }} type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </label>
        <Chip tone={dur < data.settings.sleepTargetMin - 60 ? "warn" : "good"}>{fmtDuration(dur)}</Chip>
      </div>
      <div className="row-wrap">
        <span className="small muted">Fatigue</span>
        <Dots value={fatigue} onChange={setFatigue} label="Niveau de fatigue de 1 (en forme) à 5 (épuisé)" />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => upsert("sleep", { id: uid("sl"), date: today, bedtime: fromHHMM(bed), wake: fromHHMM(wake), fatigue }, `Nuit enregistrée : ${fmtDuration(dur)}`)}
        >
          Enregistrer
        </button>
      </div>
      <span className="tiny faint">1 = en forme, 5 = épuisé. Si tu es fatigué, le planning sera allégé.</span>
    </div>
  );
}

// ---------- Tâches importantes ----------

function ImportantTasks({ data, today }: { data: AppData; today: string }) {
  const tasks = Object.values(data.tasks)
    .filter((t) => t.status !== "termine" && t.status !== "reporte")
    .map((t) => {
      const n = t.deadline ? diffDays(today, t.deadline) : 30;
      return { t, score: PRIORITIES[t.priority].weight * 10 + Math.max(0, 30 - n * 3) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.t);
  return (
    <section className="panel" aria-labelledby="tasks-h">
      <div className="panel-head">
        <h2 id="tasks-h">Tâches importantes</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => go("taches")}>
          Toutes <Icon name="right" size={16} />
        </button>
      </div>
      {tasks.length ? (
        <div className="list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} data={data} />
          ))}
        </div>
      ) : (
        <p className="muted small">Aucune tâche en attente.</p>
      )}
    </section>
  );
}

// ---------- Cette semaine ----------

function ThisWeek({ data, today, minutes, slot }: { data: AppData; today: string; minutes: number; slot: number }) {
  const monday = mondayOf(today);
  const stats = useMemo(() => weekStats(data, monday), [data, monday]);
  const load = useMemo(() => weekLoad(data, today, minutes), [data, today, slot]);
  const sport = useMemo(() => sportWeek(data, monday), [data, monday]);
  const sunday = addDays(monday, 6);
  const tasks = Object.values(data.tasks);
  const doneWeek = tasks.filter((t) => t.status === "termine" && t.completedAt && t.completedAt >= monday && t.completedAt <= sunday).length;
  const remaining = tasks.filter((t) => t.status !== "termine" && t.status !== "reporte" && t.deadline && t.deadline <= sunday).length;

  const deadlines = [
    ...tasks
      .filter((t) => t.status !== "termine" && t.deadline && t.deadline >= today)
      .map((t) => ({ id: t.id, date: t.deadline!, title: t.title, cat: t.category, kind: "task" as const })),
    ...Object.values(data.exams)
      .filter((x) => x.date >= today)
      .map((x) => ({ id: x.id, date: x.date, title: x.title, cat: "ecole" as const, kind: "exam" as const })),
    ...Object.values(data.reminders)
      .filter((r) => !r.done && r.dueDate && r.dueDate >= today)
      .map((r) => ({ id: r.id, date: r.dueDate!, title: r.title, cat: "perso" as const, kind: "reminder" as const })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  return (
    <section className="section" aria-labelledby="week-h">
      <div className="section-head">
        <h2 id="week-h">Cette semaine</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => go("stats")}>
          Statistiques <Icon name="right" size={16} />
        </button>
      </div>
      <div className="kpis six">
        <div className="kpi" data-cat="ecole">
          <span className="v">{fmtHours(stats.courseMin).replace(" h", "")}<small> h</small></span>
          <span className="k">🎓 Heures de cours</span>
        </div>
        <div className="kpi" data-cat="auchan">
          <span className="v">{fmtHours(stats.workMin).replace(" h", "")}<small> h</small></span>
          <span className="k">💼 Heures chez Auchan</span>
        </div>
        {sport.map((r) => (
          <div key={r.target.id} className="kpi row" data-cat="sport" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Ring value={r.done} max={r.target.perWeek} size={50} cat="sport" />
            <div>
              <div style={{ fontWeight: 620 }}>{r.target.name}</div>
              <div className="k">
                {r.done}/{r.target.perWeek} fait{r.done > 1 ? "es" : "e"}
                {r.planned ? ` · ${r.planned} prévue${r.planned > 1 ? "s" : ""}` : ""}
              </div>
            </div>
          </div>
        ))}
        <div className="kpi">
          <span className="v">{doneWeek}</span>
          <span className="k">✅ Tâches terminées</span>
        </div>
        <div className="kpi">
          <span className="v">{remaining}</span>
          <span className="k">⏳ Restantes d'ici dimanche</span>
        </div>
      </div>
      <div className="grid-2 even">
        <div className="load" data-level={load.level}>
          <span className="emoji" aria-hidden="true">
            {load.emoji}
          </span>
          <div>
            <strong>{load.label}</strong>
            <ul>
              {load.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {load.level !== "vert" && (
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => open({ type: "weekplan" })}>
                Réorganiser ma semaine
              </button>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Prochaines échéances</h2>
          </div>
          {deadlines.length ? (
            <div className="list">
              {deadlines.map((d) => (
                <div
                  key={d.kind + d.id}
                  className="item clickable"
                  data-cat={d.cat}
                  onClick={() => open(d.kind === "task" ? { type: "task", id: d.id } : d.kind === "exam" ? { type: "exam", id: d.id } : { type: "reminder", id: d.id })}
                >
                  <span className="cat-bar" />
                  <div className="item-main">
                    <span className="item-title">{d.title}</span>
                    <span className="item-meta">
                      {d.kind === "exam" ? "📝 Examen" : d.kind === "reminder" ? "🗂️ Rappel" : CATEGORIES[d.cat].label} · {relativeDay(d.date, today)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">Aucune échéance à venir.</p>
          )}
        </div>
      </div>
      {stats.sleepNights > 0 && (
        <p className="small muted">
          Sommeil cette semaine : {fmtDuration(stats.sleepAvg)} en moyenne sur {stats.sleepNights} nuit{stats.sleepNights > 1 ? "s" : ""}.
        </p>
      )}
    </section>
  );
}

// ---------- Exemples et premiers pas ----------

function DemoBanner() {
  return (
    <div className="banner">
      <span style={{ fontSize: 22 }} aria-hidden="true">
        👋
      </span>
      <div className="grow">
        <strong>Ce sont des données d'exemple</strong>
        <p className="small muted">Explore librement : semaine Auchan, semaine d'école, partiel, sport… Quand tu es prêt, supprime-les et entre ta vraie semaine.</p>
      </div>
      <button
        className="btn btn-sm"
        onClick={async () => {
          const ok = await askConfirm({
            title: "Supprimer les exemples ?",
            text: "Tes propres ajouts sont conservés. Tu pourras recharger les exemples depuis les Paramètres.",
            confirmLabel: "Supprimer les exemples",
            danger: true,
          });
          if (ok) {
            removeDemo();
            open({ type: "setup" });
          }
        }}
      >
        Supprimer les exemples
      </button>
    </div>
  );
}

function Onboarding() {
  return (
    <section className="banner" aria-labelledby="onb-h" style={{ borderStyle: "solid" }}>
      <span style={{ fontSize: 22 }} aria-hidden="true">
        🧭
      </span>
      <div className="grow">
        <strong id="onb-h">Configure ta vraie semaine</strong>
        <p className="small muted">Rythme d'alternance, horaires Auchan, cours, trajets et sport : 6 petites étapes, environ 5 minutes. Tout reste modifiable ensuite.</p>
      </div>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ onboarded: true })}>
          Plus tard
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => open({ type: "setup" })}>
          Commencer
        </button>
      </div>
    </section>
  );
}
