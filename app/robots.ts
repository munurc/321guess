import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://321guess.com/sitemap.xml",
    host: "https://321guess.com",
  };
}
