import type { WorkOrderSnapshot } from "@/domain/order-lookup";

export const demoWorkOrders: WorkOrderSnapshot[] = [
  {
    reference: "ORD-260727-1859",
    aliases: ["ORD-1859", "1859"],
    model: "Dell Latitude 5420",
    saleValueBandId: "200_299",
    currentLayout: "QWERTY SE/FI",
    targetLayout: "QWERTY US",
    status: "ready",
  },
  {
    reference: "ORD-260727-1861",
    aliases: ["ORD-1861", "1861"],
    model: "HP EliteBook 850 G7",
    saleValueBandId: "400_499",
    currentLayout: "AZERTY FR",
    targetLayout: "QWERTY US",
    status: "ready",
  },
  {
    reference: "ORD-260727-1864",
    aliases: ["ORD-1864", "1864"],
    model: "HP ZBook 15 G3",
    saleValueBandId: "200_299",
    currentLayout: "QWERTY US",
    targetLayout: "QWERTZ DE",
    status: "ready",
  },
  {
    reference: "ORD-260727-1872",
    aliases: ["ORD-1872", "1872"],
    model: "Fujitsu Lifebook U7410",
    saleValueBandId: "300_399",
    currentLayout: "QWERTY US",
    targetLayout: "AZERTY FR",
    status: "hold",
    note: "Wacht op voorraadcontrole.",
  },
];
