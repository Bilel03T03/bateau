import { useMemo, useRef, useState } from "react";
import { parseQuickAdd, type ParsedEntry } from "../../core/quickAdd";
import { fmtDuration, fmtTime, relativeDay, todayISO } from "../../lib/date";
import { CATEGORIES, CATEGORY_ORDER, KINDS, PRIORITIES, TASK_TYPES } from "../../lib/meta";
import type { Category } from "../../lib/types";
import { createFromParsed } from "../actions";
import { CatChip, Chip, Icon } from "../components/ui";
import { useData } from "../hooks";
import { close, open } from "../uiStore";

const EXAMPLES = [
  "Préparer présentation stratégie commerciale vendredi",
  "CrossFit demain 18h30",
  "Demander mes horaires de décembre au manager",
  "Dentiste jeudi 14h30",
  "Examen droit commercial le 15/10",
];

export function QuickAdd({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const data = useData();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [cat, setCat] = useState<Category | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

  const parsed = useMemo<ParsedEntry | null>(() => {
    if (!text.trim()) return null;
    const p = parseQuickAdd(text, today, Object.values(data.subjects), data.settings.sports);
    return cat ? { ...p, category: cat } : p;
  }, [text, cat, today, data.subjects, data.settings.sports]);

  const submit = () => {
    if (!parsed) return;
    createFromParsed(parsed);
    setText("");
    setCat(null);
    onDone?.();
  };

  const edit = () => {
    if (!parsed) return;
    if (parsed.kind === "evenement") {
      open({ type: "event", draft: { title: parsed.title, category: parsed.category, kind: parsed.eventKind, date: parsed.date, start: parsed.start, end: parsed.end, sport: parsed.sport } });
    } else if (parsed.kind === "examen") {
      open({ type: "exam", draft: { title: parsed.title, date: parsed.date, subjectId: parsed.subjectId } });
    } else {
      open({
        type: "task",
        draft: {
          title: parsed.title,
          category: parsed.category,
          deadline: parsed.date,
          estimateMin: parsed.estimateMin,
          priority: parsed.priority,
          type: parsed.type,
          subjectId: parsed.subjectId,
        },
      });
    }
    setText("");
    setCat(null);
  };

  const cycleCat = () => {
    const current = parsed?.category ?? "perso";
    const next = CATEGORY_ORDER[(CATEGORY_ORDER.indexOf(current) + 1) % CATEGORY_ORDER.length];
    setCat(next);
    inputRef.current?.focus();
  };

  return (
    <div className="quick" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}>
      <span className="quick-icon">
        <Icon name="plus" />
      </span>
      <input
        ref={inputRef}
        className="quick-input"
        value={text}
        autoFocus={autoFocus}
        placeholder="Ajouter… ex. « Préparer présentation stratégie commerciale vendredi »"
        aria-label="Ajout rapide"
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value) setCat(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setText("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {focused && (
        <div className="quick-pop" tabIndex={-1}>
          {parsed ? (
            <>
              <div className="row-wrap">
                <span className="label">
                  {parsed.kind === "evenement" ? KINDS[parsed.eventKind ?? "rdv"].label : parsed.kind === "examen" ? "Examen (révisions)" : "Tâche"}
                </span>
                <strong className="grow">{parsed.title || "…"}</strong>
              </div>
              <div className="row-wrap">
                <button type="button" className="btn btn-xs btn-cat" data-cat={parsed.category} onClick={cycleCat} title="Changer de catégorie">
                  {CATEGORIES[parsed.category].icon} {CATEGORIES[parsed.category].label}
                </button>
                {parsed.date ? <Chip>📅 {relativeDay(parsed.date, today)}</Chip> : <Chip tone="outline">sans date</Chip>}
                {parsed.start !== undefined && (
                  <Chip>
                    🕒 {fmtTime(parsed.start)}
                    {parsed.end ? `–${fmtTime(parsed.end)}` : ""}
                  </Chip>
                )}
                {parsed.kind === "tache" && (
                  <>
                    <Chip tone={parsed.priority === "urgente" ? "bad" : parsed.priority === "importante" ? "warn" : undefined}>
                      {PRIORITIES[parsed.priority].label}
                    </Chip>
                    <Chip>⏱ {fmtDuration(parsed.estimateMin)}</Chip>
                    {parsed.type && parsed.type !== "autre" && <Chip tone="outline">{TASK_TYPES[parsed.type].label}</Chip>}
                  </>
                )}
                {parsed.subjectId && <CatChip cat="ecole" label={data.subjects[parsed.subjectId]?.name} />}
              </div>
              <div className="spread">
                <span className="tiny faint">
                  <kbd>Entrée</kbd> pour ajouter · catégorie, priorité et durée sont estimées, modifiables ensuite
                </span>
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={edit}>
                    Détails
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
                    Ajouter
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="stack-sm">
              <span className="label">Écris naturellement, par exemple</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="link"
                  style={{ textAlign: "left", textDecoration: "none" }}
                  onClick={() => {
                    setText(ex);
                    inputRef.current?.focus();
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuickAddSheet() {
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-label="Ajout rapide" style={{ minHeight: "66vh" }}>
        <div className="sheet-head">
          <h2>Ajouter</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        <QuickAdd autoFocus onDone={close} />
        <div className="row-wrap" style={{ marginTop: "auto" }}>
          <button className="btn btn-soft btn-sm" onClick={() => open({ type: "task" })}>
            Tâche détaillée
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => open({ type: "event" })}>
            Événement
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => open({ type: "exam" })}>
            Examen
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => open({ type: "reminder" })}>
            Rappel
          </button>
          <button className="btn btn-soft btn-sm" onClick={() => open({ type: "sleep" })}>
            Sommeil
          </button>
        </div>
      </div>
    </div>
  );
}
