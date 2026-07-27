import type { SaleValueBandId } from "@/domain/order-entry";

export type WorkOrderSnapshot = {
  reference: string;
  aliases: string[];
  model: string;
  saleValueBandId: SaleValueBandId;
  currentLayout: string;
  targetLayout: string;
  status: "ready" | "hold";
  note?: string;
};

export type OrderLookupResult =
  | { status: "found"; order: WorkOrderSnapshot; scannedValue: string }
  | { status: "not_found"; scannedValue: string }
  | { status: "invalid"; scannedValue: string };

export function lookupWorkOrder(
  rawValue: string,
  orders: WorkOrderSnapshot[],
): OrderLookupResult {
  const scannedValue = rawValue.trim();
  const lookupKey = normalizeOrderKey(scannedValue);
  if (lookupKey.length < 4) return { status: "invalid", scannedValue };

  const candidates = orders
    .map((order) => ({
      order,
      keys: [order.reference, ...order.aliases]
        .map(normalizeOrderKey)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length),
    }))
    .sort((a, b) => b.order.reference.length - a.order.reference.length);

  const match = candidates.find(({ keys }) =>
    keys.some((key) => lookupKey === key || lookupKey.endsWith(key)),
  );

  return match
    ? { status: "found", order: match.order, scannedValue }
    : { status: "not_found", scannedValue };
}

export function normalizeOrderKey(value: string) {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the scanner value unchanged when it is not valid URI text.
  }
  return decoded.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
