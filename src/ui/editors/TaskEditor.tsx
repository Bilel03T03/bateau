import { useState } from "react";
import { fmtDuration, todayISO } from "../../lib/date";
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, PRIORITY_ORDER, STATUSES, TASK_TYPES, uid } from "../../lib/meta";
import type { Task, TaskStatus } from "../../lib/types";
import { remove, setTaskStatus, upsert } from "../../store/store";
import { Check, Field, Icon, Sheet } from "../components/ui";
import { useData } from "../hooks";
import { close } from "../uiStore";

const ESTIMATES = [10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600];

export function TaskEditor({ id, draft }: { id?: string; draft?: Partial<Task> }) {
  const data = useData();
  const existing = id ? data.tasks[id] : undefined;
  const [form, setForm] = useState<Task>(() => ({
    id: uid("t"),
    title: "",
    category: "ecole",
    createdAt: todayISO(),
    estimateMin: 60,
    spentMin: 0,
    priority: "normale",
    status: "a_faire",
    subtasks: [],
    ...draft,
    ...existing,
  }));
  const [newSub, setNewSub] = useState("");
  const set = (p: Partial<Task>) => setForm((f) => ({ ...f, ...p }));
  const types = Object.entries(TASK_TYPES).filter(([, t]) => t.categories.includes(form.category));
  const estimates = ESTIMATES.includes(form.estimateMin) ? ESTIMATES : [...ESTIMATES, form.estimateMin].sort((a, b) => a - b);

  const save = () => {
    if (!form.title.trim()) return;
    const statusChanged = existing && existing.status !== form.status;
    upsert("tasks", { ...form, title: form.title.trim(), completedAt: form.status === "termine" ? form.completedAt ?? todayISO() : undefined }, existing ? "Tâche mise à jour" : `Tâche ajoutée : ${form.title.trim()}`);
    if (statusChanged && form.status === "termine") setTaskStatus(form.id, "termine");
    close();
  };

  const addSub = () => {
    if (!newSub.trim()) return;
    set({ subtasks: [...form.subtasks, { id: uid("s"), title: newSub.trim(), done: false }] });
    setNewSub("");
  };

  return (
    <Sheet
      title={existing ? "Modifier la tâche" : "Nouvelle tâche"}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              className="btn btn-danger left"
              onClick={() => {
                remove("tasks", existing.id, "Tâche supprimée");
                close();
              }}
            >
              Supprimer
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!form.title.trim()}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Titre" htmlFor="task-title">
          <input id="task-title" className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
        <div className="filters" role="group" aria-label="Catégorie">
          {CATEGORY_ORDER.map((c) => (
            <button
              key={c}
              className="filter"
              data-cat={c}
              aria-pressed={form.category === c}
              onClick={() => set({ category: c, type: form.type && TASK_TYPES[form.type].categories.includes(c) ? form.type : undefined })}
            >
              <span className="chip-dot" /> {CATEGORIES[c].label}
            </button>
          ))}
        </div>
        <div className="fields-3">
          <Field label="Type" htmlFor="task-type">
            <select id="task-type" className="select" value={form.type ?? ""} onChange={(e) => set({ type: (e.target.value || undefined) as Task["type"] })}>
              <option value="">—</option>
              {types.map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date limite" htmlFor="task-deadline">
            <input id="task-deadline" className="input" type="date" value={form.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || undefined })} />
          </Field>
          <Field label="Temps estimé" htmlFor="task-estimate">
            <select id="task-estimate" className="select" value={form.estimateMin} onChange={(e) => set({ estimateMin: Number(e.target.value) })}>
              {estimates.map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priorité" htmlFor="task-priority">
            <select id="task-priority" className="select" value={form.priority} onChange={(e) => set({ priority: e.target.value as Task["priority"] })}>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITIES[p].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="État" htmlFor="task-status">
            <select id="task-status" className="select" value={form.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {Object.entries(STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          {form.category === "ecole" ? (
            <Field label="Matière" htmlFor="task-subject">
              <select id="task-subject" className="select" value={form.subjectId ?? ""} onChange={(e) => set({ subjectId: e.target.value || undefined })}>
                <option value="">—</option>
                {Object.values(data.subjects).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Temps déjà passé" htmlFor="task-spent">
              <select id="task-spent" className="select" value={form.spentMin} onChange={(e) => set({ spentMin: Number(e.target.value) })}>
                {[...new Set([0, 15, 30, 45, 60, 90, 120, 180, 240, form.spentMin])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>
                    {m ? fmtDuration(m) : "rien"}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Description" htmlFor="task-desc">
          <textarea id="task-desc" className="textarea" value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="stack-sm">
          <span className="label">Sous-tâches</span>
          {form.subtasks.map((s) => (
            <div key={s.id} className="row">
              <Check checked={s.done} label={s.title} onChange={(v) => set({ subtasks: form.subtasks.map((x) => (x.id === s.id ? { ...x, done: v } : x)) })} />
              <input
                className="input sm grow"
                value={s.title}
                aria-label="Sous-tâche"
                onChange={(e) => set({ subtasks: form.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })}
              />
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Retirer" onClick={() => set({ subtasks: form.subtasks.filter((x) => x.id !== s.id) })}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          <div className="row">
            <input
              className="input sm grow"
              value={newSub}
              placeholder="Ajouter une étape…"
              aria-label="Nouvelle sous-tâche"
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            <button className="btn btn-sm" onClick={addSub}>
              Ajouter
            </button>
          </div>
        </div>
        {existing && (
          <p className="tiny faint">
            Créée le {new Date(existing.createdAt + "T12:00:00").toLocaleDateString("fr-FR")} · {fmtDuration(existing.spentMin)} déjà passées dessus
          </p>
        )}
      </div>
    </Sheet>
  );
}
