// Minuteur de concentration : visible sur toutes les pages tant qu'un bloc
// est en cours. Pause, reprise, « c'est fait » (le bloc est validé) ou arrêt.

import { useEffect, useRef, useState } from "react";
import type { FocusSession } from "../../store/device";
import { setDevice, toast, useStore } from "../../store/store";
import { markBlock } from "../actions";
import { Icon } from "./ui";

let audio: AudioContext | null = null;

/** Démarre un bloc de concentration (appelé depuis un clic, ce qui autorise le son de fin). */
export function startFocus(title: string, durationMin: number, eventId?: string) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    void audio?.resume();
  } catch {
    audio = null;
  }
  setDevice({ focus: { title, durationMin, eventId, startedAt: Date.now(), pausedMs: 0 } });
}

function chime() {
  if (!audio) return;
  try {
    const t = audio.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.22);
      osc.stop(t + i * 0.22 + 0.22);
    }
  } catch {
    /* son indisponible */
  }
}

function elapsedMs(f: FocusSession, now: number): number {
  return (f.pausedAt ?? now) - f.startedAt - f.pausedMs;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function FocusBar() {
  const focus = useStore((s) => s.device.focus);
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);

  useEffect(() => {
    if (!focus) return;
    rang.current = elapsedMs(focus, Date.now()) >= focus.durationMin * 60_000;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [focus]);

  const total = (focus?.durationMin ?? 0) * 60_000;
  const elapsed = focus ? Math.max(0, elapsedMs(focus, now)) : 0;
  const left = Math.max(0, total - elapsed);
  const done = !!focus && left === 0;

  // Fin du bloc : son, vibration et notification, une seule fois.
  useEffect(() => {
    if (!done || !focus || rang.current) return;
    rang.current = true;
    chime();
    navigator.vibrate?.([120, 80, 120]);
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification("Bloc terminé", { body: `${focus.title} : bravo !` });
    } catch {
      /* notifications indisponibles */
    }
  }, [done, focus]);

  if (!focus) return null;
  const mins = Math.floor(left / 60_000);
  const secs = Math.floor((left % 60_000) / 1000);
  const paused = focus.pausedAt !== undefined;

  const finish = () => {
    if (focus.eventId && useStore.getState().data.events[focus.eventId]) markBlock(focus.eventId, "fait");
    else toast(`Bravo, « ${focus.title} » terminé`);
    setDevice({ focus: undefined });
  };

  return (
    <div className="focusbar" role="timer" aria-live="off" data-done={done}>
      <div className="focus-main">
        <span className="focus-title">{done ? "⏰ Temps écoulé" : paused ? "⏸ En pause" : "🎯 Concentration"}</span>
        <strong className="focus-name">{focus.title}</strong>
      </div>
      <span className="focus-time" aria-label={`${mins} minutes ${secs} secondes restantes`}>
        {done ? "00:00" : `${pad(mins)}:${pad(secs)}`}
      </span>
      <div className="focus-actions">
        {done ? (
          <button
            className="btn btn-sm"
            onClick={() => setDevice({ focus: { ...focus, durationMin: focus.durationMin + 10 } })}
          >
            +10 min
          </button>
        ) : (
          <button
            className="btn btn-sm btn-icon"
            aria-label={paused ? "Reprendre" : "Pause"}
            onClick={() =>
              setDevice({
                focus: paused
                  ? { ...focus, pausedAt: undefined, pausedMs: focus.pausedMs + (Date.now() - focus.pausedAt!) }
                  : { ...focus, pausedAt: Date.now() },
              })
            }
          >
            {paused ? "▶" : "⏸"}
          </button>
        )}
        <button className="btn btn-sm btn-primary" onClick={finish}>
          C'est fait
        </button>
        <button className="btn btn-sm btn-ghost btn-icon" aria-label="Arrêter le minuteur" onClick={() => setDevice({ focus: undefined })}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <span className="focus-progress" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
      </span>
    </div>
  );
}
