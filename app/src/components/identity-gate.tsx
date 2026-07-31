"use client";

import {
  SessionProvider,
  signIn,
  signOut,
  useSession,
} from "next-auth/react";
import { Dashboard } from "@/components/dashboard";
import type { IdentityMode, ReKeyIdentity } from "@/domain/identity";

const pilotIdentity: ReKeyIdentity = {
  externalId: "keyflow-local-operator",
  tenantId: "pilot",
  objectId: "pilot-management",
  displayName: "Tim Beek",
  email: "keyflow-beheerder@local.invalid",
  role: "management",
  mode: "pilot",
};

export function IdentityGate({ mode }: { mode: IdentityMode }) {
  if (mode === "pilot") {
    return <Dashboard identity={pilotIdentity} />;
  }

  return (
    <SessionProvider>
      <EntraIdentityGate />
    </SessionProvider>
  );
}

function EntraIdentityGate() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <IdentityStatus title="Persoonlijke toegang controleren…" detail="ReKey valideert je beveiligde Microsoft-sessie." />;
  }

  if (!session?.user) {
    return (
      <IdentityStatus
        title="Meld je aan bij ReKey"
        detail="Gebruik je persoonlijke Microsoft-werkaccount. Je toegewezen app-rol bepaalt automatisch of je werknemer of management bent."
        actionLabel="Aanmelden met Microsoft"
        onAction={() => void signIn("microsoft-entra-id", { callbackUrl: "/" })}
      />
    );
  }

  const identity: ReKeyIdentity = {
    externalId: session.user.externalId,
    tenantId: session.user.tenantId,
    objectId: session.user.id,
    displayName: session.user.name ?? session.user.email ?? "ReKey-gebruiker",
    email: session.user.email ?? "",
    role: session.user.role,
    mode: "entra",
  };

  return (
    <Dashboard
      identity={identity}
      onSignOut={() => void signOut({ redirectTo: "/login" })}
    />
  );
}

function IdentityStatus({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="identity-page">
      <section className="identity-card">
        <div className="brand-mark">K</div>
        <span>KEYFLOW · PERSOONLIJKE TOEGANG</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        {actionLabel && onAction && (
          <button type="button" onClick={onAction}>{actionLabel}</button>
        )}
        <small>Toegang wordt geweigerd zonder KeyFlow.Employee- of KeyFlow.Management-app-rol.</small>
      </section>
    </main>
  );
}
