import type { CourseInput } from "../../core/courses";
import { DAY_SHORT } from "../../lib/date";
import { Check, Icon } from "./ui";

export interface CourseRow extends CourseInput {
  keep: boolean;
}

/** Tableau de cours modifiable (import d'emploi du temps, configuration guidée). */
export function CourseTable({
  rows,
  onChange,
  onRemove,
}: {
  rows: CourseRow[];
  onChange: (index: number, patch: Partial<CourseRow>) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th />
            <th>Jour</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Matière</th>
            <th>Salle</th>
            <th>Enseignant</th>
            {onRemove && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ opacity: r.keep ? 1 : 0.45 }}>
              <td>
                <Check checked={r.keep} onChange={(v) => onChange(i, { keep: v })} label="Garder ce cours" />
              </td>
              <td>
                <select className="select" style={{ height: 32, width: 76 }} value={r.jour} onChange={(e) => onChange(i, { jour: Number(e.target.value) })} aria-label="Jour">
                  {DAY_SHORT.map((d, k) => (
                    <option key={d} value={k + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                {r.date && <div className="tiny faint">{r.date}</div>}
              </td>
              <td>
                <input className="input sm" style={{ width: 96 }} type="time" value={r.debut} onChange={(e) => onChange(i, { debut: e.target.value })} aria-label="Début" />
              </td>
              <td>
                <input className="input sm" style={{ width: 96 }} type="time" value={r.fin} onChange={(e) => onChange(i, { fin: e.target.value })} aria-label="Fin" />
              </td>
              <td>
                <input className="input sm" style={{ minWidth: 150 }} value={r.matiere} placeholder="Matière" onChange={(e) => onChange(i, { matiere: e.target.value })} aria-label="Matière" />
              </td>
              <td>
                <input className="input sm" style={{ width: 80 }} value={r.salle ?? ""} onChange={(e) => onChange(i, { salle: e.target.value })} aria-label="Salle" />
              </td>
              <td>
                <input className="input sm" style={{ minWidth: 110 }} value={r.enseignant ?? ""} onChange={(e) => onChange(i, { enseignant: e.target.value })} aria-label="Enseignant" />
              </td>
              {onRemove && (
                <td>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onRemove(i)} aria-label="Retirer ce cours">
                    <Icon name="x" size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
