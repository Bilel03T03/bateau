import type { Category } from "../../lib/types";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Texte affiché au survol (valeur formatée + contexte). */
  tip: string;
  dim?: boolean;
}

/** Histogramme à une seule série, avec une ligne d'objectif facultative. */
export function Bars({ data, max, target, targetLabel, cat, height = 130 }: { data: BarDatum[]; max: number; target?: number; targetLabel?: string; cat?: Category; height?: number }) {
  const top = Math.max(max, target ?? 0, 1);
  return (
    <div className="barchart" data-cat={cat} style={{ height }}>
      {target !== undefined && (
        <div className="target" style={{ bottom: 18 + (height - 36) * (target / top) }}>
          <span>{targetLabel}</span>
        </div>
      )}
      <div className="bars" style={{ height: "100%" }}>
        {data.map((d) => (
          <div key={d.key} className={`b ${d.dim ? "dim" : ""}`} tabIndex={0} aria-label={d.tip}>
            <span className="tip" role="tooltip">
              {d.tip}
            </span>
            <i style={{ height: `calc((100% - 18px) * ${d.value / top})` }} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
