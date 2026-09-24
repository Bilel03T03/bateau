import { useEffect, useRef, type ReactNode } from "react";
import { CATEGORIES } from "../../lib/meta";
import type { Category } from "../../lib/types";

// ---------- Icônes (traits simples, 24×24) ----------

const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  down: "m6 9 6 6 6-6",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  wand: "m15 4 5 5M4 20l11-11M14 4l1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z",
  calendar: "M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z",
  send: "M4 12 20 4l-6 16-3-7-7-1Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6l1-7Z",
  stop: "M7 7h10v10H7z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
};

export function Icon({ name, size = 18, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

// ---------- Pastilles ----------

export function CatChip({ cat, label }: { cat: Category; label?: string }) {
  return (
    <span className="chip" data-cat={cat}>
      <span className="chip-dot" />
      {label ?? CATEGORIES[cat].label}
    </span>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "good" | "warn" | "bad" | "outline" }) {
  return <span className={`chip ${tone ?? ""}`}>{children}</span>;
}

// ---------- Contrôles ----------

export function Check({ checked, onChange, label, round }: { checked: boolean; onChange: (v: boolean) => void; label: string; round?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check ${round ? "round" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <Icon name="check" size={14} stroke={3} />
    </button>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dots({ value, onChange, max = 5, label }: { value?: number; onChange: (v: number) => void; max?: number; label: string }) {
  return (
    <div className="dots" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label} {hint && <span className="hint">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function Progress({ value, cat }: { value: number; cat?: Category }) {
  return (
    <div className="progress" data-cat={cat} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({ value, max, size = 56, cat, children }: { value: number; max: number; size?: number; cat?: Category; children?: ReactNode }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" data-cat={cat} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 1 ? "var(--good)" : "var(--cat, var(--ink))"}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div className="ring-text">{children ?? `${value}/${max}`}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------- Feuille modale ----------

export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select");
    if (first && window.matchMedia("(min-width: 700px)").matches) first.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
