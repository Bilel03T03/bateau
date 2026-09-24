// Produit la version « page claude.ai » à partir du build Vite (un seul fichier).
// La page est enveloppée par claude.ai dans son propre squelette HTML : on retire
// donc doctype/html/head/body et ce qui ne sert qu'à la PWA (manifeste, icônes).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");

const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "<title>Cap</title>";
const fonts = [...html.matchAll(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]);
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);

if (!styles.length || !scripts.length) {
  console.error("build-artifact : styles ou scripts introuvables dans dist/index.html");
  process.exit(1);
}

const out = [title, ...fonts, ...styles, '<div id="root"></div>', ...scripts].join("\n");
mkdirSync("dist-artifact", { recursive: true });
writeFileSync("dist-artifact/cap.html", out);
console.log(`dist-artifact/cap.html (${Math.round(out.length / 1024)} Ko)`);
