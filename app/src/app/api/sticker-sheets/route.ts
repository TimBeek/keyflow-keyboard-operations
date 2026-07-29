import { apiErrorResponse } from "@/server/api-errors";
import { resolveRequestActorId } from "@/server/request-identity";
import { addStickerSheet, nextStorageNumber } from "@/server/sticker-sheet-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ nextStorageNumber: await nextStorageNumber() });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await addStickerSheet({
      ...body,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
