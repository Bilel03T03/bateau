import { diffDays, fmtDuration, fmtTime, relativeDay } from "../../lib/date";
import { KINDS, PRIORITIES, STATUSES, TASK_TYPES } from "../../lib/meta";
import type { AppData, Occurrence, Task } from "../../lib/types";
import { taskProgress } from "../../core/stats";
import { patch, setTaskStatus } from "../../store/store";
import { open } from "../uiStore";
import { CatChip, Check, Chip } from "./ui";

export function DeadlineChip({ date, today }: { date?: string; today: string }) {
  if (!date) return null;
  const n = diffDays(today, date);
  const tone = n < 0 ? "bad" : n <= 1 ? "bad" : n <= 3 ? "warn" : undefined;
  return <Chip tone={tone}>{n < 0 ? `en retard (${relativeDay(date, today)})` : relativeDay(date, today)}</Chip>;
}

export function TaskRow({ task, today, data, showCategory = true }: { task: Task; today: string; data: AppData; showCategory?: boolean }) {
  const done = task.status === "termine";
  const subDone = task.subtasks.filter((s) => s.done).length;
  const left = Math.max(0, task.estimateMin - task.spentMin);
  return (
    <div className="item clickable" onClick={() => open({ type: "task", id: task.id })}>
      <Check checked={done} onChange={(v) => setTaskStatus(task.id, v ? "termine" : "a_faire")} label={`Terminer ${task.title}`} />
      <div className="item-main">
        <span className={`item-title ${done ? "done" : ""}`}>{task.title}</span>
        <div className="item-meta">
          {showCategory && <CatChip cat={task.category} />}
          {task.subjectId && data.subjects[task.subjectId] && <span>{data.subjects[task.subjectId].name}</span>}
          {!done && <DeadlineChip date={task.deadline} today={today} />}
          {!done && (task.priority === "urgente" || task.priority === "importante") && (
            <Chip tone={task.priority === "urgente" ? "bad" : "warn"}>{PRIORITIES[task.priority].label}</Chip>
          )}
          {task.type && task.type !== "autre" && <span>{TASK_TYPES[task.type].label}</span>}
          {!done && left > 0 && <span>⏱ {fmtDuration(left)}</span>}
          {task.subtasks.length > 0 && (
            <span>
              ☑ {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.status === "en_cours" && <Chip>{STATUSES.en_cours.label} · {taskProgress(task)} %</Chip>}
          {task.status === "reporte" && <Chip tone="outline">Reporté</Chip>}
        </div>
      </div>
    </div>
  );
}

export function OccRow({ o, data, showDate, today }: { o: Occurrence; data: AppData; showDate?: boolean; today?: string }) {
  const place = o.placeId && data.places[o.placeId]?.name;
  return (
    <div className="item clickable" data-cat={o.category} onClick={() => open({ type: "event", key: o.key })}>
      <span className="cat-bar" />
      <div className="item-main">
        <span className="item-title">{o.title}</span>
        <div className="item-meta">
          <span className="num">
            {showDate && today ? `${relativeDay(o.date, today)} · ` : ""}
            {fmtTime(o.start)}–{fmtTime(o.end)}
          </span>
          <span>{KINDS[o.kind].label}</span>
          {place && <span>📍 {place}</span>}
          {o.room && <span>salle {o.room}</span>}
          {o.status === "fait" && <Chip tone="good">Fait</Chip>}
          {o.status === "manque" && <Chip tone="bad">Manqué</Chip>}
        </div>
      </div>
    </div>
  );
}

export function SubtaskList({ task }: { task: Task }) {
  return (
    <div className="list">
      {task.subtasks.map((s) => (
        <div key={s.id} className="item" style={{ padding: "6px 2px" }}>
          <Check
            checked={s.done}
            label={s.title}
            onChange={(v) => patch("tasks", task.id, { subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: v } : x)) })}
          />
          <span className={`item-title ${s.done ? "done" : ""}`} style={{ fontWeight: 450 }}>
            {s.title}
          </span>
        </div>
      ))}
    </div>
  );
}
