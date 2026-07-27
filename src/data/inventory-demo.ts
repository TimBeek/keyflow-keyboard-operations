export type InventoryCatalogItem = {
  model: string;
  sku: string;
  layout: "QWERTY US" | "AZERTY FR" | "QWERTZ DE";
  stock: number;
  reserved: number;
  averageWeeklyDemand: number;
  leadTimeDays: number;
  safetyStockWeeks: number;
  location: "Stickerafdeling" | "Kantoorvoorraad";
  supplier: "Noviply";
  unitCost: number;
  compatibleModels: number;
};

export const inventoryCatalog: InventoryCatalogItem[] = [
  item("Dell Latitude 7400", "NB10052E1NL", "QWERTY US", 15, 2, 4.5, 7),
  item("HP ProBook 640 G5", "NB10056E1NL", "QWERTY US", 32, 4, 3.2, 6),
  item("Dell Latitude 7490", "NB10057E1NL", "QWERTY US", 18, 1, 2.8, 5),
  item("Dell Latitude 5300", "NB10058E1NL", "QWERTY US", 23, 3, 5.5, 8),
  item("HP EliteBook 735 G5", "NB10059E1NL", "QWERTY US", 10, 1, 4.2, 4),
  item("Dell Latitude 7300", "NB10060E1NL", "QWERTY US", 30, 3, 6.5, 7),
  item("HP EliteBook x360 1040 G8", "NB10061E1NL", "QWERTY US", 26, 2, 1.5, 3),
  item("Dell Latitude 5420", "NB10172E1FR", "AZERTY FR", 64, 4, 2.1, 6),
  item("Dell Latitude 5420", "NB10172E1NL", "QWERTY US", 25, 2, 4.3, 7),
  item("Fujitsu Lifebook E548", "NB10063E1NL", "QWERTY US", 30, 1, 0, 2),
  item("HP EliteBook 850 G7", "NB10064E1NL", "QWERTY US", 18, 2, 4.8, 5),
  item("HP ZBook Fury 15 G7", "NB10065E1NL", "QWERTY US", 19, 1, 2.7, 4),
  item("Lenovo ThinkPad A285", "NB10066E1NL", "QWERTY US", 23, 2, 1.8, 5),
  item("Dell Latitude 3510", "NB10067E1NL", "QWERTY US", 10, 0, 3.5, 4),
  item("Dell Precision 7510", "NB10068E1NL", "QWERTY US", 13, 2, 2.9, 3),
  item("Lenovo V330-14IKB", "NB10069E1NL", "QWERTY US", 27, 1, 1.2, 2),
  item("Fujitsu Lifebook U728", "NB10070E1NL", "QWERTY US", 15, 1, 3.8, 6),
  item("Fujitsu Lifebook U729", "NB10072E1NL", "QWERTY US", 30, 2, 2.4, 5),
  item("HP ProBook 430 G5", "NB10074E1NL", "QWERTY US", 13, 2, 4.1, 4),
  item("HP ProBook 440 G6", "NB10075E1NL", "QWERTY US", 10, 1, 3.6, 5),
  item("HP EliteBook 830 G7", "NB10076E1NL", "QWERTY US", 25, 2, 4.9, 6),
  item("HP ZBook 15 G3", "NB10043E1FR", "AZERTY FR", 31, 3, 1.7, 8),
  item("HP ZBook 15 G3", "NB10043E1DE", "QWERTZ DE", 4, 0, 2.6, 8),
  item("Fujitsu Lifebook U7410", "NB10210E1NL", "QWERTY US", 0, 0, 3.4, 4),
  item("HP 240 G8", "NB10200E2NL", "QWERTY US", 2, 0, 2.2, 3),
];

function item(
  model: string,
  sku: string,
  layout: InventoryCatalogItem["layout"],
  stock: number,
  reserved: number,
  averageWeeklyDemand: number,
  compatibleModels: number,
): InventoryCatalogItem {
  return {
    model,
    sku,
    layout,
    stock,
    reserved,
    averageWeeklyDemand,
    leadTimeDays: layout === "QWERTY US" ? 14 : 21,
    safetyStockWeeks: layout === "QWERTY US" ? 2 : 3,
    location: stock % 3 === 0 ? "Kantoorvoorraad" : "Stickerafdeling",
    supplier: "Noviply",
    unitCost: layout === "QWERTY US" ? 2.35 : 2.85,
    compatibleModels,
  };
}
