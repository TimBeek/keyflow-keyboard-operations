import { apiErrorResponse } from "@/server/api-errors";
import { readOperationsState } from "@/server/operations-state-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";
// De voorraad verandert elke conversie; een gecachet antwoord zou een ander
// apparaat een verouderd beeld geven, en dat is precies wat we oplossen.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actorId = await resolveRequestActorId(
      new URL(request.url).searchParams.get("actorId"),
    );
    return Response.json(await readOperationsState(actorId));
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
