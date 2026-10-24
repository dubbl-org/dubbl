import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Every route is dynamic (the session cookie), so the router caches nothing
    // and every revisit pays a full server render over the tunnel. Fifteen
    // seconds keeps a screen you just looked at instant without showing
    // yesterday's ledger; anything that mutates refetches through its own
    // loader, and back/forward revalidates explicitly.
    staleTimes: { dynamic: 15, static: 180 },
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
