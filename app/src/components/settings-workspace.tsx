"use client";

import { useState } from "react";
import { conversionMethods } from "@/domain/conversion-policy";
import { targetLayoutOptions } from "@/domain/keyboard-layouts";
import type {
  LayoutRule,
  OperationalMethodId,
  OperationsPolicy,
  PriceBand,
} from "@/domain/operations";
import { minimumHistoryDays, usageWindowWeeks } from "@/domain/resupply";
import { policyPreview } from "@/domain/policy-preview";
import type { ConversionMethodId } from "@/domain/conversion-policy";

/**
 * Eén plek voor de regels die de werkvloer aansturen.
 *
 * Alles hier stond eerder in code of verspreid over beheerschermen. De grens
 * waarboven een toetsenbordsprint komt, welke methodes aan staan, en vooral: de
 * uitzonderingen per taal. "Nederlands altijd met de premiumsticker" is beleid,
 * en beleid hoort door management gezet te worden, niet door een programmeur.
 */

/** Sterren erbij: "3 sterren" is hoe er op de werkvloer over gepraat wordt. */
function methodCell(method: ConversionMethodId) {
  if (method === "none") return <span className="preview-plain">Geen conversie</span>;
  const profile = conversionMethods[method];
  return (
    <span className="preview-method">
      <b>{"★".repeat(profile.tier)}</b> {profile.name}
    </span>
  );
}

const bands: PriceBand[] = ["below", "above"];

function stars(method: OperationalMethodId) {
  return "*".repeat(conversionMethods[method].tier);
}

