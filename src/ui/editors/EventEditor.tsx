import { useMemo, useState } from "react";
import { buildFrame, placeOf } from "../../core/frame";
import { occurrencesBetween } from "../../core/schedule";
import { addDays, fmtDateLong, fromHHMM, toHHMM, todayISO } from "../../lib/date";
import { BLOCK_STATUS, CATEGORIES, CATEGORY_ORDER, KINDS, uid } from "../../lib/meta";
import type { AppData, BlockStatus, CalEvent, Category, EventKind, Occurrence, WeekType } from "../../lib/types";
import { deleteOccurrence, repairAround, setBlockStatus, updateOccurrence, upsert } from "../../store/store";
import { startFocus } from "../components/FocusBar";
import { Dots, Field, Seg, Sheet, Switch } from "../components/ui";
import { useData } from "../hooks";
import { close, open } from "../uiStore";

export const KINDS_BY_CAT: Record<Category, EventKind[]> = {
  ecole: ["cours", "examen", "revision", "tache", "autre"],
  auchan: ["travail", "reunion", "tache", "autre"],
  sport: ["sport"],
  perso: ["rdv", "libre", "tache", "autre"],
};

function findOccurrence(data: AppData, key: string): Occurrence | undefined {
  if (data.events[key]) return { ...data.events[key], key };
  const at = key.indexOf("@");
  if (at < 0) return undefined;
  const base = key.slice(at + 1);
  return occurrencesBetween(data, addDays(base, -7), addDays(base, 7)).find((o) => o.key === key);
}

