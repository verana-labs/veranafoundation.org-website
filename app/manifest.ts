import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/app/lib/site";

// Web app manifest — lets the site be installed/added to the home screen and
// gives Android/Chrome a name, theme color and icons. theme_color is Verana
// purple (--color-purple); background_color is the light surface token.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Verana",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fafafb",
    theme_color: "#763ef0",
    icons: [
      {
        src: "/assets/img/favicon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
      {
        src: "/assets/img/foundation-logo.png",
        type: "image/png",
        sizes: "513x494",
        purpose: "any",
      },
    ],
  };
}