function methodName(method: ConversionMethodId) {
  return method === "none" ? "geen conversie" : conversionMethods[method].name;
}

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
   * plaats van stilletjes op een oude stand te blijven staan.
   *
   * Vergelijken op inhoud en niet op het object zelf: de statuspolling levert
   * elke twintig seconden een nieuw object met dezelfde inhoud op. Op
   * objectidentiteit gooide dit scherm daardoor elke twintig seconden weg waar
   * iemand net mee bezig was.
   */
  const incoming = JSON.stringify({ policy, directPrintLayouts });
  const [seen, setSeen] = useState(incoming);
  if (seen !== incoming) {
    setSeen(incoming);
    setDraft(policy);
    setLayouts(directPrintLayouts);
  }

  // Meteen doorgerekend terwijl je nog aan het schuiven bent: het gevolg is
  // waar je naar kijkt, niet de instelling zelf.
  const preview = policyPreview(draft, layouts);

  const dirty = JSON.stringify(draft) !== JSON.stringify(policy)
    || JSON.stringify(layouts) !== JSON.stringify(directPrintLayouts);

  /**
   * Regels worden vanaf hier altijd per prijsklasse gezet. Een oudere regel
   * zonder klasse gold voor allebei; die wordt bij de eerste wijziging in twee
   * losse regels uit elkaar gehaald, zodat je de ene kunt aanpassen zonder de
   * andere ongemerkt mee te veranderen.
   */
  function splitBands(rules: LayoutRule[], layout: string): LayoutRule[] {
    const key = layout.toLowerCase();
    return rules.flatMap((rule) => {
      if (rule.layout.toLowerCase() !== key || rule.band) return [rule];
      return [
        { ...rule, band: "below" as PriceBand },
        { ...rule, band: "above" as PriceBand },
      ];
    });
  }

  function editRule(
    layout: string,
    band: PriceBand,
    change: (rule: LayoutRule | null) => LayoutRule | null,
  ) {
    setDraft((current) => {
      const rules = splitBands(current.layoutRules, layout);
      const key = layout.toLowerCase();
      const existing = rules.find(
        (rule) => rule.layout.toLowerCase() === key && rule.band === band,
      ) ?? null;
      const rest = rules.filter((rule) => rule !== existing);
      const next = change(existing);
      return { ...current, layoutRules: next ? [...rest, next] : rest };
    });
  }

  function setRule(layout: string, band: PriceBand, method: OperationalMethodId | "") {
    editRule(layout, band, (existing) => method
      ? {
        layout,
        band,
        method,
        ...(existing?.fallback ? { fallback: existing.fallback } : {}),
        note: existing?.note ?? "",
      }
      : null);
  }

  function setFallback(layout: string, band: PriceBand, fallback: OperationalMethodId | "") {
    editRule(layout, band, (existing) => {
      if (!existing) return existing;
      const { fallback: _weg, ...rest } = existing;
      return fallback ? { ...rest, fallback } : rest;
    });
  }

  function setNote(layout: string, band: PriceBand, note: string) {
    editRule(layout, band, (existing) => existing ? { ...existing, note } : existing);
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
            <h2>Regel per taal en prijsklasse</h2>
            <p>
              Elk vakje is de keuze zelf en het gevolg tegelijk: je klikt aan wat
              de werkvloer moet doen, en je ziet er meteen onder wat eruit komt.
              Staat een vakje op <em>Volgt de verkoopwaarde</em>, dan kiest
              KeyFlow zoals altijd. Zet je er iets neer, dan gaat dat voor.
            </p>
            <p>
              Onder elke keuze staat wat er gebeurt als die methode niet kan: een
              lege hangmap, of een model dat de toetsenbordsprinter niet aankan.
              Laat je dat op <em>vanzelf</em> staan, dan zoekt KeyFlow zelf het
              dichtstbijzijnde alternatief.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operations-table policy-editor">
            <thead>
              <tr>
                <th>Taal</th>
                <th>Onder €{draft.thresholdEur}</th>
                <th>Vanaf €{draft.thresholdEur}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.layout}>
                  <td className="policy-language"><strong>{row.label}</strong></td>
                  {bands.map((band) => {
                    const cell = band === "below" ? row.below : row.above;
                    // Een regel die van een andere taal komt hoort niet
                    // bewerkbaar te zijn alsof hij van deze rij is: dan zet je
                    // per ongeluk twee regels neer die elkaar tegenspreken.
                    const eigen = cell.rule !== null
                      && cell.from.toLowerCase() === row.layout.toLowerCase();
                    const rule = eigen ? cell.rule : null;
                    return (
                      <td key={band} className={cell.rule ? "has-rule" : ""}>
                        <select
                          value={rule ? rule.method : ""}
                          onChange={(event) => setRule(
                            row.layout,
                            band,
                            event.target.value as OperationalMethodId | "",
                          )}
                        >
                          <option value="">Volgt de verkoopwaarde</option>
                          {methodOrder.map((method) => (
                            <option key={method} value={method}>
                              {stars(method)} {conversionMethods[method].name}
                            </option>
                          ))}
                        </select>

                        <span className="policy-outcome">
                          {cell.rule && !eigen && (
                            <b className="rule-badge">via {cell.from}</b>
                          )}
                          Werkvloer krijgt: {methodCell(cell.method)}
                        </span>

                        <label className="policy-fallback">
                          <span>Kan dat niet?</span>
                          <select
                            value={rule && rule.fallback ? rule.fallback : ""}
                            disabled={!rule}
                            onChange={(event) => setFallback(
                              row.layout,
                              band,
                              event.target.value as OperationalMethodId | "",
                            )}
                          >
                            <option value="">— zoekt zelf: {methodName(cell.ifBlocked)}</option>
                            {methodOrder
                              .filter((method) => !rule || method !== rule.method)
                              .map((method) => (
                                <option key={method} value={method}>
                                  {stars(method)} {conversionMethods[method].name}
                                </option>
                              ))}
                          </select>
                        </label>

                        {rule && (
                          <input
                            value={rule.note}
                            maxLength={200}
                            placeholder="Waarom? (komt bij de medewerker in beeld)"
                            onChange={(event) => setNote(row.layout, band, event.target.value)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="policy-footnote">
          Uitgerekend met de instellingen zoals ze nu op dit scherm staan
          {dirty ? " (inclusief wat je nog niet hebt opgeslagen)" : ""}, met
          dezelfde functie die de werkvloer gebruikt. Er is uitgegaan van een
          normale dag: alles op voorraad en technisch geschikt.
        </p>
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
