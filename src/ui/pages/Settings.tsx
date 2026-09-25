import { useRef, useState } from "react";
import { icsToEvents } from "../../core/ics";
import { buildIcs } from "../../core/icsExport";
import { weekTypeOf } from "../../core/schedule";
import { addDays, DAY_NAMES, fmtDayMonth, fmtDuration, fromHHMM, mondayOf, toHHMM, todayISO } from "../../lib/date";
import { getCapability, inClaude } from "../../lib/claude";
import { uid, WEEK_TYPES } from "../../lib/meta";
import type { AppData, Place, WeekType } from "../../lib/types";
import { MODELS } from "../../store/device";
import { importAll, loadDemo, mergeEvents, remove, removeDemo, resetAll, setDevice, toast, updateSettings, upsert, useStore } from "../../store/store";
import { notificationsSupported, requestNotifications } from "../notifications";
import { Field, Icon, Seg, Switch } from "../components/ui";
import { useData } from "../hooks";
import { askConfirm, open } from "../uiStore";

export function SettingsPage() {
  const data = useData();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>⚙️ Paramètres</h1>
          <p className="muted">Tout ce qui sert aux calculs automatiques. À régler une fois, puis on n'y touche plus.</p>
        </div>
        <button className="btn" onClick={() => open({ type: "setup" })}>
          🧭 Configuration guidée
        </button>
      </div>
      <div className="grid-2 even">
        <div className="stack">
          <Rhythm data={data} />
          <Alternance data={data} />
          <Places data={data} />
        </div>
        <div className="stack">
          <PlanningRules data={data} />
          <Appearance />
          <AssistantSettings />
          <DataSection data={data} />
        </div>
      </div>
    </>
  );
}

