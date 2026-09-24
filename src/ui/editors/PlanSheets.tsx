import { useMemo, useState } from "react";
import { buildDayPlan } from "../../core/dayPlan";
import type { Conflict } from "../../core/frame";
import { conflictFixes } from "../../core/planner";
import { addDays, capitalize, fmtDateLong, fmtDateShort, fmtDuration, fmtTime, nowMinutes, todayISO } from "../../lib/date";
import { CATEGORIES } from "../../lib/meta";
import { applyPlan, moveOccurrence, useStore } from "../../store/store";
import { applyProposal, proposeWeek } from "../actions";
import { Check, Chip, Sheet } from "../components/ui";
import { close, go, open, ROUTES } from "../uiStore";

const ICON: Record<string, string> = { reveil: "⏰", preparation: "🥣", trajet: "🚆", repas: "🍽️", libre: "🌿", sommeil: "🌙", focus: "📖", evenement: "•" };

export function DayPlanSheet({ date: initial }: { date: string }) {
  const today = todayISO();
  const [date, setDate] = useState(initial);
  const plan = useMemo(() => buildDayPlan(useStore.getState().data, date, today, nowMinutes()), [date, today]);
  const apply = () => {
    applyPlan({ remove: plan.replaces, add: plan.proposals, unplaced: [], summary: [] }, false, `${plan.proposals.length} bloc(s) ajouté(s) à ta journée`);
    close();
  };
  return (
    <Sheet
      title="Organiser ma journée"
      onClose={close}
      wide
      footer={
        <>
          <button className="btn btn-ghost left" onClick={() => go("planning", date)}>
            Voir dans le planning
          </button>
          <button className="btn btn-ghost" onClick={close}>
            Fermer
          </button>
          {plan.proposals.length > 0 && (
            <button className="btn btn-primary" onClick={apply}>
              Ajouter les {plan.proposals.length} proposition{plan.proposals.length > 1 ? "s" : ""}
            </button>
          )}
        </>
      }
    >
      <div className="row-wrap">
        <button className="filter" aria-pressed={date === today} onClick={() => setDate(today)}>
          Aujourd'hui
        </button>
        <button className="filter" aria-pressed={date === addDays(today, 1)} onClick={() => setDate(addDays(today, 1))}>
          Demain
        </button>
        <span className="small muted">{capitalize(fmtDateLong(date))}</span>
      </div>
      {plan.notes.length > 0 && (
        <div className="stack-sm">
          {plan.notes.map((n) => (
            <p key={n} className="small" style={n.startsWith("⚠️") ? { color: "var(--bad)" } : undefined}>
              {n}
            </p>
          ))}
        </div>
      )}
      <div className="timeline">
        {plan.items.map((i, idx) => (
          <div key={idx} className={`tl ${i.proposal ? "proposal" : ""} ${i.type === "libre" && !i.key ? "free" : ""} ${["trajet", "repas", "sommeil", "reveil", "preparation"].includes(i.type) ? "muted" : ""}`}>
            <span className="tl-time">{fmtTime(i.start)}</span>
            <span className="tl-rail" data-cat={i.category}>
              <span className="tl-dot" />
            </span>
            <div className="tl-body" data-cat={i.category}>
              <div className="t">
                {i.type !== "evenement" && ICON[i.type]} {i.label}
                {i.proposal && (
                  <>
                    {" "}
                    <Chip>proposé</Chip>
                  </>
                )}
              </div>
              {(i.end || i.detail) && (
                <div className="m">
                  {i.end ? `jusqu'à ${fmtTime(i.end)}` : ""}
                  {i.detail ? `${i.end ? " · " : ""}${i.detail}` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="tiny faint">
        Les horaires suivent ton vrai planning : trajets, repas, sport et temps libre compris. Les blocs « proposés » ne sont ajoutés que si tu les valides.
      </p>
    </Sheet>
  );
}

export function WeekPlanSheet() {
  const res = useMemo(() => proposeWeek(), []);
  const data = useStore.getState().data;
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const replaced = res.remove.filter((id) => data.events[id] && !data.events[id].pending).length;
  const byDay = new Map<string, typeof res.add>();
  for (const e of [...res.add].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const kept = res.add.filter((e) => !excluded.has(e.id));
  const apply = () => {
    applyProposal({ ...res, add: kept }, `Semaine organisée : ${kept.length} bloc${kept.length > 1 ? "s" : ""} placé${kept.length > 1 ? "s" : ""}`);
    close();
  };
  return (
    <Sheet
      title="Planifier ma semaine"
      onClose={close}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!kept.length && !replaced}>
            Appliquer au planning
          </button>
        </>
      }
    >
      <p className="small muted">
        Proposition pour les 7 prochains jours, construite à partir de tes cours, de tes horaires Auchan, de tes trajets, de ton sommeil et de tes échéances. Le temps libre
        reste protégé. Décoche ce que tu ne veux pas.
      </p>
      {res.summary.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {res.summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {replaced > 0 && <p className="tiny faint">{replaced} bloc(s) automatique(s) pas encore commencé(s) seront remplacé(s) par cette nouvelle proposition.</p>}
      {byDay.size ? (
        <div className="stack">
          {[...byDay.entries()].map(([d, list]) => (
            <div key={d} className="stack-sm">
              <span className="label">{capitalize(fmtDateLong(d))}</span>
              {list.map((e) => (
                <div key={e.id} className="item" data-cat={e.category} style={{ padding: "6px 2px" }}>
                  <Check
                    checked={!excluded.has(e.id)}
                    label={e.title}
                    onChange={(v) => {
                      const next = new Set(excluded);
                      if (v) next.delete(e.id);
                      else next.add(e.id);
                      setExcluded(next);
                    }}
                  />
                  <span className="cat-bar" />
                  <div className="item-main">
                    <span className="item-title">{e.title}</span>
                    <span className="item-meta">
                      {fmtTime(e.start)}–{fmtTime(e.end)} · {fmtDuration(e.end - e.start)} · {CATEGORIES[e.category].label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p>Rien à ajouter : ta semaine est déjà organisée. 👌</p>
      )}
      {res.unplaced.length > 0 && (
        <div className="panel" style={{ background: "var(--warn-soft)", borderColor: "transparent" }}>
          <strong>Ce qui ne rentre pas</strong>
          {res.unplaced.map((u, i) => (
            <p key={i} className="small">
              • {u.label} : {fmtDuration(u.minutes)} ({u.reason})
            </p>
          ))}
          <p className="tiny muted">
            Pistes : reporter une tâche moins urgente, alléger une soirée, ou demander à l'assistant « ma semaine est trop chargée, aide-moi à déplacer ce qui peut l'être ».
          </p>
        </div>
      )}
    </Sheet>
  );
}

export function ConflictSheet({ conflict }: { conflict: Conflict }) {
  const options = useMemo(() => conflictFixes(useStore.getState().data, conflict, todayISO(), nowMinutes()), [conflict]);
  return (
    <Sheet title="⚠️ Conflit détecté" onClose={close}>
      <p>{conflict.message}</p>
      <p className="small muted">Le {fmtDateShort(conflict.date)}. Choisis une solution : le reste du planning s'adapte ensuite.</p>
      {options.length ? (
        <div className="stack-sm">
          {options.map((o) => (
            <button
              key={o.label + o.detail}
              className="btn btn-big"
              onClick={() => {
                moveOccurrence(o.key, o.date, o.start, o.end);
                close();
              }}
            >
              <span>
                <strong>{o.label}</strong>
                <span className="small muted">{o.detail}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="small">Ces deux activités sont fixes (cours, travail) : modifie l'une d'elles à la main.</p>
      )}
      <div className="row-wrap">
        <button className="btn btn-sm" onClick={() => open({ type: "event", key: conflict.key })}>
          Modifier à la main
        </button>
      </div>
    </Sheet>
  );
}

export function MoreSheet() {
  return (
    <Sheet title="Menu" onClose={close}>
      <div className="nav">
        {ROUTES.map((r) => (
          <button key={r.id} className="nav-item" onClick={() => go(r.id)} style={{ padding: "12px 10px" }}>
            <span className="nav-emoji">{r.emoji}</span>
            {r.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
