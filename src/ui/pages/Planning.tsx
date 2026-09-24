import { useEffect, useMemo, useRef, useState } from "react";
import { buildFrame, type Conflict, type Leg } from "../../core/frame";
import { occurrencesBetween, weekTypeOf } from "../../core/schedule";
import {
  addDays,
  addMonths,
  capitalize,
  fmtDateLong,
  DAY_SHORT,
  fmtDayMonth,
  fmtMonth,
  fmtTime,
  mondayOf,
  monthGrid,
  weekDates,
  weekday,
} from "../../lib/date";
import { MEAL_MODES, MEAL_SLOTS, MEAL_SLOT_ORDER, uid, WEEK_TYPES } from "../../lib/meta";
import type { AppData, MealMode, MealSlot, Occurrence, WeekType } from "../../lib/types";
import { moveOccurrence, setDevice, updateSettings, upsert, useStore } from "../../store/store";
import { Icon, Seg } from "../components/ui";
import { useData, useMediaQuery, useNow } from "../hooks";
import { open, useUI } from "../uiStore";

type View = "jour" | "semaine" | "mois" | "repas";

export function Planning() {
  const data = useData();
  const { today, minutes } = useNow();
  const focus = useUI((s) => s.focusDate);
  const saved = useStore((s) => s.device.lastPlanningView);
  const narrow = useMediaQuery("(max-width: 640px)");
  const [view, setViewState] = useState<View>(saved === "semaine" && narrow ? "jour" : saved);
  const setView = (v: View) => {
    setViewState(v);
    if (v !== "repas") setDevice({ lastPlanningView: v });
  };
  const setFocus = (d: string) => useUI.setState({ focusDate: d });

  const step = (dir: -1 | 1) => {
    if (view === "jour") setFocus(addDays(focus, dir));
    else if (view === "mois") setFocus(addMonths(focus, dir));
    else setFocus(addDays(focus, dir * 7));
  };

  const monday = mondayOf(focus);
  const title =
    view === "jour"
      ? capitalize(fmtDateLong(focus))
      : view === "mois"
        ? capitalize(fmtMonth(focus))
        : `${fmtDayMonth(monday)} – ${fmtDayMonth(addDays(monday, 6))}`;

  const days = view === "jour" ? [focus] : weekDates(monday);
  const conflicts = useMemo(() => {
    if (view === "mois" || view === "repas") return [];
    return days.flatMap((d) => buildFrame(data, d).conflicts);
  }, [data, view, days.join()]);

  return (
    <>
      <div className="cal-toolbar">
        <div className="row">
          <button className="btn btn-icon btn-sm" onClick={() => step(-1)} aria-label="Précédent">
            <Icon name="left" />
          </button>
          <button className="btn btn-sm" onClick={() => setFocus(today)}>
            Aujourd'hui
          </button>
          <button className="btn btn-icon btn-sm" onClick={() => step(1)} aria-label="Suivant">
            <Icon name="right" />
          </button>
          <span className="cal-title">{title}</span>
        </div>
        <div className="row-wrap">
          <Seg
            label="Vue"
            value={view}
            onChange={setView}
            options={[
              { value: "jour", label: "Jour" },
              { value: "semaine", label: "Semaine" },
              { value: "mois", label: "Mois" },
              { value: "repas", label: "Repas" },
            ]}
          />
          <button className="btn btn-sm" onClick={() => open({ type: "event", draft: { date: view === "jour" ? focus : today } })}>
            <Icon name="plus" size={16} /> Ajouter
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => open({ type: "weekplan" })}>
            <Icon name="wand" size={16} /> Réorganiser ma semaine
          </button>
        </div>
      </div>

      {(view === "semaine" || view === "jour") && (
        <WeekTypeBar data={data} monday={monday} />
      )}

      {conflicts.length > 0 && <ConflictList conflicts={conflicts} />}

      {(view === "semaine" || view === "jour") && <TimeGrid data={data} days={days} today={today} minutes={minutes} conflicts={conflicts} />}
      {view === "mois" && <MonthView data={data} focus={focus} today={today} onPick={(d) => { setFocus(d); setView("jour"); }} />}
      {view === "repas" && <MealWeek data={data} monday={monday} today={today} />}

      <p className="tiny faint">
        Astuce : glisse une activité pour la déplacer (appui long sur téléphone), tire son bord inférieur pour changer sa durée, touche un créneau vide pour ajouter. Les blocs automatiques en conflit sont replacés tout seuls.
      </p>
    </>
  );
}

