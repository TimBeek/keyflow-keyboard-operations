import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Naast robots.txt: sommige crawlers volgen alleen deze. Een intern
  // werkscherm hoort nergens in zoekresultaten te staan.
  robots: { index: false, follow: false, nocache: true },
  title: "KeyFlow | Keyboard Operations",
  description: "Voorraad- en conversiebeheer voor keyboard layouts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
