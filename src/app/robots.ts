import type { MetadataRoute } from "next";

// Public landing page only; everything behind sign-in and the API stays out of search.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/invite"] }],
  };
}
