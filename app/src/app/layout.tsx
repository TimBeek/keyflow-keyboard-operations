import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Naast robots.txt: sommige crawlers volgen alleen deze. Een intern
  // werkscherm hoort nergens in zoekresultaten te staan.
  robots: { index: false, follow: false, nocache: true },
  title: "ReKey | Keyboard Operations",
  description: "Voorraad- en conversiebeheer voor keyboard layouts",
};

/**
 * De themakeuze moet staan vóór de eerste tekening, anders ziet iemand die
 * licht heeft gekozen eerst een donker scherm opflitsen. Daarom hier en niet
 * in een effect: dit loopt voordat de browser iets op het scherm zet.
 *
 * Zonder keuze volgen we de instelling van het apparaat.
 */
const themeScript = `
try {
  var keuze = localStorage.getItem("keyflow.theme");
  if (keuze !== "light" && keuze !== "dark") {
    keuze = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", keuze);
} catch (e) {
  document.documentElement.setAttribute("data-theme", "dark");
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
