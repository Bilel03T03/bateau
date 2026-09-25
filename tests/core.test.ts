import { describe, expect, it } from "vitest";
import { buildDemo } from "../src/data/demo";
import { weekTypeOf, occurrencesOn } from "../src/core/schedule";
import { buildFrame } from "../src/core/frame";
import { planSchedule, conflictFixes } from "../src/core/planner";
import { distributeRevision } from "../src/core/revisions";
import { parseQuickAdd } from "../src/core/quickAdd";
import { buildDayPlan } from "../src/core/dayPlan";
import { whatNow } from "../src/core/nowAdvisor";
import { weekLoad } from "../src/core/load";
import { computeAlerts } from "../src/core/alerts";
import { weekStats, monthStats } from "../src/core/stats";
import { addDays, fmtTime } from "../src/lib/date";

const TODAY = "2026-09-24"; // jeudi
const NOW = 8 * 60;

describe("alternance", () => {
  it("suit le rythme 3 semaines Auchan / 1 semaine école", () => {
    const data = buildDemo(TODAY, NOW);
    expect(weekTypeOf(TODAY, data.settings.alternance)).toBe("entreprise");
    expect(weekTypeOf("2026-09-28", data.settings.alternance)).toBe("ecole");
    expect(weekTypeOf("2026-10-05", data.settings.alternance)).toBe("entreprise");
    expect(weekTypeOf("2026-10-26", data.settings.alternance)).toBe("ecole");
  });
});

describe("cadre de journée", () => {
  const data = buildDemo(TODAY, NOW);
  it("affiche le travail et les trajets du jour", () => {
    const occs = occurrencesOn(data, TODAY);
    expect(occs.some((o) => o.kind === "travail" && o.start === 540)).toBe(true);
    const f = buildFrame(data, TODAY);
    expect(f.legs[0].to).toBe("p-auchan");
    expect(f.legs[0].start).toBe(540 - 25);
    expect(f.conflicts.filter((c) => c.type === "chevauchement")).toHaveLength(0);
  });
  it("détecte le squash impossible à rejoindre après Auchan", () => {
    const f = buildFrame(data, "2026-09-25");
    const c = f.conflicts.find((x) => x.type === "trajet");
    expect(c).toBeTruthy();
    expect(c!.missingMin).toBe(15);
    const fixes = conflictFixes(data, c!, TODAY, NOW);
    expect(fixes.length).toBeGreaterThan(0);
    console.log(c!.message, fixes.map((x) => `${x.label}: ${x.detail}`));
  });
});

describe("planification", () => {
  it("propose le sport manquant et des révisions réparties", () => {
    const data = buildDemo(TODAY, NOW);
    for (const e of Object.values(data.events)) if (e.origin === "auto") delete data.events[e.id];
    const r = planSchedule(data, { today: TODAY, nowMin: NOW, mode: "full" });
    console.log(r.summary, r.unplaced);
    for (const e of r.add) console.log(e.date, fmtTime(e.start), fmtTime(e.end), e.title);
    expect(r.add.some((e) => e.kind === "sport" && e.sport === "crossfit")).toBe(true);
    expect(r.add.some((e) => e.kind === "revision")).toBe(true);
    // Rien après l'heure limite de travail perso
    for (const e of r.add.filter((x) => x.kind !== "sport")) expect(e.end).toBeLessThanOrEqual(data.settings.noFocusAfter);
    // Aucun conflit créé
    for (let i = 0; i < 7; i++) {
      const d = addDays(TODAY, i);
      const w = { ...data, events: { ...data.events, ...Object.fromEntries(r.add.map((e) => [e.id, e])) } };
      const f = buildFrame(w, d);
      const created = f.conflicts.filter((c) => r.add.some((e) => e.id === c.key || e.id === c.otherKey));
      expect(created).toHaveLength(0);
    }
  });
  it("répartit 5 h de révision sur 7 jours sans tout mettre la veille", () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays("2026-10-05", i));
    const { plan } = distributeRevision(300, days, { difficulty: 2, examDate: "2026-10-12" });
    console.log(plan);
    expect(plan.reduce((s, p) => s + p.minutes, 0)).toBe(300);
    const veille = plan.find((p) => p.date === "2026-10-11");
    expect(veille!.minutes).toBeLessThanOrEqual(60);
    expect(plan.length).toBeGreaterThanOrEqual(4);
  });
});

