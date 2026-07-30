"use client";

import { useState } from "react";
import { conversionMethods } from "@/domain/conversion-policy";
import { targetLayoutOptions } from "@/domain/keyboard-layouts";
import type { LayoutRule, OperationalMethodId, OperationsPolicy } from "@/domain/operations";
import { minimumHistoryDays, usageWindowWeeks } from "@/domain/resupply";

/**
 * Eén plek voor de regels die de werkvloer aansturen.
 *
 * Alles hier stond eerder in code of verspreid over beheerschermen. De grens
 * waarboven een toetsenbordsprint komt, welke methodes aan staan, en vooral: de
 * uitzonderingen per taal. "Nederlands altijd met de premiumsticker" is beleid,
 * en beleid hoort door management gezet te worden, niet door een programmeur.
 */

const methodOrder: OperationalMethodId[] = [
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
];

type Props = {
  policy: OperationsPolicy;
  directPrintLayouts: string[];
  onSave: (policy: OperationsPolicy, directPrintLayouts: string[]) => Promise<void>;
};

export function SettingsWorkspace({ policy, directPrintLayouts, onSave }: Props) {
  const [draft, setDraft] = useState(policy);
  const [layouts, setLayouts] = useState(directPrintLayouts);
  const [saving, setSaving] = useState(false);

  /**
   * Past een ander het beleid aan, dan hoort dit scherm mee te bewegen in
   * plaats van stilletjes op een oude stand te blijven staan. De sleutel dwingt
   * dat af zonder een effect dat state zet — en houdt tegelijk in de gaten dat
   * eigen, nog niet bewaarde wijzigingen niet worden weggegooid zolang de
   * server niets nieuws stuurt.
   */
  const [seen, setSeen] = useState({ policy, directPrintLayouts });
  if (seen.policy !== policy || seen.directPrintLayouts !== directPrintLayouts) {
    setSeen({ policy, directPrintLayouts });
    setDraft(policy);
    setLayouts(directPrintLayouts);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(policy)
    || JSON.stringify(layouts) !== JSON.stringify(directPrintLayouts);

  function setRule(layout: string, method: OperationalMethodId | "") {
    setDraft((current) => {
      const rest = current.layoutRules.filter((rule) => rule.layout !== layout);
      if (!method) return { ...current, layoutRules: rest };
      const existing = current.layoutRules.find((rule) => rule.layout === layout);
      const rule: LayoutRule = { layout, method, note: existing?.note ?? "" };
      return { ...current, layoutRules: [...rest, rule] };
    });
  }

  function setNote(layout: string, note: string) {
    setDraft((current) => ({
      ...current,
      layoutRules: current.layoutRules.map((rule) =>
        rule.layout === layout ? { ...rule, note } : rule),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft, layouts);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-view settings-view">
      <section className="panel settings-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">WANNEER WELKE OPLOSSING</span>
            <h2>Regel per taal</h2>
            <p>
              Normaal kiest KeyFlow op verkoopwaarde: boven de grens een
              toetsenbordsprint, eronder een sticker. Wil je voor één taal altijd
              iets anders, dan zet je dat hier. De werkvloer ziet het meteen.
            </p>
          </div>
        </div>

        <div className="layout-rules">
          {targetLayoutOptions.map((layout) => {
            const rule = draft.layoutRules.find((item) => item.layout === layout.value);
            return (
              <div key={layout.value} className={rule ? "has-rule" : ""}>
                <span className="layout-rule-name">{layout.label}</span>
                <select
                  value={rule?.method ?? ""}
                  onChange={(event) => setRule(layout.value, event.target.value as OperationalMethodId | "")}
                >
                  <option value="">Volgt de verkoopwaarde</option>
                  {methodOrder.map((method) => (
                    <option key={method} value={method}>
                      {"★".repeat(conversionMethods[method].tier)} {conversionMethods[method].name}
                    </option>
                  ))}
                </select>
                {rule && (
                  <input
                    value={rule.note}
                    maxLength={200}
                    placeholder="Waarom? (komt bij de medewerker in beeld)"
                    onChange={(event) => setNote(layout.value, event.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">DE GEWONE REGEL</span>
            <h2>Wanneer een toetsenbordsprint</h2>
            <p>Geldt voor elke taal waar hierboven niets voor is ingesteld.</p>
          </div>
        </div>

        <div className="settings-grid">
          <label>
            <span>Vanaf welke verkoopwaarde</span>
            <select
              value={draft.thresholdEur}
              onChange={(event) => setDraft({ ...draft, thresholdEur: Number(event.target.value) })}
            >
              {[100, 200, 300, 400, 500, 750].map((amount) => (
                <option key={amount} value={amount}>Vanaf €{amount}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Werkdruk</span>
            <select
              value={draft.workload}
              onChange={(event) => setDraft({ ...draft, workload: event.target.value as OperationsPolicy["workload"] })}
            >
              <option value="normal">Normaal</option>
              <option value="busy">Druk</option>
              <option value="critical">Kritiek</option>
            </select>
          </label>
        </div>

        <h3 className="settings-subhead">Welke oplossingen mogen gebruikt worden</h3>
        <div className="settings-toggles">
          {methodOrder.map((method) => (
            <label key={method} className={`tone-${conversionMethods[method].tone}`}>
              <input
                type="checkbox"
                checked={draft.methodEnabled[method]}
                onChange={(event) => setDraft({
                  ...draft,
                  methodEnabled: { ...draft.methodEnabled, [method]: event.target.checked },
                })}
              />
              <span>
                <strong>{conversionMethods[method].name}</strong>
                <small>{conversionMethods[method].note} · {conversionMethods[method].supplier}</small>
              </span>
            </label>
          ))}
        </div>

        <h3 className="settings-subhead">Wat de werkvloer zelf mag</h3>
        <div className="settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={draft.employeeCanReceive}
              onChange={(event) => setDraft({ ...draft, employeeCanReceive: event.target.checked })}
            />
            <span><strong>Ontvangsten boeken</strong><small>Nieuwe vellen in een hangmap leggen</small></span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.employeeCanBookMismatch}
              onChange={(event) => setDraft({ ...draft, employeeCanBookMismatch: event.target.checked })}
            />
            <span><strong>Uitval boeken</strong><small>Een vel afschrijven dat niet paste</small></span>
          </label>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">BIJBESTELLEN</span>
            <h2>Wanneer Noviply moet naleveren</h2>
            <p>
              Het minimum per hangmap volgt het gemeten verbruik. Deze twee bepalen
              hoeveel voorraad daar bovenop nodig is. Er is minstens{" "}
              {minimumHistoryDays} dagen historie nodig, en er wordt maximaal{" "}
              {usageWindowWeeks} weken teruggekeken.
            </p>
          </div>
        </div>
        <div className="settings-grid">
          <label>
            <span>Levertijd van Noviply</span>
            <select
              value={draft.resupplyLeadTimeDays}
              onChange={(event) => setDraft({ ...draft, resupplyLeadTimeDays: Number(event.target.value) })}
            >
              {[7, 10, 14, 21, 30].map((days) => (
                <option key={days} value={days}>{days} dagen</option>
              ))}
            </select>
          </label>
          <label>
            <span>Reserve bovenop de levertijd</span>
            <select
              value={draft.resupplySafetyWeeks}
              onChange={(event) => setDraft({ ...draft, resupplySafetyWeeks: Number(event.target.value) })}
            >
              {[0, 1, 2, 3, 4].map((weeks) => (
                <option key={weeks} value={weeks}>{weeks} {weeks === 1 ? "week" : "weken"}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">PRINTRONDES</span>
            <h2>Wanneer Noviply automatisch print</h2>
            <p>
              Twee vaste rondes per dag. De werkvloer gebruikt deze tijden om te
              bepalen of een vel nog vanzelf meekomt: staat de pakbon op vandaag
              en moet er nog een ronde komen, dan wordt er niets aangevraagd maar
              apart gelegd. Zet ze niet te vroeg — dan vraagt het scherm of het
              vel er ligt terwijl de ronde nog moet lopen.
            </p>
          </div>
        </div>
        <div className="settings-grid">
          <label>
            <span>Ochtendronde</span>
            <input
              type="time"
              value={draft.printRunTimes.morning}
              onChange={(event) => setDraft({
                ...draft,
                printRunTimes: { ...draft.printRunTimes, morning: event.target.value },
              })}
            />
          </label>
          <label>
            <span>Middagronde</span>
            <input
              type="time"
              value={draft.printRunTimes.afternoon}
              onChange={(event) => setDraft({
                ...draft,
                printRunTimes: { ...draft.printRunTimes, afternoon: event.target.value },
              })}
            />
          </label>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">TOETSENBORDSPRINTER</span>
            <h2>Wat Notebook Service kan</h2>
            <p>
              Per laptopmodel weet KeyFlow dit al uit hun eigen productlijst. Deze
              lijst geldt alleen voor modellen die daar niet in staan. Laat je hem
              leeg, dan wordt niets geblokkeerd op een model dat we niet kennen.
            </p>
          </div>
        </div>
        <div className="settings-toggles wide">
          {targetLayoutOptions.map((layout) => (
            <label key={layout.value}>
              <input
                type="checkbox"
                checked={layouts.includes(layout.value)}
                onChange={(event) => setLayouts((current) =>
                  event.target.checked
                    ? [...current, layout.value]
                    : current.filter((item) => item !== layout.value))}
              />
              <span><strong>{layout.value}</strong></span>
            </label>
          ))}
        </div>
      </section>

      <footer className="settings-save">
        <span>{dirty ? "Er staan wijzigingen klaar." : "Alles is bewaard."}</span>
        <button className="primary-button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Bewaren…" : "Bewaren voor iedereen"}
        </button>
      </footer>
    </div>
  );
}
