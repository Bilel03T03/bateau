import { describe, expect, it } from "vitest";
import { buildDemo } from "../src/data/demo";
import { buildBrief } from "../src/core/brief";
import { weekTiles } from "../src/core/weekView";
import { sportPace, sportWeek } from "../src/core/stats";

const TODAY = "2026-09-24"; // jeudi, semaine Auchan

describe("brief du jour", () => {
  const data = buildDemo(TODAY, 7 * 60);
  it("résume la journée le matin", () => {
    const b = buildBrief(data, new Date(2026, 8, 24, 7, 30));
    console.log(b.title, "|", b.subtitle, "\n", b.lines.map((l) => `${l.icon} ${l.text}`).join("\n "));
    expect(b.mode).toBe("jour");
    expect(b.title).toBe("Aujourd'hui : Auchan 09h00–17h00");
    expect(b.subtitle).toContain("Départ 08h35");
    expect(b.lines.length).toBeGreaterThan(1);
    expect(b.lines.length).toBeLessThanOrEqual(6);
  });
  it("bascule sur demain le soir", () => {
    const b = buildBrief(data, new Date(2026, 8, 24, 21, 15));
    console.log(b.title, "|", b.subtitle, "\n", b.lines.map((l) => `${l.icon} ${l.text}`).join("\n "));
    expect(b.mode).toBe("soir");
    expect(b.date).toBe("2026-09-25");
    expect(b.title).toBe("Demain : Auchan 12h00–19h30");
    expect(b.lines.some((l) => l.icon === "⚠️")).toBe(true); // squash en conflit demain
  });
});

describe("semaine en un coup d'œil", () => {
  it("décrit chaque jour", () => {
    const data = buildDemo(TODAY, 7 * 60);
    const tiles = weekTiles(data, "2026-09-21");
    console.log(tiles.map((t) => `${t.date} ${t.label} ${t.hours ?? ""} sport:${t.sport.length} dl:${t.deadlines} cf:${t.conflicts} ${Math.round(t.load * 100)}% ${t.level}`).join("\n"));
    expect(tiles).toHaveLength(7);
    expect(tiles[0].label).toBe("Auchan");
    expect(tiles[2].label).toBe("Libre");
    expect(tiles[4].conflicts).toBeGreaterThan(0);
    const school = weekTiles(data, "2026-09-28");
    expect(school[0].label).toBe("Cours");
    expect(school[1].exams).toBe(1);
  });
});

describe("rythme sportif", () => {
  it("dit si l'objectif est tenable", () => {
    const data = buildDemo(TODAY, 7 * 60);
    const rows = sportWeek(data, "2026-09-21");
    const squash = rows.find((r) => r.target.id === "squash")!;
    expect(sportPace(squash, TODAY, "2026-09-21").status).toBe("prevu");
    const empty = { ...squash, done: 0, planned: 0 };
    expect(sportPace(empty, "2026-09-26", "2026-09-21").status).toBe("en_retard");
    expect(sportPace({ ...empty, target: { ...empty.target, perWeek: 3 } }, "2026-09-26", "2026-09-21").status).toBe("compromis");
    expect(sportPace(empty, "2026-09-21", "2026-09-21").status).toBe("dans_les_temps");
  });
});
