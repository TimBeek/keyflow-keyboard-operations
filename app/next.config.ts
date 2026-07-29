import type { NextConfig } from "next";

// GitHub Pages serveert een projectsite onder /<repo>/ in plaats van onder de root.
// KEYFLOW_BASE_PATH zet dat voorvoegsel; zonder de variabele blijft de build
// exact zoals hij was voor localhost en de Sites-preview.
const rawBasePath = process.env.KEYFLOW_BASE_PATH?.trim() ?? "";
const basePath = rawBasePath.replace(/\/+$/, "");

if (basePath && !basePath.startsWith("/")) {
  throw new Error("KEYFLOW_BASE_PATH moet met een schuine streep beginnen, bijvoorbeeld /keyflow.");
}

const nextConfig: NextConfig = {
  output: "standalone",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // Gewone <img>-tags krijgen het basispad niet automatisch mee. Componenten
  // die een bestand uit /public tonen plakken dit er zelf voor.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: {
    // De private Sites-preview heeft geen dynamische /_next/image-optimizer.
    // Public-assets moeten daar rechtstreeks als bestanden worden geladen.
    unoptimized: true,
  },
};

export default nextConfig;
