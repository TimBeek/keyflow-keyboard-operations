/**
 * In pilotmodus is er nog geen persoonlijke login, maar de database wil wel
 * weten wie er handelt — en de rechten hangen eraan. Elke rol krijgt daarom een
 * vast account. Dat is eerlijk over wat het is: niet "Tim deed dit", maar "de
 * werkvloer deed dit". Zodra de Microsoft-login aan staat, komt de echte
 * gebruiker hiervoor in de plaats.
 */

import type { UserRole } from "./access-control";

export const pilotActorIds: Record<UserRole, string> = {
  management: "00000000-0000-0000-0000-000000000001",
  employee: "00000000-0000-0000-0000-000000000002",
  noviply: "00000000-0000-0000-0000-000000000003",
};

export function pilotActorFor(role: UserRole) {
  return pilotActorIds[role];
}
