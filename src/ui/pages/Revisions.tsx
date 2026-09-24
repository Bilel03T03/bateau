import { distributeRevision, revisionBlocks, revisionDays, revisionProgress } from "../../core/revisions";
import { diffDays, fmtDateShort, fmtDuration, fmtTime, relativeDay } from "../../lib/date";
import type { AppData, Exam } from "../../lib/types";
import { setBlockStatus } from "../../store/store";
import { Chip, Empty, Icon, Progress } from "../components/ui";
import { useData, useNow } from "../hooks";
import { open } from "../uiStore";

const DIFF = { 1: "Facile", 2: "Moyen", 3: "Difficile" } as const;

export function Revisions() {
  const data = useData();
  const { today, minutes } = useNow(60_000);
  const exams = Object.values(data.exams).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = exams.filter((x) => x.date >= today);
  const past = exams.filter((x) => x.date < today).reverse();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>📚 Révisions</h1>
          <p className="muted">Indique la date, la difficulté et le temps nécessaire : les séances sont réparties sur plusieurs jours, jamais tout la veille.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => open({ type: "weekplan" })}>
            <Icon name="wand" /> Planifier les révisions
          </button>
          <button className="btn btn-primary" onClick={() => open({ type: "exam" })}>
            <Icon name="plus" /> Examen
          </button>
        </div>
      </div>
      {upcoming.length ? upcoming.map((x) => <ExamCard key={x.id} exam={x} data={data} today={today} minutes={minutes} />) : <Empty>Aucun examen à venir. Ajoute-en un pour que tes révisions soient réparties automatiquement.</Empty>}
      {past.length > 0 && (
        <section className="panel">
          <h2>Examens passés</h2>
          <div className="list">
            {past.map((x) => {
              const p = revisionProgress(data, x, today, minutes);
              return (
                <div key={x.id} className="item clickable" onClick={() => open({ type: "exam", id: x.id })}>
                  <div className="item-main">
                    <span className="item-title">{x.title}</span>
                    <span className="item-meta">
                      {fmtDateShort(x.date)} · {fmtDuration(p.doneMin)} révisées sur {fmtDuration(p.neededMin)} prévues
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function ExamCard({ exam, data, today, minutes }: { exam: Exam; data: AppData; today: string; minutes: number }) {
  const p = revisionProgress(data, exam, today, minutes);
  const n = diffDays(today, exam.date);
  const scheduled = revisionBlocks(data, exam.id)
    .filter((e) => !e.pending && (e.date > today || (e.date === today && e.end > minutes)) && e.status !== "manque")
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const toConfirm = revisionBlocks(data, exam.id).filter((e) => (!e.status || e.status === "prevu") && (e.date < today || (e.date === today && e.end <= minutes)));
  const { plan, overflowMin } = distributeRevision(p.remainingMin, revisionDays(exam, today, minutes < data.settings.noFocusAfter - 45), {
    difficulty: exam.difficulty,
    examDate: exam.date,
  });
  const subject = exam.subjectId ? data.subjects[exam.subjectId] : undefined;
  return (
    <section className="panel" data-cat="ecole">
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div className="stack-sm">
          <h2 style={{ cursor: "pointer" }} onClick={() => open({ type: "exam", id: exam.id })}>
            {exam.title}
          </h2>
          <div className="item-meta">
            {subject && <span>{subject.name}</span>}
            <Chip tone={n <= 3 ? "bad" : n <= 7 ? "warn" : undefined}>
              {relativeDay(exam.date, today)}
              {exam.time !== undefined ? ` à ${fmtTime(exam.time)}` : ""}
            </Chip>
            <span>{DIFF[exam.difficulty]}</span>
            <span>besoin estimé : {fmtDuration(p.neededMin)}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "exam", id: exam.id })} aria-label="Modifier">
          <Icon name="edit" size={16} />
        </button>
      </div>
      <div className="stack-sm">
        <div className="spread small">
          <span>
            <strong>{fmtDuration(p.doneMin)}</strong> révisées sur {fmtDuration(p.neededMin)}
          </span>
          <span className="faint num">{p.pct} %</span>
        </div>
        <Progress value={p.pct} cat="ecole" />
      </div>
      {scheduled.length > 0 && (
        <div className="stack-sm">
          <span className="label">Déjà dans ton planning</span>
          <div className="row-wrap">
            {scheduled.map((e) => (
              <button key={e.id} className="chip" data-cat="ecole" style={{ border: 0, cursor: "pointer" }} onClick={() => open({ type: "event", key: e.id })}>
                {fmtDateShort(e.date)} {fmtTime(e.start)} · {fmtDuration(e.end - e.start)}
              </button>
            ))}
          </div>
        </div>
      )}
      {toConfirm.length > 0 && (
        <div className="stack-sm">
          <span className="label">As-tu fait ces séances ?</span>
          {toConfirm.map((e) => (
            <div key={e.id} className="row-wrap small">
              <span className="grow">
                {fmtDateShort(e.date)} {fmtTime(e.start)} · {fmtDuration(e.end - e.start)}
              </span>
              <button className="btn btn-soft btn-xs" onClick={() => setBlockStatus(e.id, "fait")}>
                ✓ Faite
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setBlockStatus(e.id, "manque")}>
                ✗ Manquée
              </button>
            </div>
          ))}
        </div>
      )}
      {p.remainingMin > 0 ? (
        <div className="stack-sm">
          <span className="label">Reste à placer : {fmtDuration(p.remainingMin)}, réparti ainsi</span>
          <div className="row-wrap">
            {plan.map((d) => (
              <span key={d.date} className="chip outline">
                {fmtDateShort(d.date)} · {fmtDuration(d.minutes)}
              </span>
            ))}
          </div>
          {overflowMin > 0 && (
            <p className="small" style={{ color: "var(--bad)" }}>
              ⚠️ Il manque des jours pour tout réviser sereinement ({fmtDuration(overflowMin)} de trop). Commence dès aujourd'hui ou réduis le besoin estimé.
            </p>
          )}
          <div>
            <button className="btn btn-sm btn-primary" onClick={() => open({ type: "weekplan" })}>
              Placer ces séances dans mon planning
            </button>
          </div>
        </div>
      ) : (
        <p className="small" style={{ color: "var(--good)" }}>
          ✓ Toutes les révisions nécessaires sont faites ou planifiées.
        </p>
      )}
    </section>
  );
}