function TimeInput({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  return <input id={id} className="input" type="time" value={toHHMM(value)} onChange={(e) => e.target.value && onChange(fromHHMM(e.target.value))} />;
}

function Rhythm({ data }: { data: AppData }) {
  const s = data.settings;
  return (
    <section className="panel">
      <h2>Toi et ton rythme</h2>
      <div className="form">
        <Field label="Prénom" hint="pour l'accueil" htmlFor="set-name">
          <input id="set-name" className="input" value={s.name} onChange={(e) => updateSettings({ name: e.target.value })} />
        </Field>
        <div className="fields-2">
          <Field label="Réveil habituel" htmlFor="set-wake">
            <TimeInput id="set-wake" value={s.wakeTime} onChange={(v) => updateSettings({ wakeTime: v })} />
          </Field>
          <Field label="Coucher habituel" htmlFor="set-bed">
            <TimeInput id="set-bed" value={s.bedTime} onChange={(v) => updateSettings({ bedTime: v })} />
          </Field>
          <Field label="Sommeil visé" htmlFor="set-sleep">
            <select id="set-sleep" className="select" value={s.sleepTargetMin} onChange={(e) => updateSettings({ sleepTargetMin: Number(e.target.value) })}>
              {[360, 390, 420, 450, 480, 510, 540].map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Préparation le matin" htmlFor="set-routine">
            <select id="set-routine" className="select" value={s.morningRoutineMin} onChange={(e) => updateSettings({ morningRoutineMin: Number(e.target.value) })}>
              {[20, 30, 45, 60, 75, 90].map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Déjeuner entre" htmlFor="set-lunch">
            <div className="row">
              <TimeInput id="set-lunch" value={s.lunch.start} onChange={(v) => updateSettings({ lunch: { ...s.lunch, start: v } })} />
              <TimeInput id="set-lunch-end" value={s.lunch.end} onChange={(v) => updateSettings({ lunch: { ...s.lunch, end: v } })} />
            </div>
          </Field>
          <Field label="Dîner entre" htmlFor="set-dinner">
            <div className="row">
              <TimeInput id="set-dinner" value={s.dinner.start} onChange={(v) => updateSettings({ dinner: { ...s.dinner, start: v } })} />
              <TimeInput id="set-dinner-end" value={s.dinner.end} onChange={(v) => updateSettings({ dinner: { ...s.dinner, end: v } })} />
            </div>
          </Field>
        </div>
        <p className="tiny faint">
          Le réveil est avancé automatiquement quand tu pars tôt, et le coucher conseillé tient compte du lendemain.
        </p>
      </div>
    </section>
  );
}

function Alternance({ data }: { data: AppData }) {
  const alt = data.settings.alternance;
  const today = todayISO();
  const schoolCount = alt.pattern.filter((p) => p === "ecole").length;
  const workCount = alt.pattern.filter((p) => p === "entreprise").length;
  const [nextSchool, setNextSchool] = useState(() => {
    for (let i = 0; i < 12; i++) {
      const mon = addDays(mondayOf(today), i * 7);
      if (weekTypeOf(mon, alt) === "ecole") return mon;
    }
    return mondayOf(today);
  });
  const apply = (school: number, work: number, anchor: string) => {
    const pattern: WeekType[] = [...Array(school).fill("ecole"), ...Array(work).fill("entreprise")];
    updateSettings({ alternance: { ...alt, pattern, anchorMonday: mondayOf(anchor) } });
  };
  const upcoming = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), i * 7));
  const overrides = Object.entries(alt.overrides).sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="panel">
      <h2>Rythme d'alternance</h2>
      <div className="form">
        <div className="fields-2">
          <Field label="Semaines d'école" htmlFor="alt-school">
            <select id="alt-school" className="select" value={schoolCount} onChange={(e) => apply(Number(e.target.value), workCount, nextSchool)}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="puis semaines Auchan" htmlFor="alt-work">
            <select id="alt-work" className="select" value={workCount} onChange={(e) => apply(schoolCount, Number(e.target.value), nextSchool)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Une semaine d'école commence le" hint="n'importe quel lundi d'école" htmlFor="alt-anchor">
          <input
            id="alt-anchor"
            className="input"
            type="date"
            value={nextSchool}
            onChange={(e) => {
              if (!e.target.value) return;
              setNextSchool(e.target.value);
              apply(schoolCount, workCount, e.target.value);
            }}
          />
        </Field>
        <div className="stack-sm">
          <span className="label">Aperçu</span>
          <div className="row-wrap">
            {upcoming.map((mon) => {
              const t = weekTypeOf(mon, alt);
              return (
                <span key={mon} className="weektype" data-cat={t === "ecole" ? "ecole" : t === "entreprise" ? "auchan" : "perso"} title={WEEK_TYPES[t].label}>
                  {fmtDayMonth(mon)} · {WEEK_TYPES[t].short}
                </span>
              );
            })}
          </div>
        </div>
        {overrides.length > 0 && (
          <div className="stack-sm">
            <span className="label">Semaines modifiées à la main</span>
            {overrides.map(([mon, t]) => (
              <div key={mon} className="spread small">
                <span>
                  Semaine du {fmtDayMonth(mon)} : {WEEK_TYPES[t].label}
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    const o = { ...alt.overrides };
                    delete o[mon];
                    updateSettings({ alternance: { ...alt, overrides: o } });
                  }}
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="tiny faint">Congés ou semaine exceptionnelle : dans le Planning, touche le badge de la semaine pour changer son type.</p>
      </div>
    </section>
  );
}

function Places({ data }: { data: AppData }) {
  const places = Object.values(data.places);
  const home = data.settings.homePlaceId;
  const [name, setName] = useState("");
  const routeMinutes = (a: string, b: string) =>
    Object.values(data.routes).find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
  const setRoute = (a: string, b: string, minutes: number) => {
    const existing = routeMinutes(a, b);
    upsert("routes", { id: existing?.id ?? uid("r"), from: existing?.from ?? a, to: existing?.to ?? b, minutes });
  };
  const pairs: [Place, Place][] = [];
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) pairs.push([places[i], places[j]]);
  pairs.sort((x, y) => Number(y[0].id === home || y[1].id === home) - Number(x[0].id === home || x[1].id === home));
  return (
    <section className="panel">
      <h2>Lieux et trajets</h2>
      <p className="small muted">Temps moyen porte à porte. Ils servent à calculer tes départs, détecter les conflits et placer le sport au bon moment.</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Trajet</th>
              <th style={{ width: 110 }}>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(([a, b]) => {
              const r = routeMinutes(a.id, b.id);
              return (
                <tr key={a.id + b.id}>
                  <td>
                    {a.name} ↔ {b.name}
                  </td>
                  <td>
                    <input
                      className="input sm"
                      type="number"
                      min={0}
                      max={240}
                      placeholder="20"
                      value={r?.minutes ?? ""}
                      aria-label={`Trajet ${a.name} ↔ ${b.name} en minutes`}
                      onChange={(e) => e.target.value !== "" && setRoute(a.id, b.id, Math.max(0, Number(e.target.value)))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny faint">Sans valeur, un trajet compte 20 min par défaut.</p>
      <div className="stack-sm">
        <span className="label">Lieux</span>
        <div className="row-wrap">
          {places.map((p) => (
            <span key={p.id} className="chip outline">
              {p.id === home ? "🏠 " : ""}
              {p.name}
              {p.id !== home && (
                <button
                  className="btn btn-ghost btn-xs"
                  style={{ height: 18, padding: 0 }}
                  aria-label={`Retirer ${p.name}`}
                  onClick={() => remove("places", p.id, `Lieu retiré : ${p.name}`)}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            upsert("places", { id: uid("p"), name: name.trim(), kind: "autre" });
            setName("");
          }}
        >
          <input className="input sm grow" value={name} placeholder="Nouveau lieu (ex. bibliothèque)" onChange={(e) => setName(e.target.value)} aria-label="Nouveau lieu" />
          <button className="btn btn-sm" type="submit">
            Ajouter
          </button>
        </form>
      </div>
    </section>
  );
}

function PlanningRules({ data }: { data: AppData }) {
  const s = data.settings;
  const setFocus = (k: keyof typeof s.maxFocus, v: number) => updateSettings({ maxFocus: { ...s.maxFocus, [k]: v } });
  const minutesOptions = [0, 30, 45, 60, 90, 120, 150, 180, 240];
  return (
    <section className="panel">
      <h2>Planification automatique</h2>
      <p className="small muted">Pour une organisation humaine : l'outil ne remplit jamais chaque minute libre.</p>
      <div className="form">
        <span className="label">Travail perso maximum par jour</span>
        <div className="fields-3">
          {(
            [
              ["cours", "Jour de cours"],
              ["travail", "Jour chez Auchan"],
              ["libre", "Jour libre"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`focus-${k}`}>
              <select id={`focus-${k}`} className="select" value={s.maxFocus[k]} onChange={(e) => setFocus(k, Number(e.target.value))}>
                {minutesOptions.map((m) => (
                  <option key={m} value={m}>
                    {m ? fmtDuration(m) : "rien"}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <div className="fields-2">
          <Field label="Pas de travail perso après" htmlFor="rule-late">
            <TimeInput id="rule-late" value={s.noFocusAfter} onChange={(v) => updateSettings({ noFocusAfter: v })} />
          </Field>
          <Field label="Temps libre minimum par jour" htmlFor="rule-free">
            <select id="rule-free" className="select" value={s.minFreeMin} onChange={(e) => updateSettings({ minFreeMin: Number(e.target.value) })}>
              {[30, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Durée d'un bloc de travail" htmlFor="rule-block">
            <select id="rule-block" className="select" value={s.focusBlockMin} onChange={(e) => updateSettings({ focusBlockMin: Number(e.target.value) })}>
              {[30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Marge entre deux activités" htmlFor="rule-buffer">
            <select id="rule-buffer" className="select" value={s.bufferMin} onChange={(e) => updateSettings({ bufferMin: Number(e.target.value) })}>
              {[0, 5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="stack-sm">
          <span className="label">Soirées protégées (rien de planifié après 18 h)</span>
          <div className="filters">
            {DAY_NAMES.map((d, i) => {
              const on = s.freeEvenings.includes(i + 1);
              return (
                <button
                  key={d}
                  className="filter"
                  aria-pressed={on}
                  onClick={() => updateSettings({ freeEvenings: on ? s.freeEvenings.filter((x) => x !== i + 1) : [...s.freeEvenings, i + 1] })}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Appearance() {
  const device = useStore((s) => s.device);
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : "denied");
  return (
    <section className="panel">
      <h2>Apparence et rappels</h2>
      <div className="spread">
        <span>Thème</span>
        <Seg
          label="Thème"
          value={device.theme}
          onChange={(theme) => setDevice({ theme })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "clair", label: "Clair" },
            { value: "sombre", label: "Sombre" },
          ]}
        />
      </div>
      <div className="spread">
        <div>
          <div>Notifications sur cet appareil</div>
          <div className="tiny faint">
            {notificationsSupported() && perm !== "denied"
              ? "Départ dans 15 min, alertes importantes. Tant que l'app est ouverte."
              : "Non disponibles ici. Installe la version web (GitHub Pages) sur ton téléphone pour les recevoir."}
          </div>
        </div>
        <Switch
          label="Notifications"
          checked={device.notifications && perm === "granted"}
          onChange={async (v) => {
            if (v) {
              const ok = await requestNotifications();
              setPerm(notificationsSupported() ? Notification.permission : "denied");
              setDevice({ notifications: ok });
              if (!ok) toast("Notifications refusées par le navigateur");
            } else setDevice({ notifications: false });
          }}
        />
      </div>
      {Object.keys(device.dismissed).length > 0 && (
        <button className="link small" onClick={() => setDevice({ dismissed: {} })}>
          Réafficher les rappels masqués ({Object.keys(device.dismissed).length})
        </button>
      )}
    </section>
  );
}

function AssistantSettings() {
  const device = useStore((s) => s.device);
  const claude = inClaude();
  const [key, setKey] = useState(device.apiKey);
  return (
    <section className="panel">
      <h2>Assistant IA</h2>
      {claude ? (
        <p className="small muted">
          Tu utilises Cap dans Claude : l'assistant fonctionne avec ton compte Claude, sans clé à configurer. Claude te demandera ton accord la première fois.
        </p>
      ) : (
        <div className="form">
          <p className="small muted">
            Pour l'assistant en langage naturel dans la version web, colle une clé API Claude (console.anthropic.com). Elle reste uniquement dans ce navigateur. Sans clé,
            l'assistant répond quand même aux demandes courantes avec le moteur local.
          </p>
          <Field label="Clé API" htmlFor="api-key">
            <div className="row">
              <input id="api-key" className="input grow" type="password" autoComplete="off" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
              <button
                className="btn"
                onClick={() => {
                  setDevice({ apiKey: key.trim() });
                  toast(key.trim() ? "Clé enregistrée sur cet appareil" : "Clé retirée");
                }}
              >
                Enregistrer
              </button>
            </div>
          </Field>
          <Field label="Modèle" htmlFor="api-model">
            <select id="api-model" className="select" value={device.model} onChange={(e) => setDevice({ model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </section>
  );
}

function DataSection({ data }: { data: AppData }) {
  const sync = useStore((s) => s.sync);
  const fileRef = useRef<HTMLInputElement>(null);
  const icsRef = useRef<HTMLInputElement>(null);
  const hasDemo = Object.values(data.tasks).some((t) => t.demo) || Object.values(data.recurring).some((r) => r.demo);

  const exportJson = async () => {
    const json = JSON.stringify(data, null, 2);
    const filename = `cap-sauvegarde-${todayISO()}.json`;
    const downloads = await getCapability("downloads");
    if (downloads) {
      try {
        await downloads.save({ filename, data: json });
      } catch {
        toast("Téléchargement annulé");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="panel">
      <h2>Données</h2>
      <p className="small muted">
        {sync === "claude"
          ? "Tes données sont enregistrées dans ton espace privé Claude et synchronisées entre tes appareils."
          : "Tes données sont enregistrées dans ce navigateur. Exporte-les pour les transférer sur un autre appareil."}
      </p>
      <div className="row-wrap">
        <button className="btn btn-sm" onClick={exportJson}>
          <Icon name="download" size={16} /> Exporter (JSON)
        </button>
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> Importer une sauvegarde
        </button>
        <button className="btn btn-sm" onClick={() => icsRef.current?.click()}>
          <Icon name="calendar" size={16} /> Importer un calendrier (.ics)
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const parsed = JSON.parse(await f.text());
            const ok = await askConfirm({ title: "Remplacer tes données ?", text: "La sauvegarde remplacera tout le contenu actuel.", confirmLabel: "Importer", danger: true });
            if (ok) importAll(parsed);
          } catch {
            toast("Ce fichier n'est pas une sauvegarde Cap valide");
          }
        }}
      />
      <input
        ref={icsRef}
        type="file"
        accept="text/calendar,.ics"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const res = icsToEvents(await f.text(), useStore.getState().data, todayISO());
          if (!res.events.length) {
            toast(`Aucun nouvel événement (${res.duplicates} doublon${res.duplicates > 1 ? "s" : ""} ignoré${res.duplicates > 1 ? "s" : ""})`);
            return;
          }
          mergeEvents(res.events, `${res.events.length} événements importés · ${res.duplicates} doublons ignorés`);
        }}
      />
      <p className="tiny faint">Import .ics : Google Agenda, Outlook ou l'agenda de l'école. Les événements déjà présents ne sont pas dupliqués.</p>
      {!inClaude() && (
        <div className="stack-sm">
          <button
            className="btn btn-sm"
            onClick={() => {
              const ics = buildIcs(useStore.getState().data, todayISO(), 28);
              const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "cap-agenda.ics";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast("Fichier prêt : ouvre-le pour l'ajouter à ton agenda");
            }}
          >
            📲 Exporter vers l'agenda du téléphone (.ics)
          </button>
          <p className="tiny faint">
            Les 4 prochaines semaines, avec une alarme à l'heure de départ et la veille des échéances : ton téléphone te prévient même app fermée. Réimporter le fichier
            met à jour les événements.
          </p>
        </div>
      )}
      <hr className="sep" />
      <div className="row-wrap">
        {hasDemo ? (
          <button
            className="btn btn-sm btn-danger"
            onClick={async () => {
              if (await askConfirm({ title: "Supprimer les exemples ?", text: "Tes propres ajouts sont conservés.", confirmLabel: "Supprimer", danger: true })) {
                removeDemo();
                open({ type: "setup" });
              }
            }}
          >
            Supprimer les exemples
          </button>
        ) : (
          <button
            className="btn btn-sm"
            onClick={async () => {
              if (await askConfirm({ title: "Recharger les exemples ?", text: "Tes données actuelles seront remplacées par les exemples.", confirmLabel: "Recharger", danger: true })) loadDemo();
            }}
          >
            Recharger les exemples
          </button>
        )}
        <button
          className="btn btn-sm btn-danger"
          onClick={async () => {
            if (await askConfirm({ title: "Tout effacer ?", text: "Toutes tes données seront supprimées. Pense à exporter avant.", confirmLabel: "Tout effacer", danger: true })) resetAll();
          }}
        >
          Tout effacer
        </button>
      </div>
    </section>
  );
}
