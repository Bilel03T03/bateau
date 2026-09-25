// Branchement de l'assistant :
// - dans claude.ai : capacité « sample » (ton compte Claude, sans clé) ;
// - sur la version web : SDK Anthropic avec ta clé API (stockée sur l'appareil) ;
// - sinon : assistant local (localAssistant).

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { CourseInput } from "../core/courses";
import { getCapability, type ClaudeSample } from "../lib/claude";
import { useStore } from "../store/store";
import { buildContext } from "./context";
import { makeTools, type Proposal } from "./tools";

export type ProviderKind = "claude" | "api" | "local";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export const INSTRUCTIONS = `Tu es l'assistant intégré à Cap, le tableau de bord d'un étudiant en alternance (cours à l'école Perrimond, entreprise Auchan, sport : CrossFit et squash).
Réponds en français, en le tutoyant, de façon concrète (jours, heures, durées) et brève : 120 mots maximum sauf si on te demande un détail.
Appuie-toi sur son planning ci-dessous et sur les outils. Tu ne modifies jamais rien directement : chaque changement passe par un outil proposer_* ou planification_automatique, puis il valide d'un clic. Si un outil refuse une proposition (conflit), choisis un autre créneau.
L'organisation doit rester humaine et réaliste : tiens compte des trajets, des repas, du sommeil, du temps libre protégé, de l'heure limite de travail perso, pas de séance tardive avant un départ tôt, pas de grosse séance de révision juste après une longue journée, et jamais toutes les révisions la veille. Les cours et les horaires Auchan sont fixes : on ne les déplace pas, sauf demande explicite.
S'il manque une information, fais une hypothèse raisonnable et dis-la en une phrase. Termine en indiquant ce qui est proposé et doit être validé.`;

export interface Provider {
  kind: ProviderKind;
  label: string;
  images: boolean;
  pdf: boolean;
}

export async function detectProvider(): Promise<Provider> {
  const sample = await getCapability("sample");
  if (sample) {
    const limits = await sample.limits().catch(() => null);
    return { kind: "claude", label: "Claude (ton compte)", images: !!limits?.images, pdf: false };
  }
  if (useStore.getState().device.apiKey) return { kind: "api", label: "Claude (clé API)", images: true, pdf: true };
  return { kind: "local", label: "Assistant local", images: false, pdf: false };
}

export class AssistantError extends Error {
  constructor(
    message: string,
    public partial?: string,
    /** Vrai quand ce fournisseur est indisponible pour la suite : on bascule sur l'assistant local. */
    public fallback = false,
  ) {
    super(message);
  }
}

const FATAL_SAMPLE = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

function sampleErrorMessage(code: string): string {
  switch (code) {
    case "not_granted":
    case "sampling_disabled":
      return "L'accès à Claude n'a pas été autorisé pour cette page. L'assistant local reste disponible.";
    case "rate_limited":
      return "Trop de demandes pour le moment. Réessaie dans un instant.";
    case "session_expired":
      return "Ta session Claude a expiré : reconnecte-toi puis réessaie.";
    case "refused":
      return "Claude n'a pas pu répondre à cette demande. Reformule-la autrement.";
    case "prompt_too_large":
      return "La conversation est trop longue : efface-la et recommence.";
    default:
      return "La réponse a été interrompue. Réessaie.";
  }
}

