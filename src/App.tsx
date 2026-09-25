import { useEffect, useMemo, type ComponentType } from "react";
import { weekTypeOf } from "./core/schedule";
import { WEEK_TYPES } from "./lib/meta";
import { useStore, undo } from "./store/store";
import { Assistant } from "./ui/assistant/Assistant";
import { Icon } from "./ui/components/ui";
import { EditorHost } from "./ui/editors/EditorHost";
import { useData, useNow } from "./ui/hooks";
import { QuickAdd } from "./ui/layout/QuickAdd";
import { useNotifications } from "./ui/notifications";
import { Home } from "./ui/pages/Home";
import { Planning } from "./ui/pages/Planning";
import { Tasks } from "./ui/pages/Tasks";
import { School } from "./ui/pages/School";
import { Work } from "./ui/pages/Work";
import { Sport } from "./ui/pages/Sport";
import { Revisions } from "./ui/pages/Revisions";
import { Goals } from "./ui/pages/Goals";
import { Stats } from "./ui/pages/Stats";
import { SettingsPage } from "./ui/pages/Settings";
import { ROUTES, go, open, openAssistant, useUI, type Route } from "./ui/uiStore";

const PAGES: Record<Route, ComponentType> = {
  accueil: Home,
  planning: Planning,
  taches: Tasks,
  perrimond: School,
  auchan: Work,
  sport: Sport,
  revisions: Revisions,
  objectifs: Goals,
  stats: Stats,
  parametres: SettingsPage,
};

function useTheme() {
  const theme = useStore((s) => s.device.theme);
  useEffect(() => {
    document.body.classList.toggle("theme-clair", theme === "clair");
    document.body.classList.toggle("theme-sombre", theme === "sombre");
  }, [theme]);
}

export function App() {
  const status = useStore((s) => s.status);
  const sync = useStore((s) => s.sync);
  const toast = useStore((s) => s.toast);
  const route = useUI((s) => s.route);
  const data = useData();
  const { today } = useNow(60_000);
  useTheme();
  useNotifications();

  const openTasks = useMemo(
    () => Object.values(data.tasks).filter((t) => t.status !== "termine" && t.deadline && t.deadline <= today).length,
    [data.tasks, today],
  );
  const weekType = weekTypeOf(today, data.settings.alternance);

  if (status === "loading") return <div className="loading">Chargement de ton tableau de bord…</div>;
  if (status === "unavailable") {
    return (
      <div className="loading">
        <div className="stack" style={{ maxWidth: 420, textAlign: "center", padding: 16 }}>
          <h2>Impossible de lire tes données</h2>
          <p className="muted">La connexion à ton espace Claude n'a pas répondu. Rien n'a été modifié. Recharge la page pour réessayer.</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Recharger
          </button>
        </div>
      </div>
    );
  }

  const Page = PAGES[route];
  const current = ROUTES.find((r) => r.id === route)!;

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Menu principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="brand-name">Cap</div>
          </div>
        </div>
        <div style={{ padding: "0 8px" }}>
          <span className="weektype" data-cat={weekType === "ecole" ? "ecole" : weekType === "entreprise" ? "auchan" : "perso"}>
            {WEEK_TYPES[weekType].label}
          </span>
        </div>
        <nav className="nav">
          {ROUTES.map((r) => (
            <button key={r.id} className="nav-item" aria-current={route === r.id ? "page" : undefined} onClick={() => go(r.id)}>
              <span className="nav-emoji" aria-hidden="true">
                {r.emoji}
              </span>
              {r.label}
              {r.id === "taches" && openTasks > 0 && <span className="nav-count">{openTasks}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="btn btn-soft" onClick={() => openAssistant()}>
            <Icon name="sparkle" /> Assistant
          </button>
          <div className="sync" title={sync === "claude" ? "Données enregistrées dans ton espace Claude" : "Données enregistrées dans ce navigateur"}>
            <span className={`sync-dot ${sync === "local" ? "local" : ""}`} />
            {sync === "claude" ? "Synchronisé avec ton compte Claude" : "Enregistré sur cet appareil"}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span className="topbar-title only-mobile">
            {current.emoji} {current.label}
          </span>
          <div className="quick only-desktop">
            <QuickAdd />
          </div>
          <span className="grow only-mobile" />
          <button className="btn btn-soft btn-sm only-mobile" onClick={() => openAssistant()} aria-label="Assistant">
            <Icon name="sparkle" size={16} /> IA
          </button>
          <button className="btn btn-soft only-desktop" onClick={() => openAssistant()}>
            <Icon name="sparkle" /> Demander à l'assistant
          </button>
        </header>
        <div className="content" key={route}>
          <Page />
        </div>
      </main>

      <nav className="bottomnav" aria-label="Navigation">
        {(["accueil", "planning"] as Route[]).map((id) => {
          const r = ROUTES.find((x) => x.id === id)!;
          return (
            <button key={id} className="tab" aria-current={route === id ? "page" : undefined} onClick={() => go(id)}>
              <span className="nav-emoji">{r.emoji}</span>
              {r.label}
            </button>
          );
        })}
        <button className="tab tab-add" onClick={() => open({ type: "quickadd" })} aria-label="Ajouter">
          <span className="plus">
            <Icon name="plus" size={22} stroke={2.4} />
          </span>
        </button>
        <button className="tab" aria-current={route === "taches" ? "page" : undefined} onClick={() => go("taches")}>
          <span className="nav-emoji">✅</span>
          Tâches
        </button>
        <button
          className="tab"
          aria-current={!["accueil", "planning", "taches"].includes(route) ? "page" : undefined}
          onClick={() => open({ type: "more" })}
        >
          <span className="nav-emoji">☰</span>
          Plus
        </button>
      </nav>

      <EditorHost />
      <Assistant />
      <ConfirmHost />
      {toast && (
        <div className={`toast ${toast.tone === "warn" ? "warn" : ""}`} role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                useStore.setState({ toast: null });
              }}
            >
              {toast.action.label}
            </button>
          )}
          {toast.undo && <button onClick={undo}>Annuler</button>}
        </div>
      )}
    </div>
  );
}

function ConfirmHost() {
  const confirm = useUI((s) => s.confirm);
  if (!confirm) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && confirm.resolve(false)}>
      <div className="sheet" role="alertdialog" aria-label={confirm.title} style={{ maxWidth: 420 }}>
        <h2>{confirm.title}</h2>
        {confirm.text && <p className="muted">{confirm.text}</p>}
        <div className="sheet-foot">
          <button className="btn btn-ghost" onClick={() => confirm.resolve(false)}>
            Annuler
          </button>
          <button className={`btn ${confirm.danger ? "btn-danger" : "btn-primary"}`} onClick={() => confirm.resolve(true)} autoFocus>
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
