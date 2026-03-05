import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  output: "standalone",
};

const withMDX = createMDX();

export default withMDX(nextConfig);
