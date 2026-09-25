import { useMemo } from "react";
import { weekTiles, type DayTile } from "../../core/weekView";
import { DAY_SHORT, weekday } from "../../lib/date";
import type { AppData } from "../../lib/types";
import { go } from "../uiStore";

const ICON: Record<DayTile["kind"], string> = { travail: "💼", cours: "🎓", libre: "🌿", conges: "🏖️" };
const LEVEL: Record<DayTile["level"], string> = { calme: "journée calme", rempli: "journée remplie", charge: "journée chargée" };

/** La semaine en un coup d'œil : une tuile par jour, touche pour ouvrir le jour dans le planning. */
export function WeekStrip({ data, monday, today }: { data: AppData; monday: string; today: string }) {
  const tiles = useMemo(() => weekTiles(data, monday), [data, monday]);
  return (
    <div className="week-strip" role="list" aria-label="Semaine en un coup d'œil">
      {tiles.map((t) => {
        const past = t.date < today;
        const summary = [
          t.label,
          t.hours,
          ...t.sport.map((s) => `${s.title}${s.done ? " fait" : ""}`),
          t.exams ? `${t.exams} examen` : "",
          t.deadlines ? `${t.deadlines} échéance${t.deadlines > 1 ? "s" : ""}` : "",
          t.conflicts ? `${t.conflicts} conflit` : "",
          LEVEL[t.level],
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <button
            key={t.date}
            role="listitem"
            className={`tile ${past ? "past" : ""}`}
            data-kind={t.kind}
            aria-current={t.date === today ? "date" : undefined}
            aria-label={`${DAY_SHORT[weekday(t.date) - 1]} ${Number(t.date.slice(8))} : ${summary}`}
            title={summary}
            onClick={() => go("planning", t.date)}
          >
            <span className="t-day">
              {DAY_SHORT[weekday(t.date) - 1].replace(".", "")} <b>{Number(t.date.slice(8))}</b>
            </span>
            <span className="t-label">
              <span aria-hidden="true">{ICON[t.kind]}</span> <span className="t-name">{t.label}</span>
            </span>
            <span className="t-hours">{t.hours ?? " "}</span>
            <span className="t-icons" aria-hidden="true">
              {t.sport.map((s, i) => (
                <span key={i} title={s.title}>
                  {s.done ? "✅" : "🏋️"}
                </span>
              ))}
              {t.exams > 0 && <span>📝</span>}
              {t.deadlines > 0 && <span>📌{t.deadlines > 1 ? t.deadlines : ""}</span>}
              {t.conflicts > 0 && <span>⚠️</span>}
            </span>
            <span className="t-bar" data-level={t.level} aria-hidden="true">
              <i style={{ width: `${Math.round(t.load * 100)}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
