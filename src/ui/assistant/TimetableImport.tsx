import { useEffect, useRef, useState } from "react";
import { AssistantError, detectProvider, extractTimetable, type Provider } from "../../ai/providers";
import { importCourses } from "../../core/courses";
import { get, toast, useStore } from "../../store/store";
import { CourseTable, type CourseRow } from "../components/CourseTable";
import { Check, Icon, Sheet } from "../components/ui";
import { close, go, open } from "../uiStore";

type Row = CourseRow;

export function TimetableImport({ returnToSetup }: { returnToSetup?: number }) {
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
    if (returnToSetup !== undefined) {
      open({ type: "setup", step: returnToSetup });
    } else {
      close();
      go("perrimond");
    }
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
          <CourseTable rows={rows} onChange={setRow} />
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
