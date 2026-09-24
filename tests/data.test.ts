import { describe, expect, it } from "vitest";
import { buildDemo } from "../src/data/demo";
import { applyDocs, toDocs } from "../src/store/persistence";
import { emptyData, normalizeData } from "../src/data/defaults";
import { icsToEvents } from "../src/core/ics";
import { sleepDuration } from "../src/core/energy";
import { weekLoad } from "../src/core/load";

const TODAY = "2026-09-24";

describe("découpage pour la synchronisation", () => {
  it("reconstruit exactement les données à partir des documents", () => {
    const data = buildDemo(TODAY, 480);
    const docs = toDocs(data);
    for (const body of Object.values(docs)) expect(JSON.stringify(body).length).toBeLessThan(256 * 1024);
    const rebuilt = normalizeData(applyDocs(emptyData(TODAY), JSON.parse(JSON.stringify(docs))), TODAY);
    expect(rebuilt).toEqual(data);
  });
  it("n'écrase que le document modifié ailleurs", () => {
    const data = buildDemo(TODAY, 480);
    const docs = toDocs(data);
    const key = Object.keys(docs).find((k) => k.startsWith("tasks."))!;
    const changed = JSON.parse(JSON.stringify(docs[key]));
    const id = Object.keys(changed.items)[0];
    changed.items[id].title = "Modifié sur le téléphone";
    const next = applyDocs(data, { [key]: changed });
    expect(next.tasks[id].title).toBe("Modifié sur le téléphone");
    expect(next.events).toBe(data.events);
  });
});

describe("import .ics", () => {
  it("importe et ignore les doublons", () => {
    const data = buildDemo(TODAY, 480);
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc",
      "SUMMARY:Anniversaire de Léa",
      "DTSTART:20260926T190000",
      "DTEND:20260926T220000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:def",
      "SUMMARY:Soirée entre amis",
      "DTSTART:20260926T200000",
      "DTEND:20260926T233000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:ghi",
      "SUMMARY:Cours de marketing digital",
      "DTSTART:20261005T090000",
      "DTEND:20261005T120000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const res = icsToEvents(ics, data, TODAY);
    expect(res.duplicates).toBe(1);
    expect(res.events.map((e) => e.title)).toContain("Anniversaire de Léa");
    expect(res.events.filter((e) => e.title.startsWith("Cours"))).toHaveLength(3);
    expect(res.events.find((e) => e.title.startsWith("Cours"))!.category).toBe("ecole");
  });
});

describe("divers", () => {
  it("calcule une nuit qui passe minuit", () => {
    expect(sleepDuration({ bedtime: 23 * 60 + 30, wake: 7 * 60 })).toBe(450);
    expect(sleepDuration({ bedtime: 60, wake: 9 * 60, napMin: 20 })).toBe(500);
  });
  it("une semaine vide est bien organisée", () => {
    const l = weekLoad(emptyData(TODAY), TODAY, 480);
    expect(l.level).toBe("vert");
  });
});
