// Configuration guidée : ta vraie semaine en quelques minutes, étape par étape.
// Chaque « Suivant » enregistre l'étape, on peut donc s'arrêter à tout moment.

import { useState } from "react";
import { importCourses, readCourseTemplate } from "../../core/courses";
import { applyShiftTemplate, readShiftTemplate, type TemplateShift } from "../../core/shifts";
import { weekTypeOf } from "../../core/schedule";
import { addDays, DAY_NAMES, fmtDayMonth, fmtDuration, fromHHMM, mondayOf, toHHMM, todayISO } from "../../lib/date";
import { uid, WEEK_TYPES } from "../../lib/meta";
import type { AppData, Place, WeekType } from "../../lib/types";
import { commit, get, toast, updateSettings } from "../../store/store";
import { CourseTable, type CourseRow } from "../components/CourseTable";
import { ShiftRows } from "../components/ShiftRows";
import { Field, Icon, Sheet } from "../components/ui";
import { useData } from "../hooks";
import { SportTargetEditor } from "../pages/Sport";
import { close, open } from "../uiStore";

const STEPS = [
  { title: "Toi", hint: "Ton rythme de sommeil sert à placer les révisions et le sport au bon moment." },
  { title: "Alternance", hint: "Le type de chaque semaine décide si ce sont tes cours ou tes horaires Auchan qui s'affichent." },
  { title: "Auchan", hint: "Tes horaires habituels. Une semaine différente se modifie ensuite en 30 secondes depuis la page Auchan." },
  { title: "Cours", hint: "Ta semaine type à Perrimond. Saisis-la une fois, elle revient à chaque semaine d'école." },
  { title: "Trajets", hint: "Temps moyen porte à porte : ils calculent tes heures de départ et détectent les conflits." },
  { title: "Sport", hint: "Tes objectifs et les créneaux de ta box : le planificateur choisira parmi eux." },
];

function nextSchoolMonday(data: AppData, today: string): string {
  for (let i = 0; i < 12; i++) {
    const mon = addDays(mondayOf(today), i * 7);
    if (weekTypeOf(mon, data.settings.alternance) === "ecole") return mon;
  }
  return addDays(mondayOf(today), 7);
}

