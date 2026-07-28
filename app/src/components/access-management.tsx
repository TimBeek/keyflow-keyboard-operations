"use client";

import { permissionsForRole, type UserRole } from "@/domain/access-control";
import type { KeyFlowIdentity } from "@/domain/identity";

type Props = {
  open: boolean;
  onClose: () => void;
  identity: KeyFlowIdentity;
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

export function AccessManagementDialog({ open, onClose, identity }: Props) {
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
            {identity.mode === "entra" ? (
              <div>
                <span className={`avatar ${identity.role === "employee" ? "employee" : ""}`}>{initialsFor(identity.displayName)}</span>
                <p><strong>{identity.displayName}</strong><small>{identity.email}</small></p>
                <span className={`role-badge ${identity.role === "management" ? "management" : ""}`}>{identity.role === "management" ? "Management" : "Werknemer"}</span>
              </div>
            ) : (
              <>
                <div><span className="avatar">TB</span><p><strong>Tim Beek</strong><small>keyflow-beheerder@local.invalid</small></p><span className="role-badge management">Management</span></div>
                <div><span className="avatar employee">MW</span><p><strong>KeyFlow werknemer</strong><small>keyflow-werknemer@local.invalid</small></p><span className="role-badge">Werknemer</span></div>
              </>
            )}
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
          <div className="access-note">
            <strong>{identity.mode === "entra" ? "Microsoft Entra ID actief" : "Entra-login technisch voorbereid"}</strong>
            <span>{identity.mode === "entra"
              ? "De persoonlijke app-rol uit Microsoft bepaalt de werkruimte; handmatig wisselen is uitgeschakeld."
              : "De pilot gebruikt nog lokale demorollen. Vul de Entra-appregistratie, app-rollen en productieomgeving in om persoonlijke toegang te activeren."}</span>
          </div>
        </div>
        <footer className="modal-footer"><button className="primary-button" onClick={onClose}>Sluiten</button></footer>
      </section>
    </div>
  );
}

function hasPermission(role: UserRole, permission: string) {
  return permissionsForRole(role).includes(permission as ReturnType<typeof permissionsForRole>[number]);
}

function initialsFor(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KF";
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}
