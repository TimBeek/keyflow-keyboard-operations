/**
 * Een seintje van de werkvloer naar Noviply dat er te veel blijft liggen.
 * Zie print-reminder-service voor waarom dit los staat van de aanvraag zelf.
 */
export type PrintReminderRecord = {
  id: string;
  sentAt: string;
  sentBy: string;
  openCount: number;
  acknowledgedAt: string | null;
};

/** De melding die nog niet is gezien, of null. */
export function openReminder(reminders: PrintReminderRecord[]) {
  return reminders.find((reminder) => !reminder.acknowledgedAt) ?? null;
}