export function EventEditor({ eventKey, draft }: { eventKey?: string; draft?: Partial<CalEvent> }) {
  const data = useData();
  const existing = eventKey ? findOccurrence(data, eventKey) : undefined;
  const isNew = !existing;
  const initialCat: Category = existing?.category ?? draft?.category ?? (draft?.kind ? KINDS[draft.kind].category : "perso");
  const [form, setForm] = useState<Partial<CalEvent>>(() => ({
    title: "",
    category: initialCat,
    kind: draft?.kind ?? KINDS_BY_CAT[initialCat][0],
    date: todayISO(),
    start: 18 * 60,
    end: 19 * 60,
    ...draft,
    ...existing,
  }));
  const [repeat, setRepeat] = useState(false);
  const [weekTypes, setWeekTypes] = useState<WeekType[]>(initialCat === "ecole" ? ["ecole"] : initialCat === "auchan" ? ["entreprise"] : ["ecole", "entreprise", "vacances"]);
  const set = (p: Partial<CalEvent>) => setForm((f) => ({ ...f, ...p }));

  const conflicts = useMemo(() => {
    if (!existing) return [];
    return buildFrame(data, existing.date).conflicts.filter((c) => c.key === existing.key || c.otherKey === existing.key);
  }, [data, existing]);

  const kind = form.kind ?? "rdv";
  const cat = form.category ?? "perso";
  const sportTarget = data.settings.sports.find((s) => s.id === form.sport);
  const valid = !!form.date && form.start !== undefined && form.end !== undefined && form.end > form.start;
  const title = form.title?.trim() || (kind === "sport" ? sportTarget?.name ?? "Sport" : kind === "cours" && form.subjectId ? data.subjects[form.subjectId]?.name : KINDS[kind].label);

  const save = () => {
    if (!valid) return;
    if (existing) {
      const changes: Partial<CalEvent> & { key?: string; recurring?: boolean } = { ...form, title };
      delete changes.key;
      delete changes.recurring;
      const status = changes.status;
      delete changes.status;
      // Le statut passe par setBlockStatus pour mettre à jour le temps passé sur la tâche.
      if (status && status !== existing.status && !existing.recurring) setBlockStatus(existing.key, status);
      updateOccurrence(existing.key, changes, "Modifications enregistrées");
    } else if (repeat) {
      const d = new Date(form.date + "T12:00:00");
      const wd = d.getDay() === 0 ? 7 : d.getDay();
      upsert(
        "recurring",
        {
          id: uid("rc"),
          title: title!,
          category: cat,
          kind,
          weekday: wd,
          start: form.start!,
          end: form.end!,
          placeId: form.placeId,
          subjectId: form.subjectId,
          teacher: form.teacher,
          room: form.room,
          weekTypes,
          from: form.date,
          overrides: {},
        },
        `Horaire récurrent ajouté : ${title}`,
      );
    } else {
      const ev: CalEvent = {
        id: uid("e"),
        title: title!,
        category: cat,
        kind,
        date: form.date!,
        start: form.start!,
        end: form.end!,
        placeId: form.placeId,
        notes: form.notes,
        subjectId: form.subjectId,
        teacher: form.teacher,
        room: form.room,
        sport: kind === "sport" ? form.sport ?? data.settings.sports[0]?.id : undefined,
        status: ["sport", "revision", "tache"].includes(kind) ? form.status ?? "prevu" : undefined,
        energyBefore: form.energyBefore,
        fatigueAfter: form.fatigueAfter,
        taskId: form.taskId,
        examId: form.examId,
        origin: "manuel",
      };
      if (!ev.placeId) ev.placeId = placeOf(data, { ...ev, key: ev.id });
      upsert("events", ev, `Ajouté : ${ev.title}`);
    }
    close();
    repairAround();
  };

  return (
    <Sheet
      title={isNew ? "Nouvel événement" : existing?.recurring ? "Occurrence d'un horaire récurrent" : "Modifier l'événement"}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn btn-danger left"
              onClick={() => {
                deleteOccurrence(existing.key);
                close();
              }}
            >
              {existing.recurring ? "Annuler ce jour-là" : "Supprimer"}
            </button>
          )}
          {existing && !existing.recurring && (kind === "revision" || kind === "tache") && existing.status !== "fait" && (
            <button
              className="btn"
              onClick={() => {
                startFocus(existing.title, existing.end - existing.start, existing.key);
                close();
              }}
            >
              ▶ Démarrer
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            Enregistrer
          </button>
        </>
      }
    >
      {conflicts.map((c) => (
        <div key={c.id} className="banner" style={{ borderColor: "var(--bad)" }}>
          <span className="grow small">⚠️ {c.message}</span>
          <button className="btn btn-sm" onClick={() => open({ type: "conflict", conflict: c })}>
            Résoudre
          </button>
        </div>
      ))}
      {existing?.recurring && (
        <p className="small muted">
          Les changements ici ne concernent que le {fmtDateLong(existing.date)}.{" "}
          <button className="link small" onClick={() => open({ type: "recurring", id: existing.templateId })}>
            Modifier l'horaire récurrent
          </button>
        </p>
      )}
      <div className="form">
        <Field label="Titre" htmlFor="ev-title">
          <input id="ev-title" className="input" value={form.title ?? ""} placeholder={title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        {!existing?.recurring && (
          <div className="filters" role="group" aria-label="Catégorie">
            {CATEGORY_ORDER.map((c) => (
              <button key={c} className="filter" aria-pressed={cat === c} data-cat={c} onClick={() => set({ category: c, kind: KINDS_BY_CAT[c].includes(kind) ? kind : KINDS_BY_CAT[c][0] })}>
                <span className="chip-dot" /> {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        )}
        <div className="fields-3">
          <Field label="Type" htmlFor="ev-kind">
            <select id="ev-kind" className="select" value={kind} disabled={existing?.recurring} onChange={(e) => set({ kind: e.target.value as EventKind })}>
              {KINDS_BY_CAT[cat].map((k) => (
                <option key={k} value={k}>
                  {KINDS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="ev-date">
            <input id="ev-date" className="input" type="date" value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </Field>
          <Field label="Lieu" htmlFor="ev-place">
            <select id="ev-place" className="select" value={form.placeId ?? ""} onChange={(e) => set({ placeId: e.target.value || undefined })}>
              <option value="">Automatique</option>
              {Object.values(data.places).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Début" htmlFor="ev-start">
            <input
              id="ev-start"
              className="input"
              type="time"
              value={toHHMM(form.start ?? 0)}
              onChange={(e) => {
                if (!e.target.value) return;
                const start = fromHHMM(e.target.value);
                const dur = (form.end ?? start + 60) - (form.start ?? start);
                set({ start, end: Math.min(24 * 60, start + Math.max(15, dur)) });
              }}
            />
          </Field>
          <Field label="Fin" htmlFor="ev-end">
            <input id="ev-end" className="input" type="time" value={toHHMM(form.end ?? 0)} onChange={(e) => e.target.value && set({ end: fromHHMM(e.target.value) || 24 * 60 })} />
          </Field>
        </div>

        {(kind === "cours" || kind === "examen") && (
          <div className="fields-3">
            <Field label="Matière" htmlFor="ev-subject">
              <select
                id="ev-subject"
                className="select"
                value={form.subjectId ?? ""}
                onChange={(e) => {
                  const s = data.subjects[e.target.value];
                  set({ subjectId: e.target.value || undefined, teacher: form.teacher || s?.teacher, room: form.room || s?.room });
                }}
              >
                <option value="">—</option>
                {Object.values(data.subjects).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Enseignant" htmlFor="ev-teacher">
              <input id="ev-teacher" className="input" value={form.teacher ?? ""} onChange={(e) => set({ teacher: e.target.value })} />
            </Field>
            <Field label="Salle" htmlFor="ev-room">
              <input id="ev-room" className="input" value={form.room ?? ""} onChange={(e) => set({ room: e.target.value })} />
            </Field>
          </div>
        )}

        {kind === "sport" && (
          <>
            <div className="fields-2">
              <Field label="Sport" htmlFor="ev-sport">
                <select
                  id="ev-sport"
                  className="select"
                  value={form.sport ?? data.settings.sports[0]?.id}
                  onChange={(e) => {
                    const t = data.settings.sports.find((s) => s.id === e.target.value);
                    set({ sport: e.target.value, placeId: t?.placeId ?? form.placeId });
                  }}
                >
                  {data.settings.sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Séance">
                <Seg<BlockStatus>
                  label="État de la séance"
                  value={form.status ?? "prevu"}
                  onChange={(status) => set({ status })}
                  options={(["prevu", "fait", "manque"] as BlockStatus[]).map((s) => ({ value: s, label: BLOCK_STATUS[s] }))}
                />
              </Field>
            </div>
            <div className="fields-2">
              <Field label="Énergie avant" hint="1 à 5">
                <Dots value={form.energyBefore} onChange={(v) => set({ energyBefore: v })} label="Énergie avant la séance" />
              </Field>
              <Field label="Fatigue après" hint="1 à 5">
                <Dots value={form.fatigueAfter} onChange={(v) => set({ fatigueAfter: v })} label="Fatigue après la séance" />
              </Field>
            </div>
          </>
        )}

        {(kind === "revision" || kind === "tache") && (
          <div className="fields-2">
            {kind === "revision" ? (
              <Field label="Examen" htmlFor="ev-exam">
                <select id="ev-exam" className="select" value={form.examId ?? ""} onChange={(e) => set({ examId: e.target.value || undefined })}>
                  <option value="">—</option>
                  {Object.values(data.exams).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Tâche liée" htmlFor="ev-task">
                <select id="ev-task" className="select" value={form.taskId ?? ""} onChange={(e) => set({ taskId: e.target.value || undefined })}>
                  <option value="">—</option>
                  {Object.values(data.tasks)
                    .filter((t) => t.status !== "termine" || t.id === form.taskId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Réalisé ?">
              <Seg<BlockStatus>
                label="État du bloc"
                value={form.status ?? "prevu"}
                onChange={(status) => set({ status })}
                options={[
                  { value: "prevu", label: "Prévu" },
                  { value: "fait", label: "Fait" },
                  { value: "manque", label: "Manqué" },
                ]}
              />
            </Field>
          </div>
        )}

        {!existing?.recurring && (
          <Field label="Note" htmlFor="ev-notes">
            <textarea id="ev-notes" className="textarea" style={{ minHeight: 60 }} value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        )}

        {isNew && !["revision", "tache", "sport", "examen"].includes(kind) && (
          <div className="stack-sm">
            <div className="spread">
              <span>Répéter chaque semaine</span>
              <Switch label="Répéter chaque semaine" checked={repeat} onChange={setRepeat} />
            </div>
            {repeat && (
              <div className="filters" role="group" aria-label="Semaines concernées">
                {(
                  [
                    ["ecole", "Semaines d'école"],
                    ["entreprise", "Semaines Auchan"],
                    ["vacances", "Congés"],
                  ] as [WeekType, string][]
                ).map(([t, label]) => (
                  <button
                    key={t}
                    className="filter"
                    aria-pressed={weekTypes.includes(t)}
                    onClick={() => setWeekTypes(weekTypes.includes(t) ? weekTypes.filter((x) => x !== t) : [...weekTypes, t])}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
