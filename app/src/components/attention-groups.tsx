"use client";

import {
  attentionByKind,
  attentionCases,
  attentionKindLabel,
  type AttentionItem,
} from "@/domain/attention";
import {
  noviplyBlockedFor,
  type NoviplyUnavailableRecord,
} from "@/domain/noviply-availability";

/**
 * De aandachtspunten, per soort, als kaarten.
 *
 * Stond twee keer bijna hetzelfde in het bureaubladbestand — één keer voor "nu
 * oppakken" en één keer voor "zodra het uitkomt" — waardoor de twee blokken uit
 * elkaar liepen: de knoppen stonden alleen in het bovenste, en een wijziging in
 * de opmaak raakte er maar één.
 *
 * Elke soort krijgt hier de volle breedte en verdeelt zijn eigen kaarten over
 * kolommen. Daarvóór was elke soort één kolom, en dan bepaalt de langste soort
 * de hoogte van de hele rij: vier regels links, dertig rechts, en een gapend
 * wit vlak ertussen.
 */

type Koppeling = NonNullable<AttentionItem["koppeling"]>;

type Props = {
  items: AttentionItem[];
  noviplyUnavailable: NoviplyUnavailableRecord[];
  /** Alleen bij "nu oppakken"; daar hoort iets gedaan te worden. */
  metActies?: boolean;
  onAllowAgain?: (id: string) => void;
  onRejectPairing?: (koppeling: Koppeling) => void;
  onWithdrawRejection?: (koppeling: Koppeling) => void;
  isRejected?: (koppeling: Koppeling) => boolean;
  formatMoment: (moment: string) => string;
};

export function AttentionGroups({
  items,
  noviplyUnavailable,
  metActies = false,
  onAllowAgain,
  onRejectPairing,
  onWithdrawRejection,
  isRejected,
  formatMoment,
}: Props) {
  return (
    <div className="attention-groups">
      {[...attentionByKind(items).entries()].map(([kind, vanDezeSoort]) => {
        const zaken = attentionCases(vanDezeSoort);
        return (
          <div key={kind} className={`attention-group ${kind}`}>
            <h3>
              {attentionKindLabel[kind]}
              <span className="attention-telling">
                {vanDezeSoort.length} {vanDezeSoort.length === 1 ? "regel" : "regels"}
                {zaken.length !== vanDezeSoort.length && ` · ${zaken.length} modellen`}
              </span>
            </h3>
            <ul>
              {/* De hele lijst. Er stonden er zes met een regeltje eronder dat er
                  meer waren — en dan moet je maar raden welke. Ontdubbelen mag,
                  weglaten niet: elke order staat op de kaart. */}
              {zaken.map((zaak) => {
                /*
                 * Zet dit het advies aan de werkvloer stil? Dan hoort de knop om
                 * dat terug te draaien hier te staan, want dit is de plek waar je
                 * het probleem ziet.
                 *
                 * Dit zocht eerst met een prefixvergelijking op de titeltekst.
                 * Daardoor kreeg de ene kaart wel een knop en de andere niet,
                 * pakte een blokkade op "HP ProBook 450 G1" ook de kaart van de
                 * G10, en hief een knop bij QWERTY ES een blokkade op AZERTY FR
                 * op. Nu op model én taal, met de functie die het advies zelf
                 * ook gebruikt.
                 */
                const blokkade = metActies && zaak.kind === "cannot_print"
                  ? noviplyBlockedFor(noviplyUnavailable, zaak.model, zaak.layout)
                  : null;
                const koppeling = metActies ? zaak.eerste.koppeling : undefined;
                return (
                  <li key={zaak.key}>
                    <strong>{zaak.title}</strong>
                    <span>{zaak.detail}</span>
                    <small>
                      {zaak.occurredAt && formatMoment(zaak.occurredAt)}
                      {zaak.aantal > 1 && ` · ${zaak.aantal} keer`}
                    </small>
                    {zaak.orders.length > 0 && (
                      <div className="attention-orders">
                        {zaak.orders.slice(0, 4).map((order) => (
                          <span key={order} className="rule-chip">{order}</span>
                        ))}
                        {zaak.orders.length > 4 && (
                          <span className="rule-chip">
                            +{zaak.orders.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    {blokkade && (
                      <div className="attention-action">
                        <span>
                          De werkvloer krijgt hiervoor geen premiumsticker meer aangeraden.
                        </span>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onAllowAgain?.(blokkade.id)}
                        >
                          Weer aanbieden
                        </button>
                      </div>
                    )}
                    {/* Een melding die alleen vertelt dat het misging verandert
                        niets: morgen wijst de app dezelfde hangmap weer aan en
                        staat dezelfde regel hier opnieuw. Hiermee keur je de
                        koppeling af, en dan slaat het advies die map over voor
                        dit model. */}
                    {koppeling && (
                      isRejected?.(koppeling) ? (
                        <div className="attention-action is-klaar">
                          <span>
                            Afgekeurd — de werkvloer krijgt hangmap{" "}
                            {koppeling.storageNumber} niet meer voor dit model.
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => onWithdrawRejection?.(koppeling)}
                          >
                            Toch weer toestaan
                          </button>
                        </div>
                      ) : (
                        <div className="attention-action">
                          <span>
                            Klopt het dat dit vel niet op dit model past? Dan stopt het
                            advies ermee.
                          </span>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => onRejectPairing?.(koppeling)}
                          >
                            Koppeling afkeuren
                          </button>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
