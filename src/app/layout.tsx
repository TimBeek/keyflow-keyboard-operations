import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
