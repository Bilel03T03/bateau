import { useEffect, useRef, useState } from "react";
import { AssistantError, detectProvider, extractTimetable, type ExtractedCourse, type Provider } from "../../ai/providers";
import { DAY_SHORT, fromHHMM, isValidISO } from "../../lib/date";
import { uid } from "../../lib/meta";
import type { AppData, CalEvent, Recurring, Subject } from "../../lib/types";
import { get, toast, useStore } from "../../store/store";
import { Check, Icon, Sheet } from "../components/ui";
import { close, go, open } from "../uiStore";

interface Row extends ExtractedCourse {
  keep: boolean;
}

export function TimetableImport() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ctlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    detectProvider().then(setProvider);
    return () => ctlRef.current?.abort();
  }, []);

  const onFile = async (file: File) => {
    setError("");
    setBusy(true);
    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      const courses = await extractTimetable(file, ctl.signal);
      if (!courses.length) setError("Aucun cours trouvé sur ce document.");
      setRows(courses.map((c) => ({ ...c, keep: true })));
    } catch (e) {
      setError(e instanceof AssistantError ? e.message : "Lecture impossible.");
    } finally {
      setBusy(false);
    }
  };

  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const importRows = () => {
    if (!rows) return;
    const data = get();
    const next = importCourses(data, rows.filter((r) => r.keep), replace);
    useStore.setState({ data: next, undoStack: [data, ...useStore.getState().undoStack].slice(0, 10) });
    toast(`${rows.filter((r) => r.keep).length} créneaux importés`, { undo: true });
    close();
    go("perrimond");
  };

  const accept = provider?.kind === "api" ? "image/*,application/pdf" : "image/png,image/jpeg,image/webp,image/gif";

  return (
    <Sheet
      title="Importer mon emploi du temps"
      onClose={close}
      wide
      footer={
        rows ? (
          <>
            <button className="btn btn-ghost left" onClick={() => setRows(null)}>
              Recommencer
            </button>
            <button className="btn btn-primary" onClick={importRows} disabled={!rows.some((r) => r.keep)}>
              Ajouter {rows.filter((r) => r.keep).length} créneau(x)
            </button>
          </>
        ) : undefined
      }
    >
      {!rows && (
        <div className="stack">
          <p className="muted small">
            Ton emploi du temps Perrimond est en PDF ou sur papier ? Prends une photo ou une capture d'écran : l'IA le lit et prépare ta semaine d'école. Tu vérifies avant
            d'ajouter.
          </p>
          {provider?.kind === "local" ? (
            <div className="banner">
              <span className="grow small">
                Cette fonction a besoin de Claude : ouvre Cap dans claude.ai, ou ajoute une clé API dans les Paramètres. Sinon, saisis tes cours à la main (une fois suffit, ils
                se répètent chaque semaine d'école).
              </span>
              <div className="row">
                <button className="btn btn-sm" onClick={() => go("parametres")}>
                  Paramètres
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => open({ type: "recurring", draft: { category: "ecole", kind: "cours", weekTypes: ["ecole"] } })}
                >
                  Saisir un cours
                </button>
              </div>
            </div>
          ) : provider?.kind === "claude" && !provider.images ? (
            <p className="small">Cette vue de Claude ne permet pas d'envoyer d'image. Essaie depuis claude.ai sur ordinateur ou sur l'app mobile.</p>
          ) : (
            <>
              <button className="btn btn-big" onClick={() => fileRef.current?.click()} disabled={busy || !provider}>
                <span className="big-icon">📷</span>
                <span>
                  <strong>{busy ? "Lecture en cours…" : "Choisir une photo ou une capture"}</strong>
                  <span className="small muted">{provider?.kind === "api" ? "PNG, JPG ou PDF" : "PNG ou JPG"}</span>
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onFile(f);
                }}
              />
            </>
          )}
          {error && (
            <p className="small" style={{ color: "var(--bad)" }}>
              {error}
            </p>
          )}
        </div>
      )}
      {rows && (
        <div className="stack">
          <p className="small muted">Vérifie et corrige si besoin. Les cours sans date deviennent ta semaine d'école type ; ceux avec une date sont ajoutés ce jour-là seulement.</p>
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.keep ? 1 : 0.45 }}>
                    <td>
                      <Check checked={r.keep} onChange={(v) => setRow(i, { keep: v })} label="Garder ce créneau" />
                    </td>
                    <td>
                      <select className="select" style={{ height: 32, width: 76 }} value={r.jour} onChange={(e) => setRow(i, { jour: Number(e.target.value) })} aria-label="Jour">
                        {DAY_SHORT.map((d, k) => (
                          <option key={d} value={k + 1}>
                            {d}
                          </option>
                        ))}
                      </select>
                      {r.date && <div className="tiny faint">{r.date}</div>}
                    </td>
                    <td>
                      <input className="input sm" style={{ width: 96 }} type="time" value={r.debut} onChange={(e) => setRow(i, { debut: e.target.value })} aria-label="Début" />
                    </td>
                    <td>
                      <input className="input sm" style={{ width: 96 }} type="time" value={r.fin} onChange={(e) => setRow(i, { fin: e.target.value })} aria-label="Fin" />
                    </td>
                    <td>
                      <input className="input sm" style={{ minWidth: 150 }} value={r.matiere} onChange={(e) => setRow(i, { matiere: e.target.value })} aria-label="Matière" />
                    </td>
                    <td>
                      <input className="input sm" style={{ width: 80 }} value={r.salle ?? ""} onChange={(e) => setRow(i, { salle: e.target.value })} aria-label="Salle" />
                    </td>
                    <td>
                      <input className="input sm" style={{ minWidth: 110 }} value={r.enseignant ?? ""} onChange={(e) => setRow(i, { enseignant: e.target.value })} aria-label="Enseignant" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="row small">
            <Check checked={replace} onChange={setReplace} label="Remplacer" />
            Remplacer mon emploi du temps d'école actuel (les cours récurrents existants seront retirés)
          </label>
          <p className="tiny faint">
            <Icon name="bolt" size={12} /> Les matières inconnues sont créées automatiquement avec leur enseignant et leur salle.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function importCourses(data: AppData, rows: ExtractedCourse[], replace: boolean): AppData {
  const subjects: Record<string, Subject> = { ...data.subjects };
  const findSubject = (name: string, teacher?: string, room?: string) => {
    const key = name.trim().toLowerCase();
    let s = Object.values(subjects).find((x) => x.name.toLowerCase() === key);
    if (!s) {
      s = { id: uid("s"), name: name.trim(), teacher, room };
      subjects[s.id] = s;
    }
    return s;
  };
  const place = Object.values(data.places).find((p) => p.kind === "ecole")?.id;
  const recurring: Record<string, Recurring> = replace
    ? Object.fromEntries(Object.entries(data.recurring).filter(([, r]) => !(r.category === "ecole" && r.weekTypes.includes("ecole"))))
    : { ...data.recurring };
  const events: Record<string, CalEvent> = { ...data.events };
  for (const r of rows) {
    const start = fromHHMM(r.debut);
    const end = fromHHMM(r.fin);
    if (!(end > start)) continue;
    const sub = findSubject(r.matiere, r.enseignant, r.salle);
    const kind = r.type === "examen" ? "examen" : "cours";
    if (r.date && isValidISO(r.date)) {
      const id = uid("e");
      events[id] = { id, title: sub.name, category: "ecole", kind, date: r.date, start, end, placeId: place, subjectId: sub.id, teacher: r.enseignant, room: r.salle, origin: "import" };
    } else {
      const id = uid("rc");
      recurring[id] = {
        id,
        title: sub.name,
        category: "ecole",
        kind,
        weekday: Math.min(7, Math.max(1, r.jour)),
        start,
        end,
        placeId: place,
        subjectId: sub.id,
        teacher: r.enseignant,
        room: r.salle,
        weekTypes: ["ecole"],
        overrides: {},
      };
    }
  }
  return { ...data, subjects, recurring, events };
}
