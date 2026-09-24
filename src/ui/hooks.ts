import { useEffect, useState } from "react";
import { nowMinutes, todayISO } from "../lib/date";
import { useStore } from "../store/store";

export const useData = () => useStore((s) => s.data);

/** Heure courante, rafraîchie toutes les 20 s (et au retour sur l'onglet). */
export function useNow(intervalMs = 20_000): { now: Date; today: string; minutes: number } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
  return { now, today: todayISO(now), minutes: nowMinutes(now) };
}

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return match;
}
