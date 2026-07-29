import type { MetadataRoute } from "next";

/**
 * KeyFlow is een intern werkscherm, geen website. De werkvloer komt binnen
 * zonder login, dus de onbekendheid van het adres is de enige drempel — en die
 * vervalt zodra een zoekmachine de pagina indexeert.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