// ---------- Type de semaine (alternance) ----------

function WeekTypeBar({ data, monday }: { data: AppData; monday: string }) {
  const type = weekTypeOf(monday, data.settings.alternance);
  const overridden = !!data.settings.alternance.overrides[monday];
  const cycle = () => {
    const order: WeekType[] = ["ecole", "entreprise", "vacances"];
    const next = order[(order.indexOf(type) + 1) % order.length];
    const overrides = { ...data.settings.alternance.overrides, [monday]: next };
    updateSettings({ alternance: { ...data.settings.alternance, overrides } });
  };
  const reset = () => {
    const overrides = { ...data.settings.alternance.overrides };
    delete overrides[monday];
    updateSettings({ alternance: { ...data.settings.alternance, overrides } });
  };
  return (
    <div className="row-wrap">
      <button className="weektype" data-cat={type === "ecole" ? "ecole" : type === "entreprise" ? "auchan" : "perso"} style={{ border: 0 }} onClick={cycle} title="Changer le type de cette semaine">
        {WEEK_TYPES[type].label} <Icon name="refresh" size={13} />
      </button>
      <span className="tiny faint">
        {overridden ? (
          <>
            Modifiée à la main ·{" "}
            <button className="link tiny" onClick={reset}>
              revenir au rythme normal
            </button>
          </>
        ) : (
          "Touchez pour changer cette semaine (congés, rattrapage…)"
        )}
      </span>
    </div>
  );
}

