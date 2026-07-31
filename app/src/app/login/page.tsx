"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="identity-page">
      <section className="identity-card">
        <div className="brand-mark">K</div>
        <span>KEYFLOW · MICROSOFT ENTRA ID</span>
        <h1>Persoonlijk aanmelden</h1>
        <p>Je Microsoft-app-rol bepaalt automatisch welke ReKey-werkruimte je krijgt.</p>
        <button
          type="button"
          onClick={() => void signIn("microsoft-entra-id", { callbackUrl: "/" })}
        >
          Aanmelden met Microsoft
        </button>
        <small>Werknemers kunnen uitvoeren en voorraad boeken. Management krijgt daarnaast planning, analyses, beleid en gebruikersbeheer.</small>
      </section>
    </main>
  );
}
