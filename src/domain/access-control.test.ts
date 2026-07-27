import { describe, expect, it } from "vitest";
import { can, permissionsForRole } from "./access-control";

describe("role based access", () => {
  it("geeft management toegang tot planning en gebruikersbeheer", () => {
    expect(can("management", "planning.view")).toBe(true);
    expect(can("management", "users.manage")).toBe(true);
  });

  it("beperkt werknemers tot dagelijkse uitvoering", () => {
    expect(can("employee", "inventory.mutate")).toBe(true);
    expect(can("employee", "conversion.execute")).toBe(true);
    expect(can("employee", "orders.approve")).toBe(false);
    expect(can("employee", "reports.view")).toBe(false);
  });

  it("houdt de werknemersrechten compact", () => {
    expect(permissionsForRole("employee")).toHaveLength(3);
  });
});
