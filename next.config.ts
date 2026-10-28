import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
};

const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(withMDX(nextConfig));
