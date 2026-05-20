import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {
    root: import.meta.dirname,
    resolveAlias: {
      // plotly.js's registry.js does `require('maplibre-gl/dist/maplibre-gl.css')`
      // at runtime, which Turbopack can't satisfy (CSS modules have no JS factory).
      // Route that JS-side require to a noop; the real CSS is loaded via globals.css.
      "maplibre-gl/dist/maplibre-gl.css": "./src/lib/noop.js",
    },
  },
  experimental: {
    // Tree-shake icon and ui packages so dev builds don't compile thousands
    // of unused exports from lucide-react / @base-ui/react.
    optimizePackageImports: ["lucide-react", "@base-ui/react"],
  },
};

export default nextConfig;
