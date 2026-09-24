import { useState } from "react";
import { sleepDuration } from "../../core/energy";
import { defaultHoursFor, distributeRevision, revisionDays } from "../../core/revisions";
import { addDays, DAY_NAMES, fmtDateShort, fmtDuration, fromHHMM, nowMinutes, toHHMM, todayISO } from "../../lib/date";
import { CATEGORIES, CATEGORY_ORDER, KINDS, REMINDER_TYPES, uid } from "../../lib/meta";
import type { Exam, Goal, Recurring, Reminder, ReminderType, SleepLog, Subject, WeekType } from "../../lib/types";
import { remove, repairAround, upsert } from "../../store/store";
import { Check, Dots, Field, Icon, Sheet } from "../components/ui";
import { useData } from "../hooks";
import { close } from "../uiStore";
import { KINDS_BY_CAT } from "./EventEditor";

function Footer({ onDelete, onSave, disabled }: { onDelete?: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <>
      {onDelete && (
        <button className="btn btn-danger left" onClick={onDelete}>
          Supprimer
        </button>
      )}
      <button className="btn btn-ghost" onClick={close}>
        Annuler
      </button>
      <button className="btn btn-primary" onClick={onSave} disabled={disabled}>
        Enregistrer
      </button>
    </>
  );
}

// ---------- Examen ----------

