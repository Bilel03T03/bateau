import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./App";
import { inClaude } from "./lib/claude";
import { boot } from "./store/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void boot();

// Version web installable : fonctionne hors connexion (pas dans claude.ai).
if (!inClaude() && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
