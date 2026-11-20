import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cups",
    short_name: "Cups",
    description: "Cafe schedules, events, invoices and costs",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6f1",
    theme_color: "#6e4524",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
