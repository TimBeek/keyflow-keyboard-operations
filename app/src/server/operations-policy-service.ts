import "server-only";
import { z } from "zod";
import type { OperationsPolicy } from "@/domain/operations";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

/**
 * Het conversiebeleid geldt voor iedereen tegelijk: de drempel waarboven een
 * toetsenbordsprint wordt geadviseerd, welke methoden aan staan, wat een
 * medewerker zelf mag boeken. Zolang dat per browser stond, kon Wout een grens
 * verzetten zonder dat de werkvloer er iets van merkte.
 */

const policySchema = z.object({
  thresholdEur: z.number().positive().max(100_000),
  workload: z.enum(["normal", "busy", "critical"]),
  methodEnabled: z.object({
    loose_stickers: z.boolean(),
    noviply_sheet: z.boolean(),
    printed_sticker: z.boolean(),
    direct_reprint: z.boolean(),
  }),
  employeeCanReceive: z.boolean(),
  employeeCanBookMismatch: z.boolean(),
  abcAThreshold: z.number().int().min(1).max(98),
  abcBThreshold: z.number().int().min(2).max(99),
}).refine((policy) => policy.abcAThreshold < policy.abcBThreshold, {
  message: "De ABC A-grens moet lager liggen dan de B-grens.",
});

const updateSchema = z.object({
  policy: policySchema,
  /**
   * De layouts die de toetsenbordsprinter aankan. Leeg betekent "nog niet
   * ingevuld": dan blijft alles mogelijk in plaats van alles geblokkeerd.
   */
  directPrintLayouts: z.array(z.string().min(2).max(40)).max(60).default([]),
  /** De versie die de gebruiker zag toen hij begon te wijzigen. */
  expectedVersion: z.number().int().nonnegative(),
  actorId: databaseUuidSchema,
});

export type UpdateOperationsPolicyInput = z.input<typeof updateSchema>;

export class OperationsPolicyConflictError extends Error {
  constructor(readonly current: OperationsPolicy, readonly version: number) {
    super("Iemand anders heeft het beleid ondertussen aangepast.");
    this.name = "OperationsPolicyConflictError";
  }
}

type PolicyRow = {
  threshold_eur: string;
  workload: "normal" | "busy" | "critical";
  method_enabled: Record<string, boolean>;
  employee_permissions: Record<string, boolean>;
  abc_a_threshold: number;
  abc_b_threshold: number;
  direct_print_layouts: string[];
  version: number;
};

function toPolicy(row: PolicyRow): OperationsPolicy {
  return {
    thresholdEur: Number(row.threshold_eur),
    workload: row.workload,
    methodEnabled: {
      loose_stickers: Boolean(row.method_enabled.loose_stickers),
      noviply_sheet: Boolean(row.method_enabled.noviply_sheet),
      printed_sticker: Boolean(row.method_enabled.printed_sticker),
      direct_reprint: Boolean(row.method_enabled.direct_reprint),
    },
    employeeCanReceive: Boolean(row.employee_permissions.employee_can_receive),
    employeeCanBookMismatch: Boolean(row.employee_permissions.employee_can_book_mismatch),
    abcAThreshold: row.abc_a_threshold,
    abcBThreshold: row.abc_b_threshold,
  };
}

export async function readOperationsPolicy() {
  const sql = database();
  const [row] = await sql<PolicyRow[]>`
    select threshold_eur, workload, method_enabled, employee_permissions,
           abc_a_threshold, abc_b_threshold, direct_print_layouts, version
    from operations_settings
    where setting_key = 'active'
  `;
  if (!row) return null;
  return {
    policy: toPolicy(row),
    directPrintLayouts: row.direct_print_layouts ?? [],
    version: row.version,
  };
}

export async function updateOperationsPolicy(rawInput: UpdateOperationsPolicyInput) {
  const input = updateSchema.parse(rawInput);
  await requirePermission(input.actorId, "policies.manage");
  const sql = database();

  return sql.begin(async (transaction) => {
    const [current] = await transaction<PolicyRow[]>`
      select threshold_eur, workload, method_enabled, employee_permissions,
             abc_a_threshold, abc_b_threshold, direct_print_layouts, version
      from operations_settings
      where setting_key = 'active'
      for update
    `;
    if (!current) {
      throw new Error("Er is nog geen actief beleid ingericht.");
    }
    // Twee beheerders die tegelijk iets verzetten: de tweede overschrijft de
    // eerste niet stilzwijgend, maar krijgt te zien wat er nu staat.
    if (current.version !== input.expectedVersion) {
      throw new OperationsPolicyConflictError(toPolicy(current), current.version);
    }

    const [updated] = await transaction<PolicyRow[]>`
      update operations_settings
      set threshold_eur = ${input.policy.thresholdEur},
          workload = ${input.policy.workload},
          method_enabled = ${transaction.json(input.policy.methodEnabled)},
          employee_permissions = ${transaction.json({
            employee_can_receive: input.policy.employeeCanReceive,
            employee_can_book_mismatch: input.policy.employeeCanBookMismatch,
          })},
          abc_a_threshold = ${input.policy.abcAThreshold},
          abc_b_threshold = ${input.policy.abcBThreshold},
          direct_print_layouts = ${transaction.json([...new Set(input.directPrintLayouts)])},
          version = version + 1,
          updated_by = ${input.actorId},
          updated_at = now()
      where setting_key = 'active'
      returning threshold_eur, workload, method_enabled, employee_permissions,
                abc_a_threshold, abc_b_threshold, direct_print_layouts, version
    `;
    return {
      policy: toPolicy(updated),
      directPrintLayouts: updated.direct_print_layouts ?? [],
      version: updated.version,
    };
  });
}
