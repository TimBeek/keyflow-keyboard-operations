import { isDatabaseConfigured } from "@/server/database";
import { productionConfigurationReport } from "@/domain/identity";

export const runtime = "nodejs";

export async function GET() {
  const production = productionConfigurationReport(process.env);
  return Response.json({
    status: "ok",
    service: "keyflow",
    databaseConfigured: isDatabaseConfigured(),
    identityMode: production.mode,
    productionReady: production.ready,
    configurationChecks: production.checks,
    timestamp: new Date().toISOString(),
  });
}
