import { productionReadiness } from "@/server/readiness-service";

export const runtime = "nodejs";

export async function GET() {
  const report = await productionReadiness();
  return Response.json(
    {
      service: "keyflow",
      ...report,
      timestamp: new Date().toISOString(),
    },
    { status: report.ready ? 200 : 503 },
  );
}
