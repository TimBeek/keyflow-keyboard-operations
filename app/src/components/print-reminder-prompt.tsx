"use client";

import { useState } from "react";
import type { PrintReminderRecord } from "@/domain/print-reminder";

/**
 * De werkvloer laat weten dat er te veel blijft liggen. Dit onderbreekt Noviply
 * bewust: een lijstje dat langzaam groeit valt niet op, een pop-up wel.
 */
export function PrintReminderPrompt({
  reminder,
  onSeen,
}: {
  reminder: PrintReminderRecord;
  onSeen: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Message from the floor">
      <div className="printer-check">
        <span className="printer-check-kicker">MESSAGE FROM THE FLOOR</span>
        <h2>
          {reminder.openCount === 1
            ? "1 sticker is waiting"
            : `${reminder.openCount} stickers are waiting`}
        </h2>
        <p>
          {reminder.sentBy} let you know the request list has been sitting for a while.
          They are holding laptops aside until these are printed.
        </p>
        <div className="printer-check-actions">
          <button
            className="printer-check-yes"
            disabled={busy}
            onClick={() => { setBusy(true); void onSeen().finally(() => setBusy(false)); }}
          >
            <b>✓</b> Got it
          </button>
        </div>
      </div>
    </div>
  );
}