function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div className="panel" style={{ borderColor: "var(--bad)" }}>
      <strong>
        ⚠️ {conflicts.length} conflit{conflicts.length > 1 ? "s" : ""} détecté{conflicts.length > 1 ? "s" : ""}
      </strong>
      {conflicts.map((c) => (
        <div key={c.id} className="spread">
          <span className="small">{c.message}</span>
          <button className="btn btn-sm" onClick={() => open({ type: "conflict", conflict: c })}>
            Résoudre
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Grille horaire (jour / semaine) avec glisser-déposer ----------

interface DragState {
  key: string;
  mode: "move" | "resize";
  pointerId: number;
  x0: number;
  y0: number;
  date: string;
  start: number;
  end: number;
  newDate: string;
  newStart: number;
  newEnd: number;
  active: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

let draggingNow = false;
// Après un glisser ou un appui sur une activité, le navigateur envoie encore un « click » : on l'ignore.
let ignoreClickUntil = 0;
if (typeof document !== "undefined") {
  // Pendant un glisser au doigt, on bloque le défilement de la page.
  document.addEventListener("touchmove", (e) => draggingNow && e.preventDefault(), { passive: false });
}

type Lane = { lane: number; lanes: number; inset?: boolean };

/** Colonnes côte à côte pour les chevauchements ; une réunion pendant le travail (ou un examen pendant un cours) se superpose. */
function layoutLanes(all: Occurrence[]): Map<string, Lane> {
  const res = new Map<string, Lane>();
  const isContainer = (o: Occurrence) => o.kind === "travail" || o.kind === "cours";
  const inside = (o: Occurrence) =>
    !isContainer(o) && all.some((c) => c !== o && isContainer(c) && c.category === o.category && c.start <= o.start && c.end >= o.end);
  const occs = all.filter((o) => !inside(o));
  for (const o of all) if (!occs.includes(o)) res.set(o.key, { lane: 0, lanes: 1, inset: true });
  const sorted = [...occs].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Occurrence[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned: [Occurrence, number][] = [];
    for (const o of cluster) {
      let lane = laneEnds.findIndex((end) => end <= o.start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(o.end);
      } else laneEnds[lane] = o.end;
      assigned.push([o, lane]);
    }
    for (const [o, lane] of assigned) res.set(o.key, { lane, lanes: laneEnds.length });
  };
  for (const o of sorted) {
    if (cluster.length && o.start >= clusterEnd) {
      flush();
      cluster = [];
    }
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.end);
  }
  if (cluster.length) flush();
  return res;
}

function TimeGrid({ data, days, today, minutes, conflicts }: { data: AppData; days: string[]; today: string; minutes: number; conflicts: Conflict[] }) {
  const narrow = useMediaQuery("(max-width: 700px)");
  const pph = narrow ? 44 : 50;
  const occs = useMemo(() => occurrencesBetween(data, days[0], days[days.length - 1]), [data, days.join()]);
  const legsByDay = useMemo(() => Object.fromEntries(days.map((d) => [d, buildFrame(data, d).legs])), [data, days.join()]);
  const earliest = Math.min(6 * 60, ...occs.map((o) => o.start), ...Object.values(legsByDay).flat().map((l) => l.start));
  const startMin = Math.floor(Math.max(0, earliest) / 60) * 60;
  const endMin = 24 * 60;
  const y = (m: number) => ((m - startMin) / 60) * pph;
  const height = y(endMin);
  const conflictKeys = new Set(conflicts.flatMap((c) => [c.key]));

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    // Ouvre la grille vers 7 h (ou l'heure actuelle).
    const target = days.includes(today) ? Math.max(startMin, minutes - 90) : 7 * 60;
    scrollRef.current?.scrollTo({ top: y(target) });
  }, [days.join()]);

  const pointToSlot = (clientX: number, clientY: number) => {
    const grid = gridRef.current!;
    const rect = grid.getBoundingClientRect();
    const hoursW = (grid.firstElementChild as HTMLElement).getBoundingClientRect().width;
    const colW = (rect.width - hoursW) / days.length;
    const col = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left - hoursW) / colW)));
    const min = startMin + ((clientY - rect.top) / pph) * 60;
    return { date: days[col], min };
  };

  const onBlockDown = (e: React.PointerEvent, o: Occurrence, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const state: DragState = {
      key: o.key,
      mode,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      date: o.date,
      start: o.start,
      end: o.end,
      newDate: o.date,
      newStart: o.start,
      newEnd: o.end,
      active: e.pointerType !== "touch",
    };
    if (e.pointerType === "touch") {
      state.timer = setTimeout(() => {
        const cur = dragRef.current;
        if (cur && cur.key === o.key) {
          draggingNow = true;
          setDrag({ ...cur, active: true });
          navigator.vibrate?.(15);
        }
      }, 320);
    }
    setDrag(state);
  };

  const onMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (dist > 8) {
        clearTimeout(d.timer);
        setDrag(null);
      }
      return;
    }
    if (dist < 4 && d.newStart === d.start && d.newDate === d.date && d.newEnd === d.end) return;
    const deltaMin = Math.round(((e.clientY - d.y0) / pph) * 60 / 15) * 15;
    if (d.mode === "resize") {
      const newEnd = Math.min(24 * 60, Math.max(d.start + 15, d.end + deltaMin));
      setDrag({ ...d, newEnd });
    } else {
      const dur = d.end - d.start;
      const { date } = pointToSlot(e.clientX, e.clientY);
      const newStart = Math.max(0, Math.min(24 * 60 - dur, d.start + deltaMin));
      setDrag({ ...d, newDate: date, newStart, newEnd: newStart + dur });
    }
  };

  const onUp = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    clearTimeout(d.timer);
    draggingNow = false;
    ignoreClickUntil = Date.now() + 250;
    setDrag(null);
    const changed = d.newDate !== d.date || d.newStart !== d.start || d.newEnd !== d.end;
    if (d.active && changed) moveOccurrence(d.key, d.newDate, d.newStart, d.newEnd);
    else if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) open({ type: "event", key: d.key });
  };

  // Pendant un glisser, on écoute la fenêtre entière : le bloc peut changer de colonne.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => onUp(e);
    const cancel = () => {
      const d = dragRef.current;
      clearTimeout(d?.timer);
      draggingNow = false;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging]);

  const onGridClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".cal-block") || Date.now() < ignoreClickUntil) return;
    const { date, min } = pointToSlot(e.clientX, e.clientY);
    const start = Math.floor(min / 30) * 30;
    open({ type: "event", draft: { date, start, end: Math.min(start + 60, 24 * 60) } });
  };

  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);

  return (
    <div className="cal-wrap" style={{ ["--days" as string]: days.length }}>
      <div className="cal-head">
        <div />
        {days.map((d) => {
          const wt = weekTypeOf(d, data.settings.alternance);
          return (
            <div key={d} className={`dh ${d === today ? "today" : ""}`} onClick={() => useUI.setState({ focusDate: d })}>
              <div className="dn">{DAY_SHORT[weekday(d) - 1]}</div>
              <div className="dd">{Number(d.slice(8))}</div>
              {days.length > 1 && weekday(d) === 1 && <div className="wt">{WEEK_TYPES[wt].short}</div>}
            </div>
          );
        })}
      </div>
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid" ref={gridRef} style={{ height }}>
          <div className="cal-hours">
            {hours.map((m) => (
              <span key={m} style={{ top: y(m) }}>
                {m > startMin ? `${m / 60}h` : ""}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayOccs = occs.filter((o) => o.date === d && !(drag?.active && o.key === drag.key && drag.newDate !== d));
            const background = dayOccs.filter((o) => o.kind === "libre");
            const fg = dayOccs.filter((o) => o.kind !== "libre");
            const lanes = layoutLanes(fg);
            const dragged = drag?.active && drag.newDate === d ? occs.find((o) => o.key === drag.key) : undefined;
            return (
              <div key={d} className={`cal-col ${d === today ? "today" : ""}`} onClick={onGridClick}>
                {hours.map((m) => (
                  <div key={m} className="cal-line" style={{ top: y(m) }} />
                ))}
                {hours.map((m) => (
                  <div key={`h${m}`} className="cal-line half" style={{ top: y(m + 30) }} />
                ))}
                {legsByDay[d]?.map((l: Leg, i: number) => (
                  <div key={i} className="cal-leg" style={{ top: y(l.start), height: Math.max(8, y(l.end) - y(l.start)) }}>
                    {l.minutes >= 20 ? `🚆 ${l.minutes} min` : ""}
                  </div>
                ))}
                {background.filter((o) => !(drag?.active && drag.key === o.key)).map((o) => (
                  <Block key={o.key} o={o} top={y(o.start)} height={y(o.end) - y(o.start)} lane={{ lane: 0, lanes: 1 }} onDown={onBlockDown} conflict={false} />
                ))}
                {fg.map((o) => {
                  const isDragged = drag?.active && drag.key === o.key;
                  if (isDragged) return null;
                  return (
                    <Block key={o.key} o={o} top={y(o.start)} height={y(o.end) - y(o.start)} lane={lanes.get(o.key)!} onDown={onBlockDown} conflict={conflictKeys.has(o.key)} />
                  );
                })}
                {dragged && drag && (
                  <Block
                    o={{ ...dragged, start: drag.newStart, end: drag.newEnd, date: d }}
                    top={y(drag.newStart)}
                    height={y(drag.newEnd) - y(drag.newStart)}
                    lane={{ lane: 0, lanes: 1 }}
                    onDown={onBlockDown}
                    conflict={false}
                    dragging
                  />
                )}
                {d === today && minutes >= startMin && <div className="cal-now" style={{ top: y(minutes) }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Block({
  o,
  top,
  height,
  lane,
  onDown,
  conflict,
  dragging,
}: {
  o: Occurrence;
  top: number;
  height: number;
  lane: Lane;
  onDown: (e: React.PointerEvent, o: Occurrence, mode: "move" | "resize") => void;
  conflict: boolean;
  dragging?: boolean;
}) {
  const w = lane.inset ? 62 : 100 / lane.lanes;
  const left = lane.inset ? 38 : lane.lane * w;
  const cls = [
    "cal-block",
    o.kind,
    o.pending ? "pending" : "",
    o.status === "fait" ? "done" : "",
    o.status === "manque" ? "missed" : "",
    conflict ? "conflict" : "",
    dragging ? "dragging" : "",
  ].join(" ");
  return (
    <div
      className={cls}
      data-cat={o.category}
      style={{
        top,
        height: Math.max(18, height - 2),
        left: `calc(${left}% + 3px)`,
        width: `calc(${w}% - 6px)`,
        right: "auto",
        zIndex: o.kind === "libre" ? 0 : lane.inset ? 6 : 1 + lane.lane,
        boxShadow: lane.inset ? "0 0 0 2px var(--surface)" : undefined,
      }}
      onPointerDown={(e) => onDown(e, o, "move")}
      role="button"
      tabIndex={0}
      aria-label={`${o.title}, ${fmtTime(o.start)} à ${fmtTime(o.end)}`}
      onKeyDown={(e) => e.key === "Enter" && open({ type: "event", key: o.key })}
    >
      <div className="bt">
        {conflict ? "⚠️ " : ""}
        {o.status === "fait" ? "✓ " : ""}
        {o.title}
      </div>
      {height > 30 && (
        <div className="bm">
          {fmtTime(o.start)}–{fmtTime(o.end)}
          {o.room ? ` · ${o.room}` : ""}
        </div>
      )}
      {!o.recurring && (
        <div
          className="resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDown(e, o, "resize");
          }}
        />
      )}
    </div>
  );
}

// ---------- Vue mois ----------

function MonthView({ data, focus, today, onPick }: { data: AppData; focus: string; today: string; onPick: (d: string) => void }) {
  const weeks = monthGrid(focus);
  const month = focus.slice(0, 7);
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  const occs = useMemo(() => occurrencesBetween(data, first, last), [data, first, last]);
  const deadlines = useMemo(() => {
    const out: Record<string, { title: string; cat: "ecole" | "auchan" | "perso" | "sport" }[]> = {};
    for (const t of Object.values(data.tasks)) {
      if (t.deadline && t.status !== "termine") (out[t.deadline] ??= []).push({ title: `📌 ${t.title}`, cat: t.category });
    }
    for (const x of Object.values(data.exams)) (out[x.date] ??= []).push({ title: `📝 ${x.title}`, cat: "ecole" });
    return out;
  }, [data.tasks, data.exams]);
  return (
    <div className="month">
      {DAY_SHORT.map((d) => (
        <div key={d} className="mh">
          {d}
        </div>
      ))}
      {weeks.flat().map((d) => {
        const items = [
          ...(deadlines[d] ?? []),
          ...occs.filter((o) => o.date === d && o.kind !== "libre").map((o) => ({ title: `${fmtTime(o.start)} ${o.title}`, cat: o.category })),
        ];
        const wt = weekday(d) === 1 ? weekTypeOf(d, data.settings.alternance) : null;
        return (
          <div key={d} className={`md ${d.slice(0, 7) !== month ? "out" : ""} ${d === today ? "today" : ""}`} onClick={() => onPick(d)}>
            <div className="spread">
              <span className="n">{Number(d.slice(8))}</span>
              {wt && <span className="wk">{WEEK_TYPES[wt].short}</span>}
            </div>
            {items.slice(0, 3).map((it, i) => (
              <span key={i} className="ev" data-cat={it.cat}>
                {it.title}
              </span>
            ))}
            {items.length > 3 && <span className="more">+{items.length - 3}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Repas de la semaine ----------

function MealWeek({ data, monday, today }: { data: AppData; monday: string; today: string }) {
  const days = weekDates(monday);
  const onSite = useMemo(() => Object.fromEntries(days.map((d) => [d, buildFrame(data, d).lunch?.onSite])), [data, monday]);
  const find = (d: string, slot: MealSlot) => Object.values(data.meals).find((m) => m.date === d && m.slot === slot);
  return (
    <>
      <p className="small muted">
        Pas d'appli de nutrition : juste de quoi ne pas te retrouver sans rien à manger. Les jours où tu es pris à midi sont signalés « à emporter ».
      </p>
      <div className="meals-scroll">
        <div className="meals">
          <div className="c h" />
          {days.map((d) => (
            <div key={d} className="c h" style={{ fontWeight: d === today ? 700 : 600 }}>
              {DAY_SHORT[weekday(d) - 1]} {Number(d.slice(8))}
              {onSite[d] && <div className="tiny" style={{ color: "var(--c-auchan-ink)" }}>🥪 à emporter</div>}
            </div>
          ))}
          {MEAL_SLOT_ORDER.map((slot) => (
            <MealRow key={slot} slot={slot} days={days} find={find} />
          ))}
        </div>
      </div>
    </>
  );
}

function MealRow({ slot, days, find }: { slot: MealSlot; days: string[]; find: (d: string, s: MealSlot) => { id: string; text: string; mode: MealMode } | undefined }) {
  return (
    <>
      <div className="c h">{MEAL_SLOTS[slot]}</div>
      {days.map((d) => {
        const m = find(d, slot);
        return <MealCell key={d + slot} date={d} slot={slot} meal={m} />;
      })}
    </>
  );
}

function MealCell({ date, slot, meal }: { date: string; slot: MealSlot; meal?: { id: string; text: string; mode: MealMode } }) {
  const [text, setText] = useState(meal?.text ?? "");
  useEffect(() => setText(meal?.text ?? ""), [meal?.text]);
  const save = (t: string, mode?: MealMode) => {
    if (t === (meal?.text ?? "") && (!mode || mode === meal?.mode)) return;
    upsert("meals", { id: meal?.id ?? uid("m"), date, slot, text: t, mode: mode ?? meal?.mode ?? "maison" });
  };
  return (
    <div className="c">
      <textarea value={text} placeholder="…" aria-label={`${MEAL_SLOTS[slot]} du ${date}`} onChange={(e) => setText(e.target.value)} onBlur={() => save(text)} />
      <select
        className="select"
        style={{ height: 26, fontSize: 11.5, padding: "0 4px", border: 0, background: "var(--surface-2)" }}
        value={meal?.mode ?? ""}
        aria-label="Organisation"
        onChange={(e) => save(text, e.target.value as MealMode)}
      >
        <option value="" disabled>
          —
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
