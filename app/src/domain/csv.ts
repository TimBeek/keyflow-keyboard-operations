/**
 * Excel op een Nederlandse installatie leest een komma niet als kolomscheiding
 * maar als decimaalteken. Vandaar de puntkomma, en een BOM zodat accenten en
 * het euroteken niet als vraagtekens binnenkomen.
 */

export type CsvValue = string | number;

export function csvCell(value: CsvValue) {
  /*
   * Een kommagetal ook met een komma. Diezelfde Nederlandse installatie leest
   * "3.3" niet als drieënhalf maar als tekst, en soms zelfs als datum. Tot nu
   * toe stonden er alleen hele getallen in de exports; met verbruik per week en
   * dekking in weken erbij kan dat niet meer blijven.
   */
  if (typeof value === "number") return String(value).replace(".", ",");
  // Een cel die met = + - @ begint voert Excel uit als formule. Dat mag nooit
  // gebeuren met tekst die uit een import of uit een invoerveld komt.
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function toCsv(headers: readonly string[], rows: CsvValue[][]) {
  return `﻿${[headers, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n")}\r\n`;
}
