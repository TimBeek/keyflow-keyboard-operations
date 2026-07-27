import { isDatabaseConfigured } from "@/server/database";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "keyflow",
    databaseConfigured: isDatabaseConfigured(),
    timestamp: new Date().toISOString(),
  });
}
