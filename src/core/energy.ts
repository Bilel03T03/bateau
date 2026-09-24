import { addDays, fmtDuration } from "../lib/date";
import type { AppData, SleepLog } from "../lib/types";
import { buildFrame } from "./frame";

export function sleepDuration(log: Pick<SleepLog, "bedtime" | "wake" | "napMin">): number {
  let night = log.wake - log.bedtime;
  if (night <= 0) night += 1440;
  return night + (log.napMin ?? 0);
}

export function sleepOn(data: Pick<AppData, "sleep">, date: string): SleepLog | undefined {
  return Object.values(data.sleep).find((s) => s.date === date);
}

export function averageSleep(data: Pick<AppData, "sleep">, from: string, to: string): { avg: number; nights: number } {
  const logs = Object.values(data.sleep).filter((s) => s.date >= from && s.date <= to);
  if (!logs.length) return { avg: 0, nights: 0 };
  const total = logs.reduce((s, l) => s + sleepDuration(l), 0);
  return { avg: Math.round(total / logs.length), nights: logs.length };
}

export interface Energy {
  /** 1 = en forme … 0.5 = très fatigué : coefficient appliqué au travail perso planifié. */
  factor: number;
  tired: boolean;
  reasons: string[];
}

type EnergyData = Pick<AppData, "sleep" | "events" | "recurring" | "settings" | "places" | "routes">;

/** Estime la forme du jour à partir du sommeil, de la fatigue notée et de la charge de la veille. */
export function energyFor(data: EnergyData, date: string): Energy {
  const reasons: string[] = [];
  let factor = 1;
  const log = sleepOn(data, date);
  if (log) {
    const d = sleepDuration(log);
    if (d < data.settings.sleepTargetMin - 90) {
      factor -= 0.3;
      reasons.push(`nuit courte (${fmtDuration(d)})`);
    } else if (d < data.settings.sleepTargetMin - 45) {
      factor -= 0.15;
      reasons.push(`nuit un peu courte (${fmtDuration(d)})`);
    }
    if ((log.fatigue ?? 0) >= 4) {
      factor -= 0.25;
      reasons.push("fatigue notée au réveil");
    }
  }
  const yesterday = addDays(date, -1);
  const prev = buildFrame(data, yesterday, { skipNextDay: true });
  if (prev.loadMin >= 600) {
    factor -= 0.15;
    reasons.push("grosse journée hier");
  }
  const hardSession = Object.values(data.events).some(
    (e) => e.date === yesterday && e.kind === "sport" && (e.fatigueAfter ?? 0) >= 4,
  );
  if (hardSession) {
    factor -= 0.1;
    reasons.push("séance de sport intense hier");
  }
  factor = Math.max(0.5, Math.min(1, factor));
  return { factor, tired: factor < 0.8, reasons };
}
