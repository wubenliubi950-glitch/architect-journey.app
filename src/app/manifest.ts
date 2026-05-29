import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "建築巡り | Architect Journey",
    short_name: "建築巡り",
    description: "建築巡りのための旅程・予算プランナー",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#1f2937",
    lang: "ja",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
