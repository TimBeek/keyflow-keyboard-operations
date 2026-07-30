import { reportPeriods } from "./reporting";
import { usageWindowWeeks } from "./resupply";

/**
 * Hoe ver terug de gedeelde toestand boekingen meestuurt.
 *
 * Er stond een venster van 190 dagen én een rijlimiet van vijfduizend. Dat
 * venster is een keuze; die limiet was er een die niemand had gemaakt: zodra er
 * binnen het venster meer dan vijfduizend boekingen stonden, verdwenen de
 * oudste uit elke berekening zonder dat er iets van te zien was. Bij een paar
 * tientallen conversies per dag zit je daar binnen een half jaar aan.
 *
 * De limiet is eruit. Het venster blijft, en wordt hier uitgerekend uit wat de
 * app werkelijk nodig heeft in plaats van uit een rond getal — zodat een langere
 * rapportageperiode het venster niet stilzwijgend kan ontgroeien.
 */

/** De langste periode die een rapport toont. */
export function longestReportDays() {
  return Math.max(...reportPeriods.map((period) => period.days));
}

/**
 * Een rapport vergelijkt een periode met de periode ervoor, dus er is twee keer
 * de langste periode nodig. Het bijbestelvenster past daar ruim binnen, maar
 * wordt meegewogen zodat het meeschuift als iemand dat verruimt.
 */
export function requiredHistoryDays() {
  return Math.max(longestReportDays() * 2, usageWindowWeeks * 7);
}

/**
 * Wat er werkelijk wordt meegestuurd: het benodigde venster plus een marge, zodat
 * een rapport dat tot de rand van de periode kijkt niet net buiten de boot valt.
 */
export const sharedTransactionDays = requiredHistoryDays() + 14;
