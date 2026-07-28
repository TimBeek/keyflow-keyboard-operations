import "server-only";
import {
  productionConfigurationReport,
  type ProductionConfigurationReport,
} from "@/domain/identity";
import { database } from "./database";

export type ReadinessReport = ProductionConfigurationReport & {
  databaseReachable: boolean;
  status: "ready" | "configuration_required" | "database_unreachable";
};

export async function productionReadiness(
  environment: Record<string, string | undefined> = process.env,
): Promise<ReadinessReport> {
  const configuration = productionConfigurationReport(environment);
  if (!configuration.ready) {
    return {
      ...configuration,
      databaseReachable: false,
      status: "configuration_required",
    };
  }

  try {
    const sql = database();
    await sql`select 1 as ready`;
    return {
      ...configuration,
      databaseReachable: true,
      status: "ready",
    };
  } catch {
    return {
      ...configuration,
      databaseReachable: false,
      ready: false,
      status: "database_unreachable",
    };
  }
}
