import { describe, expect, it } from "vitest";
import { buildDemo } from "../src/data/demo";
import { applyShiftTemplate, applyShifts, readShiftTemplate, readShifts } from "../src/core/shifts";
import { occurrencesOn } from "../src/core/schedule";

const TODAY = "2026-09-24";
const MONDAY = "2026-10-05"; // semaine Auchan dans l'exemple

describe("horaires Auchan d'une semaine", () => {
  it("lit les horaires habituels de la semaine", () => {
    const data = buildDemo(TODAY, 480);
    const rows = readShifts(data, MONDAY);
    expect(rows.map((r) => r.works)).toEqual([true, true, false, true, true, true, false]);
    expect(rows[0].start).toBe(7 * 60);
  });
  it("modifie un jour, en ajoute un et en retire un, pour cette semaine seulement", () => {
    const data = buildDemo(TODAY, 480);
    const rows = readShifts(data, MONDAY);
    rows[0] = { ...rows[0], start: 10 * 60, end: 18 * 60 }; // lundi décalé
    rows[2] = { ...rows[2], works: true, start: 14 * 60, end: 20 * 60 }; // mercredi en plus
    rows[5] = { ...rows[5], works: false }; // samedi en repos
    const next = applyShifts(data, rows);
    const shift = (d: string) => occurrencesOn(next, d).filter((o) => o.kind === "travail");
    expect(shift("2026-10-05")[0].start).toBe(10 * 60);
    expect(shift("2026-10-07")[0].end).toBe(20 * 60);
    expect(shift("2026-10-10")).toHaveLength(0);
    // La semaine Auchan suivante garde les horaires habituels.
    expect(shift("2026-10-12")[0].start).toBe(7 * 60);
    expect(shift("2026-10-17")).toHaveLength(1);
    // Relire donne le même résultat, et réappliquer ne change rien.
    expect(readShifts(next, MONDAY).map((r) => r.works)).toEqual([true, true, true, true, true, false, false]);
    expect(applyShifts(next, readShifts(next, MONDAY))).toEqual(next);
  });
});

describe("horaires habituels", () => {
  it("remplace le modèle en gardant les exceptions existantes", () => {
    const data = buildDemo(TODAY, 480);
    const rows = readShiftTemplate(data);
    rows[1] = { ...rows[1], start: 8 * 60 }; // mardi
    rows[6] = { ...rows[6], works: true, start: 10 * 60, end: 14 * 60 }; // dimanche
    rows[5] = { ...rows[5], works: false }; // samedi
    const next = applyShiftTemplate(data, rows);
    const t = readShiftTemplate(next);
    expect(t[1].start).toBe(8 * 60);
    expect(t[6].works).toBe(true);
    expect(t[5].works).toBe(false);
    expect(occurrencesOn(next, "2026-10-06").find((o) => o.kind === "travail")!.start).toBe(8 * 60);
    expect(occurrencesOn(next, "2026-10-11").find((o) => o.kind === "travail")!.start).toBe(10 * 60);
  });
});