export function ExamEditor({ id, draft }: { id?: string; draft?: Partial<Exam> }) {
  const data = useData();
  const existing = id ? data.exams[id] : undefined;
  const [form, setForm] = useState<Exam>(() => ({
    id: uid("x"),
    title: "",
    date: addDays(todayISO(), 7),
    kind: "examen",
    difficulty: 2,
    hoursNeeded: defaultHoursFor(2, "examen"),
    ...draft,
    ...existing,
  }));
  const [hoursTouched, setHoursTouched] = useState(!!existing);
  const set = (p: Partial<Exam>) =>
    setForm((f) => {
      const next = { ...f, ...p };
      if (!hoursTouched && (p.difficulty || p.kind)) next.hoursNeeded = defaultHoursFor(next.difficulty, next.kind);
      return next;
    });
  const today = todayISO();
  const preview = distributeRevision(Math.round(form.hoursNeeded * 60), revisionDays(form, today, nowMinutes() < 20 * 60), {
    difficulty: form.difficulty,
    examDate: form.date,
  });
  const save = () => {
    if (!form.title.trim()) return;
    upsert("exams", { ...form, title: form.title.trim() }, existing ? "Examen mis à jour" : `Examen ajouté : ${form.title.trim()}`);
    close();
  };
  return (
    <Sheet
      title={existing ? "Modifier l'examen" : "Nouvel examen"}
      onClose={close}
      footer={
        <Footer
          onSave={save}
          disabled={!form.title.trim()}
          onDelete={
            existing
              ? () => {
                  remove("exams", existing.id, "Examen supprimé");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <Field label="Intitulé" htmlFor="ex-title">
          <input id="ex-title" className="input" value={form.title} placeholder="Ex. Partiel de finance" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="fields-3">
          <Field label="Matière" htmlFor="ex-subject">
            <select id="ex-subject" className="select" value={form.subjectId ?? ""} onChange={(e) => set({ subjectId: e.target.value || undefined })}>
              <option value="">—</option>
              {Object.values(data.subjects).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="ex-date">
            <input id="ex-date" className="input" type="date" value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </Field>
          <Field label="Heure" htmlFor="ex-time">
            <input id="ex-time" className="input" type="time" value={form.time !== undefined ? toHHMM(form.time) : ""} onChange={(e) => set({ time: e.target.value ? fromHHMM(e.target.value) : undefined })} />
          </Field>
          <Field label="Type" htmlFor="ex-kind">
            <select id="ex-kind" className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value as Exam["kind"] })}>
              <option value="examen">Examen</option>
              <option value="partiel">Partiel</option>
              <option value="oral">Oral</option>
              <option value="devoir">Devoir surveillé</option>
            </select>
          </Field>
          <Field label="Difficulté" htmlFor="ex-diff">
            <select id="ex-diff" className="select" value={form.difficulty} onChange={(e) => set({ difficulty: Number(e.target.value) as Exam["difficulty"] })}>
              <option value={1}>Facile</option>
              <option value={2}>Moyen</option>
              <option value={3}>Difficile</option>
            </select>
          </Field>
          <Field label="Heures de révision" htmlFor="ex-hours">
            <input
              id="ex-hours"
              className="input"
              type="number"
              min={0.5}
              max={60}
              step={0.5}
              value={form.hoursNeeded}
              onChange={(e) => {
                setHoursTouched(true);
                set({ hoursNeeded: Math.max(0.5, Number(e.target.value)) });
              }}
            />
          </Field>
        </div>
        <Field label="Notes (chapitres, consignes…)" htmlFor="ex-notes">
          <textarea id="ex-notes" className="textarea" value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {!existing && preview.plan.length > 0 && (
          <div className="stack-sm">
            <span className="label">Répartition proposée</span>
            <div className="row-wrap">
              {preview.plan.map((p) => (
                <span key={p.date} className="chip outline">
                  {fmtDateShort(p.date)} · {fmtDuration(p.minutes)}
                </span>
              ))}
            </div>
            <span className="tiny faint">Les séances seront placées dans tes créneaux libres quand tu planifieras ta semaine.</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Objectif ----------

export function GoalEditor({ id, draft }: { id?: string; draft?: Partial<Goal> }) {
  const data = useData();
  const existing = id ? data.goals[id] : undefined;
  const [form, setForm] = useState<Goal>(() => ({
    id: uid("g"),
    title: "",
    horizon: "court",
    category: "perso",
    steps: [],
    createdAt: todayISO(),
    ...draft,
    ...existing,
  }));
  const [step, setStep] = useState("");
  const set = (p: Partial<Goal>) => setForm((f) => ({ ...f, ...p }));
  const addStep = () => {
    if (!step.trim()) return;
    set({ steps: [...form.steps, { id: uid("s"), title: step.trim(), done: false }] });
    setStep("");
  };
  const save = () => {
    if (!form.title.trim()) return;
    upsert("goals", { ...form, title: form.title.trim() }, existing ? "Objectif mis à jour" : "Objectif ajouté");
    close();
  };
  return (
    <Sheet
      title={existing ? "Modifier l'objectif" : "Nouvel objectif"}
      onClose={close}
      footer={
        <Footer
          onSave={save}
          disabled={!form.title.trim()}
          onDelete={
            existing
              ? () => {
                  remove("goals", existing.id, "Objectif supprimé");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <Field label="Objectif" htmlFor="goal-title">
          <input id="goal-title" className="input" value={form.title} placeholder="Ex. Valider mon semestre" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="filters" role="group" aria-label="Catégorie">
          {CATEGORY_ORDER.map((c) => (
            <button key={c} className="filter" data-cat={c} aria-pressed={form.category === c} onClick={() => set({ category: c })}>
              <span className="chip-dot" /> {CATEGORIES[c].label}
            </button>
          ))}
        </div>
        <div className="fields-2">
          <Field label="Horizon" htmlFor="goal-h">
            <select id="goal-h" className="select" value={form.horizon} onChange={(e) => set({ horizon: e.target.value as Goal["horizon"] })}>
              <option value="court">Court terme (semaine, mois)</option>
              <option value="moyen">Moyen terme (quelques mois)</option>
              <option value="long">Long terme</option>
            </select>
          </Field>
          <Field label="Échéance" hint="facultatif" htmlFor="goal-date">
            <input id="goal-date" className="input" type="date" value={form.targetDate ?? ""} onChange={(e) => set({ targetDate: e.target.value || undefined })} />
          </Field>
        </div>
        <div className="stack-sm">
          <span className="label">Étapes</span>
          {form.steps.map((s) => (
            <div key={s.id} className="row">
              <Check checked={s.done} label={s.title} onChange={(v) => set({ steps: form.steps.map((x) => (x.id === s.id ? { ...x, done: v } : x)) })} />
              <input className="input sm grow" value={s.title} aria-label="Étape" onChange={(e) => set({ steps: form.steps.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Retirer" onClick={() => set({ steps: form.steps.filter((x) => x.id !== s.id) })}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <div className="row">
            <input
              className="input sm grow"
              value={step}
              placeholder="Ajouter une petite étape…"
              aria-label="Nouvelle étape"
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addStep();
                }
              }}
            />
            <button className="btn btn-sm" onClick={addStep}>
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- Rappel ----------

export function ReminderEditor({ id, draft }: { id?: string; draft?: Partial<Reminder> }) {
  const data = useData();
  const existing = id ? data.reminders[id] : undefined;
  const [form, setForm] = useState<Reminder>(() => ({
    id: uid("r"),
    title: "",
    type: "administratif",
    dueDate: addDays(todayISO(), 7),
    repeat: "aucune",
    remindDays: 3,
    done: false,
    ...draft,
    ...existing,
  }));
  const set = (p: Partial<Reminder>) => setForm((f) => ({ ...f, ...p }));
  const save = () => {
    if (!form.title.trim()) return;
    upsert("reminders", { ...form, title: form.title.trim() }, existing ? "Rappel mis à jour" : "Rappel ajouté");
    close();
  };
  return (
    <Sheet
      title={existing ? "Modifier le rappel" : "Nouveau rappel"}
      onClose={close}
      footer={
        <Footer
          onSave={save}
          disabled={!form.title.trim()}
          onDelete={
            existing
              ? () => {
                  remove("reminders", existing.id, "Rappel supprimé");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <Field label="À ne pas oublier" htmlFor="rem-title">
          <input id="rem-title" className="input" value={form.title} placeholder="Ex. Renouveler la carte de transport" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="fields-2">
          <Field label="Type" htmlFor="rem-type">
            <select id="rem-type" className="select" value={form.type} onChange={(e) => set({ type: e.target.value as ReminderType })}>
              {Object.entries(REMINDER_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Échéance" htmlFor="rem-date">
            <input id="rem-date" className="input" type="date" value={form.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
          </Field>
          <Field label="Me prévenir" htmlFor="rem-days">
            <select id="rem-days" className="select" value={form.remindDays} onChange={(e) => set({ remindDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "le jour même" : `${d} jour${d > 1 ? "s" : ""} avant`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Répétition" htmlFor="rem-repeat">
            <select id="rem-repeat" className="select" value={form.repeat} onChange={(e) => set({ repeat: e.target.value as Reminder["repeat"] })}>
              <option value="aucune">Aucune</option>
              <option value="mensuelle">Tous les mois</option>
              <option value="annuelle">Tous les ans</option>
            </select>
          </Field>
          <Field label="Montant" hint="facultatif" htmlFor="rem-amount">
            <input id="rem-amount" className="input" type="number" min={0} step={0.01} value={form.amount ?? ""} onChange={(e) => set({ amount: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Note" htmlFor="rem-note">
          <textarea id="rem-note" className="textarea" style={{ minHeight: 60 }} value={form.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

// ---------- Sommeil ----------

export function SleepEditor({ id, date }: { id?: string; date?: string }) {
  const data = useData();
  const existing = id ? data.sleep[id] : undefined;
  const [form, setForm] = useState<SleepLog>(() => ({
    id: uid("sl"),
    date: date ?? todayISO(),
    bedtime: data.settings.bedTime,
    wake: data.settings.wakeTime,
    ...existing,
  }));
  const set = (p: Partial<SleepLog>) => setForm((f) => ({ ...f, ...p }));
  const dur = sleepDuration(form);
  const save = () => {
    upsert("sleep", form, `Nuit enregistrée : ${fmtDuration(dur)}`);
    close();
  };
  return (
    <Sheet
      title="Sommeil"
      onClose={close}
      footer={
        <Footer
          onSave={save}
          onDelete={
            existing
              ? () => {
                  remove("sleep", existing.id, "Nuit supprimée");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <div className="fields-2">
          <Field label="Date du réveil" htmlFor="sl-date">
            <input id="sl-date" className="input" type="date" value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </Field>
          <Field label="Sieste" hint="minutes" htmlFor="sl-nap">
            <input id="sl-nap" className="input" type="number" min={0} max={240} step={5} value={form.napMin ?? ""} onChange={(e) => set({ napMin: e.target.value ? Number(e.target.value) : undefined })} />
          </Field>
          <Field label="Coucher" htmlFor="sl-bed">
            <input id="sl-bed" className="input" type="time" value={toHHMM(form.bedtime)} onChange={(e) => e.target.value && set({ bedtime: fromHHMM(e.target.value) })} />
          </Field>
          <Field label="Réveil" htmlFor="sl-wake">
            <input id="sl-wake" className="input" type="time" value={toHHMM(form.wake)} onChange={(e) => e.target.value && set({ wake: fromHHMM(e.target.value) })} />
          </Field>
        </div>
        <Field label="Fatigue au réveil" hint="1 en forme · 5 épuisé">
          <Dots value={form.fatigue} onChange={(v) => set({ fatigue: v })} label="Fatigue au réveil" />
        </Field>
        <p>
          Total : <strong>{fmtDuration(dur)}</strong> <span className="muted small">(objectif {fmtDuration(data.settings.sleepTargetMin)})</span>
        </p>
      </div>
    </Sheet>
  );
}

// ---------- Matière ----------

export function SubjectEditor({ id }: { id?: string }) {
  const data = useData();
  const existing = id ? data.subjects[id] : undefined;
  const [form, setForm] = useState<Subject>(() => ({ id: uid("s"), name: "", ...existing }));
  const set = (p: Partial<Subject>) => setForm((f) => ({ ...f, ...p }));
  const save = () => {
    if (!form.name.trim()) return;
    upsert("subjects", { ...form, name: form.name.trim() }, existing ? "Matière mise à jour" : "Matière ajoutée");
    close();
  };
  return (
    <Sheet
      title={existing ? "Modifier la matière" : "Nouvelle matière"}
      onClose={close}
      footer={
        <Footer
          onSave={save}
          disabled={!form.name.trim()}
          onDelete={
            existing
              ? () => {
                  remove("subjects", existing.id, "Matière supprimée");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <Field label="Matière" htmlFor="sub-name">
          <input id="sub-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="fields-2">
          <Field label="Enseignant" htmlFor="sub-teacher">
            <input id="sub-teacher" className="input" value={form.teacher ?? ""} onChange={(e) => set({ teacher: e.target.value })} />
          </Field>
          <Field label="Salle habituelle" htmlFor="sub-room">
            <input id="sub-room" className="input" value={form.room ?? ""} onChange={(e) => set({ room: e.target.value })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- Horaire récurrent (cours, créneau Auchan) ----------

export function RecurringEditor({ id, draft }: { id?: string; draft?: Partial<Recurring> }) {
  const data = useData();
  const existing = id ? data.recurring[id] : undefined;
  const [form, setForm] = useState<Recurring>(() => ({
    id: uid("rc"),
    title: "",
    category: "ecole",
    kind: "cours",
    weekday: 1,
    start: 9 * 60,
    end: 12 * 60,
    weekTypes: ["ecole"],
    overrides: {},
    ...draft,
    ...existing,
  }));
  const set = (p: Partial<Recurring>) => setForm((f) => ({ ...f, ...p }));
  const title = form.title.trim() || (form.subjectId ? data.subjects[form.subjectId]?.name : "") || KINDS[form.kind].label;
  const valid = form.end > form.start && form.weekTypes.length > 0;
  const save = () => {
    if (!valid) return;
    upsert("recurring", { ...form, title }, existing ? "Horaire mis à jour" : `Horaire ajouté : ${title}`);
    close();
    repairAround();
  };
  return (
    <Sheet
      title={existing ? "Horaire récurrent" : "Nouvel horaire récurrent"}
      onClose={close}
      footer={
        <Footer
          onSave={save}
          disabled={!valid}
          onDelete={
            existing
              ? () => {
                  remove("recurring", existing.id, "Horaire supprimé");
                  close();
                }
              : undefined
          }
        />
      }
    >
      <div className="form">
        <Field label="Intitulé" htmlFor="rc-title">
          <input id="rc-title" className="input" value={form.title} placeholder={title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="fields-3">
          <Field label="Catégorie" htmlFor="rc-cat">
            <select
              id="rc-cat"
              className="select"
              value={form.category}
              onChange={(e) => {
                const c = e.target.value as Recurring["category"];
                set({ category: c, kind: KINDS_BY_CAT[c][0] });
              }}
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIES[c].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type" htmlFor="rc-kind">
            <select id="rc-kind" className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value as Recurring["kind"] })}>
              {KINDS_BY_CAT[form.category].map((k) => (
                <option key={k} value={k}>
                  {KINDS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jour" htmlFor="rc-day">
            <select id="rc-day" className="select" value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Début" htmlFor="rc-start">
            <input id="rc-start" className="input" type="time" value={toHHMM(form.start)} onChange={(e) => e.target.value && set({ start: fromHHMM(e.target.value) })} />
          </Field>
          <Field label="Fin" htmlFor="rc-end">
            <input id="rc-end" className="input" type="time" value={toHHMM(form.end)} onChange={(e) => e.target.value && set({ end: fromHHMM(e.target.value) })} />
          </Field>
          <Field label="Lieu" htmlFor="rc-place">
            <select id="rc-place" className="select" value={form.placeId ?? ""} onChange={(e) => set({ placeId: e.target.value || undefined })}>
              <option value="">Automatique</option>
              {Object.values(data.places).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {form.kind === "cours" && (
          <div className="fields-3">
            <Field label="Matière" htmlFor="rc-subject">
              <select
                id="rc-subject"
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
            <Field label="Enseignant" htmlFor="rc-teacher">
              <input id="rc-teacher" className="input" value={form.teacher ?? ""} onChange={(e) => set({ teacher: e.target.value })} />
            </Field>
            <Field label="Salle" htmlFor="rc-room">
              <input id="rc-room" className="input" value={form.room ?? ""} onChange={(e) => set({ room: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="stack-sm">
          <span className="label">Se répète pendant les</span>
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
                aria-pressed={form.weekTypes.includes(t)}
                onClick={() => set({ weekTypes: form.weekTypes.includes(t) ? form.weekTypes.filter((x) => x !== t) : [...form.weekTypes, t] })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="fields-2">
          <Field label="À partir du" hint="facultatif" htmlFor="rc-from">
            <input id="rc-from" className="input" type="date" value={form.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
          </Field>
          <Field label="Jusqu'au" hint="facultatif" htmlFor="rc-until">
            <input id="rc-until" className="input" type="date" value={form.until ?? ""} onChange={(e) => set({ until: e.target.value || undefined })} />
          </Field>
        </div>
        {existing && Object.keys(existing.overrides).length > 0 && (
          <p className="tiny faint">{Object.keys(existing.overrides).length} date(s) modifiée(s) ou annulée(s) individuellement dans le planning.</p>
        )}
      </div>
    </Sheet>
  );
}
