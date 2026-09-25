// Modifications pures des données (sans effet de bord), partagées par le
// store, les éditeurs de semaine et la configuration guidée.

import type { AppData, CalEvent, OccurrenceOverride } from "../lib/types";

export function splitKey(key: string): { templateId?: string; baseDate?: string; eventId?: string } {
  const at = key.indexOf("@");
  if (at > 0) return { templateId: key.slice(0, at), baseDate: key.slice(at + 1) };
  return { eventId: key };
}

export function withOverride(d: AppData, templateId: string, baseDate: string, ov: OccurrenceOverride): AppData {
  const tpl = d.recurring[templateId];
  if (!tpl) return d;
  const overrides = { ...tpl.overrides, [baseDate]: { ...tpl.overrides[baseDate], ...ov } };
  return { ...d, recurring: { ...d.recurring, [templateId]: { ...tpl, overrides } } };
}

/** Modifie une occurrence ; pour un horaire récurrent, seule cette date change. */
export function editOccurrence(d: AppData, key: string, changes: Partial<CalEvent>): AppData {
  const { templateId, baseDate, eventId } = splitKey(key);
  if (templateId && baseDate) {
    const ov: OccurrenceOverride = {};
    for (const k of ["date", "start", "end", "room", "title", "placeId"] as const) {
      if (changes[k] !== undefined) (ov as Record<string, unknown>)[k] = changes[k];
    }
    return withOverride(d, templateId, baseDate, ov);
  }
  const ev = eventId ? d.events[eventId] : undefined;
  if (!ev) return d;
  return { ...d, events: { ...d.events, [ev.id]: { ...ev, ...changes } } };
}

/** Supprime une occurrence : annulation pour cette date (récurrent) ou suppression (ponctuel). */
export function removeOccurrence(d: AppData, key: string): AppData {
  const { templateId, baseDate, eventId } = splitKey(key);
  if (templateId && baseDate) return withOverride(d, templateId, baseDate, { cancelled: true });
  if (!eventId || !d.events[eventId]) return d;
  const events = { ...d.events };
  delete events[eventId];
  return { ...d, events };
}

export function addEvent(d: AppData, ev: CalEvent): AppData {
  return { ...d, events: { ...d.events, [ev.id]: ev } };
}
