// Notifications du navigateur, utiles et rares : départ imminent pour un
// rendez-vous et alertes importantes (une fois par jour). Elles ne marchent
// que tant que l'app est ouverte (onglet ou app installée).

import { useEffect } from "react";
import { computeAlerts } from "../core/alerts";
import { buildFrame } from "../core/frame";
import { fmtTime, nowMinutes, todayISO } from "../lib/date";
import { setDevice, useStore } from "../store/store";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

function send(title: string, body: string) {
  try {
    new Notification(title, { body, tag: title + body });
  } catch {
    /* refusé par le navigateur */
  }
}

export function useNotifications() {
  const enabled = useStore((s) => s.device.notifications);
  useEffect(() => {
    if (!enabled || !notificationsSupported() || Notification.permission !== "granted") return;
    const check = () => {
      const { data, device } = useStore.getState();
      const today = todayISO();
      const now = nowMinutes();
      const notified = { ...device.notified };
      let changed = false;
      const frame = buildFrame(data, today);
      for (const leg of frame.legs) {
        const key = `leg:${today}:${leg.start}:${leg.to}`;
        if (leg.toKey && leg.start - now <= 15 && leg.start - now >= 0 && !notified[key]) {
          const target = frame.occs.find((o) => o.key === leg.toKey);
          send("Départ dans 15 min", `${target?.title ?? "Prochain rendez-vous"} à ${fmtTime(target?.start ?? leg.end)} : pars à ${fmtTime(leg.start)}.`);
          notified[key] = Date.now();
          changed = true;
        }
      }
      for (const o of frame.occs) {
        const key = `occ:${o.key}`;
        if (!o.placeId && ["sport", "revision", "rdv"].includes(o.kind) && o.start - now <= 10 && o.start - now >= 0 && !notified[key]) {
          send(o.title, `Commence à ${fmtTime(o.start)}.`);
          notified[key] = Date.now();
          changed = true;
        }
      }
      for (const a of computeAlerts(data, today, now).filter((x) => x.level === 3)) {
        const key = `alert:${today}:${a.id}`;
        if (!notified[key]) {
          send("Cap", a.text);
          notified[key] = Date.now();
          changed = true;
        }
      }
      if (changed) {
        // On garde seulement la dernière semaine d'historique.
        const cutoff = Date.now() - 7 * 86400_000;
        setDevice({ notified: Object.fromEntries(Object.entries(notified).filter(([, t]) => t > cutoff)) });
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [enabled]);
}
