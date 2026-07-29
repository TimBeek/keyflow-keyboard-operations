import { checkWriteLimit, RateLimitError } from "@/server/rate-limit";
import { DatabaseConfigurationError } from "@/server/database";
import {
  importInventoryWorkbook,
  inventoryImportErrorResponse,
} from "@/server/inventory-import-service";
import {
  RequestIdentityError,
  requestIdentityErrorResponse,
  resolveRequestActorId,
} from "@/server/request-identity";

export const runtime = "nodejs";

const maxFileSize = 10 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const form = await request.formData();
    const file = form.get("file");
    const suppliedActorId = form.get("actorId");
    const actorId = await resolveRequestActorId(
      suppliedActorId,
      process.env.KEYFLOW_IMPORT_ACTOR_ID,
    );

    if (!(file instanceof File)) {
      return Response.json(
        { error: "INVALID_UPLOAD", message: "Veld 'file' is verplicht." },
        { status: 400 },
      );
    }
    if (!actorId) {
      return Response.json(
        {
          error: "OPERATOR_NOT_CONFIGURED",
          message: "Configureer KEYFLOW_IMPORT_ACTOR_ID voordat voorraad kan worden geïmporteerd.",
        },
        { status: 503 },
      );
    }
    if (!file.name.toLowerCase().endsWith(".xlsx") || !acceptedMimeTypes.has(file.type)) {
      return Response.json(
        { error: "INVALID_FILE_TYPE", message: "Alleen een .xlsx-bestand is toegestaan." },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > maxFileSize) {
      return Response.json(
        { error: "INVALID_FILE_SIZE", message: "Het bestand moet tussen 1 byte en 10 MB zijn." },
        { status: 413 },
      );
    }

    const result = await importInventoryWorkbook({
      fileName: file.name,
      actorId,
      contents: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "TOO_MANY_REQUESTS", message: error.message },
        { status: 429 },
      );
    }
    if (error instanceof RequestIdentityError) {
      const response = requestIdentityErrorResponse(error);
      return Response.json(response.body, { status: response.status });
    }
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "DATABASE_NOT_CONFIGURED", message: error.message },
        { status: 503 },
      );
    }

    const response = inventoryImportErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
