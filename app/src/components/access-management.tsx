"use client";

import { useEffect, useState } from "react";
import { permissionsForRole, type UserRole } from "@/domain/access-control";
import {
  createAccount,
  fetchAccessRole,
  removeAccount,
  resetAccountPin,
  KeyflowApiError,
  type PilotAccount,
} from "@/lib/keyflow-api";

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
};

const permissionLabels: Record<string, string> = {
  "dashboard.management": "Managementdashboard",
  "inventory.view": "Voorraad bekijken",
  "inventory.mutate": "Voorraad uitvoeren",
  "conversion.execute": "Conversies uitvoeren",
  "imports.manage": "Excel-import beheren",
  "planning.view": "Planning bekijken",
  "orders.approve": "Bestellingen goedkeuren",
  "models.manage": "Modellen beheren",
  "reports.view": "Rapportages bekijken",
  "users.manage": "Gebruikers beheren",
  "policies.manage": "Beleid beheren",
  "print.fulfil": "Printaanvragen afhandelen",
};

const roleLabels: Record<UserRole, string> = {
  management: "Management",
  employee: "Werkvloer",
  noviply: "Noviply",
};

export function AccessManagementDialog({ open, onClose, currentUserId }: Props) {
  const [accounts, setAccounts] = useState<PilotAccount[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"management" | "noviply">("management");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Een tijdelijke pincode is één keer te zien; daarna kent niemand hem meer. */
  const [freshPin, setFreshPin] = useState<{ name: string; pin: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const access = await fetchAccessRole();
        if (cancelled) return;
        setAccounts(access.accounts);
        setError("");
        // De vorige tijdelijke code hoort niet te blijven staan als het
        // venster opnieuw opengaat.
        setFreshPin(null);
      } catch {
        if (!cancelled) setError("De accounts konden niet worden opgehaald.");
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      const access = await fetchAccessRole();
      setAccounts(access.accounts);
    } catch (caught) {
      setError(caught instanceof KeyflowApiError ? caught.message : "Dat is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">TOEGANGSBEHEER</span>
            <h2 id="access-title">Wie mag waarbij</h2>
            <p>De werkvloer komt zonder pincode binnen. Management en Noviply niet.</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Sluiten">×</button>
        </header>

        <div className="modal-body access-body">
          <section className="access-users">
            <h3>Accounts met een pincode</h3>
            {accounts.map((account) => (
              <div key={account.id}>
                <span className={`avatar ${account.role === "noviply" ? "employee" : ""}`}>
                  {initialsFor(account.name)}
                </span>
                <p>
                  <strong>{account.name}</strong>
                  <small>{roleLabels[account.role]}</small>
                </p>
                <div className="account-actions">
                  <button
                    disabled={busy}
                    onClick={() => void run(async () => {
                      const { temporaryPin } = await resetAccountPin(account.id);
                      setFreshPin({ name: account.name, pin: temporaryPin });
                    })}
                  >
                    Nieuwe pincode
                  </button>
                  {account.id !== currentUserId && (
                    <button
                      className="danger-ghost-button"
                      disabled={busy}
                      onClick={() => void run(async () => { await removeAccount(account.id); })}
                    >
                      Toegang intrekken
                    </button>
                  )}
                </div>
              </div>
            ))}
            {accounts.length === 0 && <p className="unlock-empty">Nog geen accounts.</p>}

            <div className="account-new">
              <h4>Iemand toevoegen</h4>
              <div className="account-new-fields">
                <label>
                  <span className="sr-only">Naam</span>
                  <input
                    value={name}
                    placeholder="Naam"
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Rol</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as "management" | "noviply")}>
                    <option value="management">Management</option>
                    <option value="noviply">Noviply</option>
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={busy || name.trim().length < 2}
                  onClick={() => void run(async () => {
                    const created = await createAccount(name.trim(), role);
                    setFreshPin({ name: created.name, pin: created.temporaryPin });
                    setName("");
                  })}
                >
                  Toevoegen
                </button>
              </div>
              <p className="account-hint">
                De werkvloer heeft geen account nodig; die komt zonder pincode binnen.
              </p>
            </div>

            {freshPin && (
              <div className="fresh-pin" role="status">
                <strong>Tijdelijke pincode voor {freshPin.name}</strong>
                <b>{freshPin.pin}</b>
                <small>
                  Geef deze persoonlijk door. Bij de eerste aanmelding kiest {freshPin.name} zelf
                  een eigen pincode — daarna is deze code niets meer waard. Je ziet hem hierna
                  niet opnieuw.
                </small>
              </div>
            )}
            {error && <p className="form-error">{error}</p>}
          </section>

          <section>
            <h3>Rechtenmatrix</h3>
            <div className="permission-matrix">
              <div className="permission-head">
                <span>Recht</span><b>Werkvloer</b><b>Noviply</b><b>Management</b>
              </div>
              {Object.entries(permissionLabels).map(([permission, label]) => (
                <div key={permission} className="permission-row">
                  <span>{label}</span>
                  <b>{has("employee", permission) ? "✓" : "—"}</b>
                  <b>{has("noviply", permission) ? "✓" : "—"}</b>
                  <b>{has("management", permission) ? "✓" : "—"}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function has(role: UserRole, permission: string) {
  return (permissionsForRole(role) as string[]).includes(permission);
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
