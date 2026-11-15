import type { MetadataRoute } from "next";

/** Makes USCLive installable: Add to Home Screen opens it full-screen with its own icon, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "USCLive",
    short_name: "USCLive",
    description: "What's happening at USC, live on a 3D map.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f7",
    theme_color: "#990000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