describe("ajout rapide", () => {
  it("comprend une tâche d'école avec une date", () => {
    const data = buildDemo(TODAY, NOW);
    const p = parseQuickAdd("Préparer présentation stratégie commerciale vendredi", TODAY, Object.values(data.subjects));
    expect(p.kind).toBe("tache");
    expect(p.category).toBe("ecole");
    expect(p.date).toBe("2026-09-25");
    expect(p.title).toBe("Préparer présentation stratégie commerciale");
    expect(p.subjectId).toBe("s-strat");
    expect(p.priority).toBe("urgente");
    expect(p.estimateMin).toBe(180);
  });
  it("comprend un rendez-vous avec heure", () => {
    const p = parseQuickAdd("Dentiste jeudi 14h30", TODAY);
    expect(p.kind).toBe("evenement");
    expect(p.date).toBe("2026-10-01");
    expect(p.start).toBe(870);
    expect(p.category).toBe("perso");
    expect(p.title).toBe("Dentiste");
  });
  it("comprend une durée et Auchan", () => {
    const p = parseQuickAdd("Préparer inventaire rayon 2h lundi important", TODAY);
    expect(p.category).toBe("auchan");
    expect(p.estimateMin).toBe(120);
    expect(p.priority).toBe("importante");
    expect(p.date).toBe("2026-09-28");
    expect(p.title).toBe("Préparer inventaire rayon");
  });
  it("crée un examen", () => {
    const p = parseQuickAdd("Examen droit commercial le 15/10", TODAY);
    expect(p.kind).toBe("examen");
    expect(p.date).toBe("2026-10-15");
  });
  it("comprend une séance de sport", () => {
    const p = parseQuickAdd("CrossFit demain 18h30", TODAY, [], [{ id: "crossfit", name: "CrossFit" }]);
    expect(p.kind).toBe("evenement");
    expect(p.eventKind).toBe("sport");
    expect(p.sport).toBe("crossfit");
    expect(p.start).toBe(1110);
  });
});

describe("vues calculées", () => {
  const data = buildDemo(TODAY, NOW);
  it("organise la journée", () => {
    const plan = buildDayPlan(data, TODAY, TODAY, NOW);
    for (const i of plan.items) console.log(fmtTime(i.start), i.end ? fmtTime(i.end) : "", i.label, i.detail ?? "");
    console.log(plan.notes);
    expect(plan.items[0].label).toBe("Réveil");
  });
  it("donne une action maintenant", () => {
    for (const hh of [7, 12, 17.5, 19, 21, 23]) {
      const now = new Date(2026, 8, 24, Math.floor(hh), (hh % 1) * 60);
      const a = whatNow(data, now);
      console.log(hh, a.icon, a.headline, a.detail ?? "");
      expect(a.headline.length).toBeGreaterThan(5);
    }
  });
  it("calcule la charge, les alertes et les stats", () => {
    const l = weekLoad(data, TODAY, NOW);
    console.log(l.emoji, l.label, l.reasons);
    const alerts = computeAlerts(data, TODAY, NOW);
    for (const a of alerts) console.log(a.level, a.icon, a.text);
    const w = weekStats(data, "2026-09-21");
    console.log(w.workMin / 60, w.courseMin / 60, w.sport.map((r) => `${r.target.name} ${r.done}/${r.target.perWeek}`));
    const m = monthStats(data, TODAY, TODAY);
    console.log(m.sessions.map((s) => `${s.target.name}:${s.count}`), m.weeks.map((x) => `${x.monday}:${x.met}`), m.regularity, m.sleepAvg);
    expect(["vert", "orange", "rouge"]).toContain(l.level);
  });
});

describe("récupération sportive", () => {
  it("évite deux séances de CrossFit deux jours de suite quand un autre jour convient", () => {
    const data = buildDemo(TODAY, NOW);
    // On repart d'une semaine sans sport du tout.
    for (const e of Object.values(data.events)) if (e.kind === "sport" && e.date >= "2026-09-21") delete data.events[e.id];
    const r = planSchedule(data, { today: TODAY, nowMin: NOW, mode: "full" });
    const cf = r.add.filter((e) => e.sport === "crossfit" && e.date <= "2026-09-27").map((e) => e.date).sort();
    expect(cf.length).toBe(2);
    const gap = (new Date(cf[1]).getTime() - new Date(cf[0]).getTime()) / 86400000;
    expect(gap).toBeGreaterThanOrEqual(2);
    const days = r.add.filter((e) => e.kind === "sport").map((e) => e.date);
    expect(new Set(days).size).toBe(days.length);
  });
});
