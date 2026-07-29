/**
 * Noviply print 's ochtends de sterke stickers voor de buitenlandse orders onder
 * de drempel, en 's middags nog een ronde. Wat al klaarligt hoeft niet door dit
 * proces. Maar soms klopt de layout niet, of komt er een oudere order langs die
 * opnieuw aangevraagd moet worden. Die uitzonderingen komen hier op de
 * bestellijst te staan — de lijst die Noviply nu nog in een pdf bijhoudt.
 */

export type PrintRequestStatus = "requested" | "printed" | "not_printable";

export type PrintRequestInput = {
  model: string;
  layout: string;
  variant: string;
  orderReference: string;
  reason: string;
};

export type PrintRequestRecord = {
  id: string;
  brand: string;
  model: string;
  layout: string;
  variant: string;
  orderReference: string;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  status: PrintRequestStatus;
  handledAt: string | null;
  handledBy: string | null;
  note: string;
};

type RequestMetadata = {
  id: string;
  requestedAt: string;
  requestedBy: string;
};

type SettleMetadata = {
  handledAt: string;
  handledBy: string;
};

export class PrintRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintRequestError";
  }
}

/** De tracker houdt merk en model apart; onze catalogus zet ze in één veld. */
export function brandFromModel(model: string) {
  return model.trim().split(/\s+/)[0] ?? "";
}

export function createPrintRequest(
  input: PrintRequestInput,
  metadata: RequestMetadata,
): PrintRequestRecord {
  const model = input.model.trim();
  if (!model) {
    throw new PrintRequestError("Een aanvraag heeft een model nodig.");
  }
  const requestedBy = metadata.requestedBy.trim();
  if (!requestedBy) {
    throw new PrintRequestError("Een aanvraag heeft een aanvrager nodig.");
  }

  return {
    id: metadata.id,
    brand: brandFromModel(model),
    model,
    layout: input.layout.trim(),
    variant: input.variant.trim(),
    orderReference: input.orderReference.trim(),
    reason: input.reason.trim(),
    requestedAt: metadata.requestedAt,
    requestedBy,
    status: "requested",
    handledAt: null,
    handledBy: null,
    note: "",
  };
}

export function settlePrintRequest(
  record: PrintRequestRecord,
  status: Exclude<PrintRequestStatus, "requested">,
  note: string,
  metadata: SettleMetadata,
): PrintRequestRecord {
  const handledBy = metadata.handledBy.trim();
  if (!handledBy) {
    throw new PrintRequestError("Leg vast wie de aanvraag heeft afgehandeld.");
  }
  // Wie zegt dat iets niet te printen is, moet zeggen waarom — anders weet de
  // werkvloer niet wat er dan wél moet gebeuren.
  const trimmedNote = note.trim();
  if (status === "not_printable" && trimmedNote.length < 3) {
    throw new PrintRequestError("Vermeld waarom deze sticker niet geprint kan worden.");
  }

  return {
    ...record,
    status,
    note: trimmedNote,
    handledAt: metadata.handledAt,
    handledBy,
  };
}

export function printRequestTotals(records: PrintRequestRecord[]) {
  return {
    open: records.filter((record) => record.status === "requested").length,
    printed: records.filter((record) => record.status === "printed").length,
    notPrintable: records.filter((record) => record.status === "not_printable").length,
  };
}

export function printRequestStatusLabel(status: PrintRequestStatus) {
  if (status === "printed") return "Printed";
  if (status === "not_printable") return "Cannot print";
  return "To do";
}