export async function ask(opts: {
  history: Turn[];
  text: string;
  today: string;
  nowMin: number;
  onText: (text: string) => void;
  onProposal: (p: Proposal) => void;
  onTool?: (name: string) => void;
  signal: AbortSignal;
}): Promise<string> {
  const { history, text, today, nowMin, onText, onProposal, onTool, signal } = opts;
  const data = useStore.getState().data;
  const context = buildContext(data, today, nowMin);
  const tools = makeTools(today, nowMin, onProposal);
  const sample = await getCapability("sample");

  if (sample) return askSample(sample, { history, text, context, tools, onText, onTool, signal });

  const { apiKey, model } = useStore.getState().device;
  if (!apiKey) throw new AssistantError("Aucune IA disponible.");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const runnable = tools.map((t) =>
    betaTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object"; properties: Record<string, never> },
      run: async (input) => {
        onTool?.(t.name);
        try {
          return t.execute(input as Record<string, unknown>);
        } catch (e) {
          return `Erreur : ${(e as Error).message}`;
        }
      },
    }),
  );
  const opus5 = model === "claude-opus-5";
  try {
    const runner = client.beta.messages.toolRunner(
      {
        model,
        max_tokens: 16000,
        system: `${INSTRUCTIONS}\n\n${context}`,
        messages: [...history, { role: "user", content: text }],
        tools: runnable,
        max_iterations: 8,
        ...(model.startsWith("claude-haiku") ? {} : { output_config: { effort: "medium" as const } }),
        // Sur Opus 5, un refus de sécurité bascule automatiquement vers un autre modèle.
        ...(opus5 ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    let acc = "";
    for await (const message of runner) {
      const chunk = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (chunk) {
        acc = acc ? `${acc}\n\n${chunk}` : chunk;
        onText(acc);
      }
      if (message.stop_reason === "refusal") throw new AssistantError("Claude n'a pas pu répondre à cette demande. Reformule-la autrement.", acc);
    }
    return acc || "C'est noté.";
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AssistantError("Clé API refusée : vérifie-la dans les Paramètres.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AssistantError("Cette clé API n'a pas accès à ce modèle. Choisis-en un autre dans les Paramètres.");
    if (e instanceof Anthropic.RateLimitError) throw new AssistantError("Limite d'utilisation atteinte pour le moment. Réessaie dans une minute.");
    if (e instanceof Anthropic.APIUserAbortError) throw new AssistantError("Arrêté.");
    if (e instanceof Anthropic.APIConnectionError) throw new AssistantError("Pas de connexion à l'API Claude. Vérifie ta connexion internet.");
    if (e instanceof Anthropic.APIError) throw new AssistantError(`Erreur de l'API Claude (${e.status ?? "?"}). Réessaie.`);
    throw new AssistantError("Une erreur inattendue est survenue.");
  }
}

async function askSample(
  sample: ClaudeSample,
  o: { history: Turn[]; text: string; context: string; tools: ReturnType<typeof makeTools>; onText: (t: string) => void; onTool?: (name: string) => void; signal: AbortSignal },
): Promise<string> {
  const limits = await sample.limits().catch(() => null);
  const tools = limits?.tools
    ? o.tools.slice(0, limits.tools.maxCount).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input: Record<string, unknown>) => {
          o.onTool?.(t.name);
          return t.execute(input);
        },
      }))
    : undefined;
  // Les consignes et le planning forment le premier message ; l'historique suit.
  const turns: Turn[] = [{ role: "user", content: `${INSTRUCTIONS}\n\n${o.context}` }, ...o.history.slice(-10), { role: "user", content: o.text }];
  try {
    const res = await sample(turns, { onText: ({ text }) => o.onText(text), signal: o.signal, tools, cache: false });
    return res.text;
  } catch (e) {
    const err = e as { code?: string; text?: string };
    if (err.code === "cancelled") throw new AssistantError("Arrêté.", err.text);
    throw new AssistantError(sampleErrorMessage(err.code ?? ""), err.text, FATAL_SAMPLE.includes(err.code ?? ""));
  }
}

// ---------- Lecture d'un emploi du temps (photo ou PDF) ----------

export type ExtractedCourse = CourseInput;

const TIMETABLE_PROMPT = `Voici l'emploi du temps d'une semaine de cours d'un étudiant (école Perrimond). Extrais chaque créneau de cours.
Réponds uniquement avec un tableau JSON, sans texte autour, de la forme :
[{"jour": 1, "debut": "08:30", "fin": "12:00", "matiere": "Stratégie commerciale", "enseignant": "M. Durand", "salle": "B12", "type": "cours", "date": "2026-10-05"}]
jour : 1 = lundi … 7 = dimanche. date : seulement si elle est écrite sur le document (AAAA-MM-JJ), sinon omets-la. type : "examen" pour un examen, un partiel ou un oral, sinon "cours". Omets les champs inconnus.`;

function parseJsonArray(text: string): ExtractedCourse[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new AssistantError("Je n'ai pas réussi à lire l'emploi du temps. Essaie avec une image plus nette.");
  const arr = JSON.parse(text.slice(start, end + 1)) as unknown[];
  return arr
    .filter((x): x is ExtractedCourse => !!x && typeof x === "object" && typeof (x as ExtractedCourse).debut === "string")
    .map((x) => ({ ...x, jour: Number(x.jour) || 1, matiere: String(x.matiere ?? "Cours") }));
}

async function toBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function extractTimetable(file: File, signal: AbortSignal): Promise<ExtractedCourse[]> {
  const sample = await getCapability("sample");
  if (sample) {
    try {
      const res = await sample(TIMETABLE_PROMPT, { images: file, signal, modelTier: "default", cache: false });
      return parseJsonArray(res.text);
    } catch (e) {
      if (e instanceof AssistantError) throw e;
      const err = e as { code?: string };
      if (err.code === "image_rejected" || err.code === "images_unavailable") throw new AssistantError("Ce fichier n'est pas accepté ici : envoie une capture d'écran (PNG ou JPG).");
      throw new AssistantError(sampleErrorMessage(err.code ?? ""));
    }
  }
  const { apiKey, model } = useStore.getState().device;
  if (!apiKey) throw new AssistantError("Pour lire un emploi du temps, ouvre Cap dans Claude ou ajoute une clé API dans les Paramètres.");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await toBase64(file);
  const isPdf = file.type === "application/pdf";
  const mediaType = (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) ? file.type : "image/png") as "image/png";
  try {
    const msg = await client.messages.create(
      {
        model,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              isPdf
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
                : { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: TIMETABLE_PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseJsonArray(text);
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AssistantError("Clé API refusée : vérifie-la dans les Paramètres.");
    if (e instanceof Anthropic.APIError) throw new AssistantError(`Erreur de l'API Claude (${e.status ?? "?"}).`);
    throw new AssistantError("Lecture impossible. Réessaie avec une image plus nette.");
  }
}
