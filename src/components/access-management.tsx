"use client";

import { permissionsForRole, type UserRole } from "@/domain/access-control";

type Props = {
  open: boolean;
  onClose: () => void;
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
};

export function AccessManagementDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <header className="modal-header">
          <div><span className="modal-kicker">TOEGANGSBEHEER</span><h2 id="access-title">Gebruikers en rollen</h2><p>Management bepaalt wie mag uitvoeren, plannen en goedkeuren.</p></div>
          <button className="close-button" onClick={onClose} aria-label="Sluiten">×</button>
        </header>
        <div className="modal-body access-body">
          <section className="access-users">
            <h3>Actieve gebruikers</h3>
            <div><span className="avatar">TB</span><p><strong>Tim Beek</strong><small>keyflow-beheerder@local.invalid</small></p><span className="role-badge management">Management</span></div>
            <div><span className="avatar employee">MW</span><p><strong>KeyFlow werknemer</strong><small>keyflow-werknemer@local.invalid</small></p><span className="role-badge">Werknemer</span></div>
          </section>
          <section>
            <h3>Rechtenmatrix</h3>
            <div className="permission-matrix">
              <div className="permission-head"><span>Recht</span><b>Werknemer</b><b>Management</b></div>
              {Object.entries(permissionLabels).map(([permission, label]) => (
                <div key={permission}>
                  <span>{label}</span>
                  <b className={hasPermission("employee", permission) ? "allowed" : "denied"}>{hasPermission("employee", permission) ? "✓" : "—"}</b>
                  <b className="allowed">✓</b>
                </div>
              ))}
            </div>
          </section>
          <div className="access-note"><strong>Productie-authenticatie nog aan te sluiten</strong><span>De rollen en servercontroles zijn aanwezig. Persoonlijke login via Microsoft/Google/SSO is een resterende productiefase.</span></div>
        </div>
        <footer className="modal-footer"><button className="primary-button" onClick={onClose}>Sluiten</button></footer>
      </section>
    </div>
  );
}

function hasPermission(role: UserRole, permission: string) {
  return permissionsForRole(role).includes(permission as ReturnType<typeof permissionsForRole>[number]);
}
