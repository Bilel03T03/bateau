import { fromHHMM, toHHMM } from "../../lib/date";
import { Switch } from "./ui";

export interface ShiftRowValue {
  works: boolean;
  start: number;
  end: number;
  split?: boolean;
}

/** Une ligne par jour : travaille / repos et horaires. */
export function ShiftRows<T extends ShiftRowValue>({
  rows,
  labels,
  onChange,
  idPrefix,
}: {
  rows: T[];
  labels: string[];
  onChange: (index: number, patch: Partial<ShiftRowValue>) => void;
  idPrefix: string;
}) {
  return (
    <div className="stack-sm">
      {rows.map((r, i) => (
        <div key={i} className="shift-row" data-on={r.works}>
          <span className="shift-day">
            <span className="full">{labels[i]}</span>
            <span className="short">{labels[i].slice(0, 3)}.</span>
          </span>
          <Switch id={`${idPrefix}-on-${i}`} label={`${labels[i]} : travaillé`} checked={r.works} onChange={(v) => onChange(i, { works: v })} />
          {r.works ? (
            r.split ? (
              <span className="small muted">plusieurs créneaux · à modifier dans le Planning</span>
            ) : (
              <span className="row">
                <input
                  id={`${idPrefix}-start-${i}`}
                  className="input sm"
                  type="time"
                  value={toHHMM(r.start)}
                  aria-label={`${labels[i]} : début`}
                  onChange={(e) => e.target.value && onChange(i, { start: fromHHMM(e.target.value) })}
                />
                <span className="faint">–</span>
                <input
                  id={`${idPrefix}-end-${i}`}
                  className="input sm"
                  type="time"
                  value={toHHMM(r.end)}
                  aria-label={`${labels[i]} : fin`}
                  onChange={(e) => e.target.value && onChange(i, { end: fromHHMM(e.target.value) || 24 * 60 })}
                />
              </span>
            )
          ) : (
            <span className="small faint">repos</span>
          )}
        </div>
      ))}
    </div>
  );
}
