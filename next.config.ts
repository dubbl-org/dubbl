import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import { docsRedirects } from "./lib/docs-redirects";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return docsRedirects;
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
