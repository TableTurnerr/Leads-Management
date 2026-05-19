import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    // Tree-shake icon and ui packages so dev builds don't compile thousands
    // of unused exports from lucide-react / @base-ui/react.
    optimizePackageImports: ["lucide-react", "@base-ui/react"],
  },
};

export default nextConfig;
