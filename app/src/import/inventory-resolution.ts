import { z } from "zod";

export const resolutionActionSchema = z.enum([
  "correct_value",
  "keep_separate",
  "accept_warning",
  "reject_row",
]);

export type ResolutionAction = z.infer<typeof resolutionActionSchema>;

export type ResolvableIssue = {
  severity: "error" | "warning" | "review";
  field: string;
};

export function validateImportResolution(
  issue: ResolvableIssue,
  action: ResolutionAction,
  rawCorrectedValue?: string,
) {
  if (!allowedActions(issue).includes(action)) {
    throw new InventoryResolutionError(
      "INVALID_RESOLUTION_ACTION",
      "Deze afhandelactie past niet bij dit type bevinding.",
    );
  }

  if (action !== "correct_value") {
    return { action, correctedValue: null };
  }

  const value = rawCorrectedValue?.trim() ?? "";
  if (!value) {
    throw new InventoryResolutionError(
      "CORRECTED_VALUE_REQUIRED",
      "Vul de gecorrigeerde waarde in.",
    );
  }

  if (issue.field === "sku" && !/^NB\d+E\d+(NL|FR|DE)$/i.test(value)) {
    throw new InventoryResolutionError(
      "INVALID_CORRECTED_VALUE",
      "Gebruik een geldig artikelnummer, bijvoorbeeld NB10100E1NL.",
    );
  }
  if (issue.field === "quantity" && (!/^\d+$/.test(value) || Number(value) > 100_000)) {
    throw new InventoryResolutionError(
      "INVALID_CORRECTED_VALUE",
      "Het gecorrigeerde aantal moet een geheel getal tussen 0 en 100.000 zijn.",
    );
  }
  if (issue.field === "layout" && !["QWERTY US", "AZERTY FR", "QWERTZ DE"].includes(value.toUpperCase())) {
    throw new InventoryResolutionError(
      "INVALID_CORRECTED_VALUE",
      "Kies QWERTY US, AZERTY FR of QWERTZ DE.",
    );
  }
  if (
    issue.field === "linkedModels"
    && ["", "geen gevonden", "-", "\\", "0", "a"].includes(value.toLowerCase())
  ) {
    throw new InventoryResolutionError(
      "INVALID_CORRECTED_VALUE",
      "Vul minimaal één geldig gekoppeld model in.",
    );
  }
  if (issue.field === "model" && value.length < 2) {
    throw new InventoryResolutionError(
      "INVALID_CORRECTED_VALUE",
      "Vul een geldige modelnaam in.",
    );
  }

  return {
    action,
    correctedValue: issue.field === "layout" ? value.toUpperCase() : value,
  };
}

export function allowedActions(issue: ResolvableIssue): ResolutionAction[] {
  if (issue.severity === "error") return ["correct_value", "reject_row"];
  if (issue.severity === "review") return ["keep_separate", "reject_row"];
  return ["correct_value", "accept_warning", "reject_row"];
}

export class InventoryResolutionError extends Error {
  constructor(
    public readonly code:
      | "INVALID_RESOLUTION_ACTION"
      | "CORRECTED_VALUE_REQUIRED"
      | "INVALID_CORRECTED_VALUE",
    message: string,
  ) {
    super(message);
    this.name = "InventoryResolutionError";
  }
}
