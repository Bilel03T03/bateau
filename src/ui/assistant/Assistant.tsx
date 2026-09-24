import { useEffect, useRef, useState } from "react";
import { localAssistant } from "../../ai/local";
import { ask, AssistantError, detectProvider, type Provider, type Turn } from "../../ai/providers";
import type { Proposal } from "../../ai/tools";
import { nowMinutes, todayISO } from "../../lib/date";
import { toast, useStore } from "../../store/store";
import { Icon } from "../components/ui";
import { closeAssistant, go, useUI } from "../uiStore";

interface Msg {
  id: number;
  role: "user" | "bot" | "note";
  text: string;
  proposals?: Proposal[];
  pending?: boolean;
}

const SUGGESTIONS = [
  "Je travaille demain matin et j'ai cours après-demain, trouve-moi un moment pour faire mon deuxième CrossFit de la semaine.",
  "J'ai un examen vendredi et je n'ai encore rien révisé.",
  "Ma semaine est trop chargée, aide-moi à déplacer ce qui peut l'être.",
  "Que dois-je faire maintenant ?",
];

const TOOL_LABELS: Record<string, string> = {
  voir_journee: "Je regarde ton planning…",
  meilleurs_creneaux_sport: "Je cherche les meilleurs créneaux…",
  creneaux_libres: "Je vérifie tes créneaux libres…",
  proposer_ajout: "Je prépare une proposition…",
  proposer_deplacement: "Je prépare un déplacement…",
  proposer_suppression: "Je prépare une proposition…",
  proposer_examen: "Je répartis les révisions…",
  proposer_report_tache: "Je prépare un report…",
  planification_automatique: "Je lance le planificateur…",
};

let msgId = 0;

export function Assistant() {
  const openState = useUI((s) => s.assistant);
  const prompt = useUI((s) => s.assistantPrompt);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [forceLocal, setForceLocal] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const ctlRef = useRef<AbortController | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!openState) return;
    detectProvider().then(setProvider);
    setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAssistant();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openState]);

  useEffect(() => {
    if (openState && prompt && provider && !busy) {
      useUI.setState({ assistantPrompt: undefined });
      void send(prompt);
    }
  }, [openState, prompt, provider]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!openState) return null;

  const update = (id: number, patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  const runLocal = (q: string, botId?: number) => {
    const res = localAssistant(q, todayISO(), nowMinutes());
    if (botId) update(botId, { text: res.text, proposals: res.proposals, pending: false });
    else setMessages((l) => [...l, { id: ++msgId, role: "bot", text: res.text, proposals: res.proposals }]);
  };

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    const history: Turn[] = messages
      .filter((m) => (m.role === "user" || m.role === "bot") && !m.pending && m.text)
      .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    const userMsg: Msg = { id: ++msgId, role: "user", text: question };
    const botId = ++msgId;
    setMessages((l) => [...l, userMsg, { id: botId, role: "bot", text: "", pending: true, proposals: [] }]);
    const kind = forceLocal ? "local" : provider?.kind ?? "local";
    if (kind === "local") {
      runLocal(question, botId);
      return;
    }
    setBusy(true);
    const ctl = new AbortController();
    ctlRef.current = ctl;
    update(botId, { text: "Réflexion…" });
    let streamed = false;
    try {
      const final = await ask({
        history,
        text: question,
        today: todayISO(),
        nowMin: nowMinutes(),
        signal: ctl.signal,
        onText: (t) => {
          streamed = true;
          update(botId, { text: t });
        },
        onTool: (name) => {
          if (!streamed) update(botId, { text: TOOL_LABELS[name] ?? "Je regarde ton planning…" });
        },
        onProposal: (p) => update(botId, (m) => ({ proposals: [...(m.proposals ?? []), p] })),
      });
      update(botId, { text: final, pending: false });
    } catch (e) {
      const err = e instanceof AssistantError ? e : new AssistantError("Une erreur est survenue.");
      if (err.fallback) {
        setForceLocal(true);
        runLocal(question, botId);
        setMessages((l) => [...l, { id: ++msgId, role: "note", text: `${err.message}` }]);
      } else {
        update(botId, { text: err.partial || "", pending: false });
        setMessages((l) => [...l, { id: ++msgId, role: "note", text: err.message }]);
      }
    } finally {
      setBusy(false);
      ctlRef.current = null;
    }
  }

  const apply = (p: Proposal) => {
    if (applied.has(p.id)) return;
    p.apply();
    setApplied((s) => new Set(s).add(p.id));
    if (!useStore.getState().toast) toast(`Fait : ${p.label.replace(/^⭐ /, "")}`);
  };

  const label = forceLocal ? "Assistant local" : provider?.label ?? "…";

  return (
    <>
      <div className="drawer-backdrop" onClick={closeAssistant} />
      <aside className="drawer" role="dialog" aria-label="Assistant">
        <div className="spread" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="sparkle" /> Assistant
            </h2>
            <span className="tiny faint">{label} · il propose, tu valides</span>
          </div>
          <div className="row">
            {messages.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setMessages([])} disabled={busy}>
                Effacer
              </button>
            )}
            <button className="btn btn-ghost btn-icon btn-sm" onClick={closeAssistant} aria-label="Fermer">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="chat" ref={chatRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="stack">
              <p className="muted small">
                Écris naturellement. Je connais ton planning (cours, Auchan, sport, trajets, échéances) et je te propose des changements que tu valides d'un clic.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
              {provider?.kind === "local" && !forceLocal && (
                <p className="tiny faint">
                  Mode local : je comprends les demandes courantes. Pour des questions libres, ouvre Cap dans Claude ou ajoute une clé API dans{" "}
                  <button
                    className="link tiny"
                    onClick={() => {
                      closeAssistant();
                      go("parametres");
                    }}
                  >
                    Paramètres
                  </button>
                  .
                </p>
              )}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="stack-sm" style={{ alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
              {(m.text || m.role !== "bot") && <div className={`msg ${m.role}`}>{m.text}</div>}
              {m.proposals && m.proposals.length > 0 && (
                <div className="proposal-card">
                  <span className="label">
                    {m.proposals.length} proposition{m.proposals.length > 1 ? "s" : ""} à valider
                  </span>
                  {m.proposals.map((p) => (
                    <div key={p.id} className="spread">
                      <div className="grow">
                        <div style={{ fontWeight: 580, fontSize: 14 }}>{p.label}</div>
                        {p.detail && <div className="tiny muted">{p.detail}</div>}
                      </div>
                      <button className={`btn btn-sm ${applied.has(p.id) ? "btn-ghost" : "btn-primary"}`} disabled={applied.has(p.id)} onClick={() => apply(p)}>
                        {applied.has(p.id) ? "✓ Fait" : "Appliquer"}
                      </button>
                    </div>
                  ))}
                  {m.proposals.length > 1 && m.proposals.some((p) => !applied.has(p.id)) && !m.proposals[0].label.startsWith("⭐") && (
                    <button className="btn btn-sm" onClick={() => m.proposals!.forEach(apply)}>
                      Tout appliquer
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            ref={inputRef}
            id="assistant-input"
            value={text}
            placeholder="Ex. trouve-moi un créneau pour réviser la finance"
            aria-label="Message à l'assistant"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          {busy ? (
            <button type="button" className="btn btn-icon" onClick={() => ctlRef.current?.abort()} aria-label="Arrêter">
              <Icon name="stop" />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-icon" disabled={!text.trim()} aria-label="Envoyer">
              <Icon name="send" />
            </button>
          )}
        </form>
      </aside>
    </>
  );
}
