import "server-only";
import { z } from "zod";
import { ConversionLogError } from "@/domain/conversion-log";
import { PrintRequestError } from "@/domain/print-requests";
import { StickerSkuError } from "@/domain/sticker-sku";
import { PrinterCheckError } from "@/domain/printer-check";
import { AccessCodeError } from "./access-session";
import { StickerSheetError } from "./sticker-sheet-service";
import { RateLimitError } from "./rate-limit";
import { AuthorizationError } from "./authorization-service";
import { DatabaseConfigurationError } from "./database";
import { RequestIdentityError } from "./request-identity";

/**
 * Eén plek die een fout vertaalt naar iets wat een scherm kan tonen. Zonder dit
 * herhaalt elke route dezelfde ladder, en dan wijkt er vroeg of laat één af.
 */
export function apiErrorResponse(error: unknown) {
  if (error instanceof RateLimitError) {
    return {
      status: 429,
      body: { error: "TOO_MANY_REQUESTS", message: error.message },
    };
  }
  if (error instanceof RequestIdentityError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  if (error instanceof DatabaseConfigurationError) {
    return {
      status: 503,
      body: { error: "DATABASE_NOT_CONFIGURED", message: error.message },
    };
  }
  if (error instanceof AuthorizationError) {
    return { status: 403, body: { error: "FORBIDDEN", message: error.message } };
  }
  if (error instanceof PrintRequestError
    || error instanceof ConversionLogError
    || error instanceof StickerSkuError
    || error instanceof AccessCodeError
    || error instanceof PrinterCheckError
    || error instanceof StickerSheetError) {
    return { status: 422, body: { error: "RULE_VIOLATION", message: error.message } };
  }
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: "INVALID_INPUT", details: z.treeifyError(error) },
    };
  }

  // Onbekende fouten mogen niet met interne details naar buiten.
  console.error("Onverwachte fout in een API-route:", error);
  return {
    status: 500,
    body: { error: "UNEXPECTED", message: "Er ging iets mis. Probeer het opnieuw." },
  };
}
