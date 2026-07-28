import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // De private Sites-preview heeft geen dynamische /_next/image-optimizer.
    // Public-assets moeten daar rechtstreeks als bestanden worden geladen.
    unoptimized: true,
  },
};

export default nextConfig;
