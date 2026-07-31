/**
 * Van de vier oplossingen liet er tot nu toe maar één een spoor na: het
 * voorraadvel, omdat daar voorraad van afgaat. Een laptop met losse stickers of
 * een toetsenbordsprint verdween zonder registratie. Daardoor was niet te zeggen
 * hoeveel laptops de stickerafdeling op een dag deed, laat staan met welke
 * methode. Dit logboek legt elke afgeronde conversie vast — ook die zonder
 * voorraadgevolg.
 */

import type { ConversionMethodId, OperationalMethodId } from "./conversion-policy";

/**
 * Vraagt de medewerker een sticker aan bij Noviply, dan is zijn deel klaar maar
 * de laptop nog niet. Die twee moeten in het rapport uit elkaar blijven.
 */
export type ConversionStatus = "completed" | "awaiting_print";

export type ConversionLogEntry = {
  id: string;
  occurredAt: string;
  method: ConversionMethodId;
  status: ConversionStatus;
  model: string;
  targetLayout: string;
  variant: string;
  /** Leeg wanneer er geen voorraadvel aan te pas kwam. */
  sku: string;
  storageNumber: number | null;
  orderReference: string;
  /** Aantal laptops dat met deze handeling is omgezet. */
  quantity?: number;
  actor: string;
  /**
   * Gezet wanneer deze laptop een toetsenbordsprint hoorde te krijgen en daar
   * niet doorheen kwam. Precies deze lijst gaat naar Notebook Service.
   */
  fellBackFrom?: OperationalMethodId;
};

export type ConversionLogInput = {
  method: ConversionMethodId;
  status: ConversionStatus;
  model: string;
  targetLayout: string;
  variant?: string;
  sku?: string;
  storageNumber?: number | null;
  orderReference?: string;
  /** Aantal laptops onder dit ordernummer; standaard één. */
  quantity?: number;
  fellBackFrom?: OperationalMethodId;
};

type LogMetadata = {
  id: string;
  occurredAt: string;
  actor: string;
};

export class ConversionLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionLogError";
  }
}

export function createConversionLogEntry(
  input: ConversionLogInput,
  metadata: LogMetadata,
): ConversionLogEntry {
  const model = input.model.trim();
  if (!model) {
    throw new ConversionLogError("Een conversie hoort bij een model.");
  }
  const actor = metadata.actor.trim();
  if (!actor) {
    throw new ConversionLogError("Leg vast wie de conversie heeft uitgevoerd.");
  }

  return {
    id: metadata.id,
    occurredAt: metadata.occurredAt,
    method: input.method,
    status: input.status,
    model,
    targetLayout: input.targetLayout.trim(),
    variant: input.variant?.trim() ?? "",
    sku: input.sku?.trim().toUpperCase() ?? "",
    storageNumber: input.storageNumber ?? null,
    orderReference: input.orderReference?.trim() ?? "",
    quantity: Math.max(1, Math.round(input.quantity || 1)),
    actor,
    ...(input.fellBackFrom ? { fellBackFrom: input.fellBackFrom } : {}),
  };
}