export function SetupSheet({ step: initialStep = 0 }: { step?: number }) {
  const data = useData();
  const today = todayISO();
  const [step, setStep] = useState(initialStep);

  // Brouillons de chaque étape, initialisés à partir des données actuelles.
  const [name, setName] = useState(data.settings.name);
  const [wake, setWake] = useState(data.settings.wakeTime);
  const [bed, setBed] = useState(data.settings.bedTime);
  const [sleepTarget, setSleepTarget] = useState(data.settings.sleepTargetMin);
  const [schoolWeeks, setSchoolWeeks] = useState(Math.max(1, data.settings.alternance.pattern.filter((p) => p === "ecole").length));
  const [workWeeks, setWorkWeeks] = useState(Math.max(1, data.settings.alternance.pattern.filter((p) => p === "entreprise").length));
  const [anchor, setAnchor] = useState(() => nextSchoolMonday(data, today));
  const [shifts, setShifts] = useState<TemplateShift[]>(() => readShiftTemplate(data));
  const [shiftsDirty, setShiftsDirty] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>(() => readCourseTemplate(data).map((c) => ({ ...c, keep: true })));
  const [coursesDirty, setCoursesDirty] = useState(false);
  const [routes, setRoutes] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const r of Object.values(data.routes)) out[[r.from, r.to].sort().join("|")] = r.minutes;
    return out;
  });
  const [routesDirty, setRoutesDirty] = useState(false);

  const pattern: WeekType[] = [...Array(schoolWeeks).fill("ecole"), ...Array(workWeeks).fill("entreprise")];
  const previewAlt = { ...data.settings.alternance, pattern, anchorMonday: mondayOf(anchor) };

  const saveStep = (i: number) => {
    if (i === 0) updateSettings({ name: name.trim(), wakeTime: wake, bedTime: bed, sleepTargetMin: sleepTarget });
    if (i === 1) updateSettings({ alternance: previewAlt });
    if (i === 2 && shiftsDirty) {
      commit(applyShiftTemplate(get(), shifts), "Horaires Auchan enregistrés");
      setShiftsDirty(false);
    }
    if (i === 3 && coursesDirty) {
      const keep = courses.filter((c) => c.keep && c.matiere.trim() && c.debut < c.fin);
      commit(importCourses(get(), keep, true), `${keep.length} cours enregistrés`);
      setCoursesDirty(false);
    }
    if (i === 4 && routesDirty) {
      const cur = get();
      const next = { ...cur.routes };
      for (const [key, minutes] of Object.entries(routes)) {
        const [a, b] = key.split("|");
        const existing = Object.values(next).find((r) => [r.from, r.to].sort().join("|") === key);
        const id = existing?.id ?? uid("r");
        next[id] = { id, from: existing?.from ?? a, to: existing?.to ?? b, minutes };
      }
      commit({ ...cur, routes: next }, "Trajets enregistrés");
      setRoutesDirty(false);
    }
  };

  const go = (i: number) => {
    saveStep(step);
    setStep(i);
  };

  const finish = () => {
    saveStep(step);
    updateSettings({ onboarded: true });
    close();
    toast("Ta semaine est configurée. On place ton sport et tes révisions ?", {
      action: { label: "Planifier ma semaine", run: () => open({ type: "weekplan" }) },
    });
  };

  const last = step === STEPS.length - 1;
  const places = Object.values(data.places);
  const home = places.find((p) => p.id === data.settings.homePlaceId);
  const routePairs: [Place, Place][] = [];
  if (home) for (const p of places) if (p.id !== home.id) routePairs.push([home, p]);
  const school = places.find((p) => p.kind === "ecole");
  const work = places.find((p) => p.kind === "travail");
  for (const p of places.filter((x) => x.kind === "sport")) {
    if (school) routePairs.push([school, p]);
    if (work) routePairs.push([work, p]);
  }

  return (
    <Sheet
      title="Configurer ma semaine"
      onClose={() => {
        saveStep(step);
        close();
      }}
      wide
      footer={
        <>
          {step > 0 && (
            <button className="btn btn-ghost left" onClick={() => go(step - 1)}>
              <Icon name="left" size={16} /> Précédent
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (last ? finish() : go(step + 1))}>
            {last ? "Terminer" : "Suivant"} {!last && <Icon name="right" size={16} />}
          </button>
        </>
      }
    >
      <div className="steps" role="tablist" aria-label="Étapes">
        {STEPS.map((s, i) => (
          <button key={s.title} role="tab" aria-selected={i === step} className={`step ${i < step ? "done" : ""}`} onClick={() => go(i)}>
            <span className="step-n">{i < step ? "✓" : i + 1}</span>
            <span className="step-t">{s.title}</span>
          </button>
        ))}
      </div>
      <p className="small muted">{STEPS[step].hint}</p>

      {step === 0 && (
        <div className="form">
          <Field label="Prénom" hint="facultatif" htmlFor="su-name">
            <input id="su-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="fields-3">
            <Field label="Réveil habituel" htmlFor="su-wake">
              <input id="su-wake" className="input" type="time" value={toHHMM(wake)} onChange={(e) => e.target.value && setWake(fromHHMM(e.target.value))} />
            </Field>
            <Field label="Coucher habituel" htmlFor="su-bed">
              <input id="su-bed" className="input" type="time" value={toHHMM(bed)} onChange={(e) => e.target.value && setBed(fromHHMM(e.target.value))} />
            </Field>
            <Field label="Sommeil visé" htmlFor="su-sleep">
              <select id="su-sleep" className="select" value={sleepTarget} onChange={(e) => setSleepTarget(Number(e.target.value))}>
                {[360, 390, 420, 450, 480, 510, 540].map((m) => (
                  <option key={m} value={m}>
                    {fmtDuration(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="form">
          <div className="fields-3">
            <Field label="Semaines d'école" htmlFor="su-school">
              <select id="su-school" className="select" value={schoolWeeks} onChange={(e) => setSchoolWeeks(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="puis semaines Auchan" htmlFor="su-work">
              <select id="su-work" className="select" value={workWeeks} onChange={(e) => setWorkWeeks(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prochain lundi d'école" htmlFor="su-anchor">
              <input id="su-anchor" className="input" type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
            </Field>
          </div>
          <div className="stack-sm">
            <span className="label">Tes 8 prochaines semaines</span>
            <div className="row-wrap">
              {Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), i * 7)).map((mon) => {
                const t = weekTypeOf(mon, previewAlt);
                return (
                  <span key={mon} className="weektype" data-cat={t === "ecole" ? "ecole" : t === "entreprise" ? "auchan" : "perso"}>
                    {fmtDayMonth(mon)} · {WEEK_TYPES[t].short}
                  </span>
                );
              })}
            </div>
            <span className="tiny faint">Congés ou semaine exceptionnelle : dans le Planning, touche le badge de la semaine pour la changer.</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <ShiftRows
          rows={shifts}
          labels={shifts.map((r) => DAY_NAMES[r.weekday - 1])}
          idPrefix="su-shift"
          onChange={(i, patch) => {
            setShiftsDirty(true);
            setShifts((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
          }}
        />
      )}

      {step === 3 && (
        <div className="stack">
          <div className="row-wrap">
            <button
              className="btn"
              onClick={() => {
                saveStep(step);
                open({ type: "timetable", returnToSetup: 3 });
              }}
            >
              <Icon name="image" size={16} /> Importer une photo ou un PDF
            </button>
            <span className="tiny faint">l'IA lit ton emploi du temps et remplit ce tableau à ta place</span>
          </div>
          {courses.length > 0 && (
            <CourseTable
              rows={courses}
              onChange={(i, patch) => {
                setCoursesDirty(true);
                setCourses((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
              }}
              onRemove={(i) => {
                setCoursesDirty(true);
                setCourses((rows) => rows.filter((_, j) => j !== i));
              }}
            />
          )}
          <div>
            <button
              className="btn btn-sm"
              onClick={() => {
                setCoursesDirty(true);
                const lastRow = courses[courses.length - 1];
                setCourses((rows) => [
                  ...rows,
                  lastRow
                    ? { ...lastRow, matiere: "", salle: "", enseignant: "", debut: lastRow.fin, fin: toHHMM(Math.min(fromHHMM(lastRow.fin) + 180, 23 * 60)) }
                    : { jour: 1, debut: "09:00", fin: "12:00", matiere: "", keep: true },
                ]);
              }}
            >
              <Icon name="plus" size={16} /> Ajouter un cours
            </button>
          </div>
          <span className="tiny faint">Les matières sont créées automatiquement. Un cours annulé ou déplacé se modifie ensuite directement dans le Planning.</span>
        </div>
      )}

      {step === 4 && (
        <div className="stack-sm">
          {routePairs.map(([a, b]) => {
            const key = [a.id, b.id].sort().join("|");
            return (
              <div key={key} className="spread">
                <span>
                  {a.name} ↔ {b.name}
                </span>
                <span className="row small">
                  <input
                    className="input sm"
                    style={{ width: 80 }}
                    type="number"
                    min={0}
                    max={240}
                    placeholder="20"
                    value={routes[key] ?? ""}
                    aria-label={`${a.name} ↔ ${b.name} en minutes`}
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      setRoutesDirty(true);
                      setRoutes((r) => ({ ...r, [key]: Math.max(0, Number(e.target.value)) }));
                    }}
                  />
                  min
                </span>
              </div>
            );
          })}
          <span className="tiny faint">D'autres lieux (bibliothèque, famille…) s'ajoutent dans Paramètres → Lieux et trajets.</span>
        </div>
      )}

      {step === 5 && (
        <div className="grid-2 even">
          {data.settings.sports.map((t) => (
            <SportTargetEditor key={t.id} target={t} data={data} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
