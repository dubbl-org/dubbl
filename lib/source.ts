import { docs } from "fumadocs-mdx:collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  // Frontmatter `icon: Receipt` (any lucide icon name) shows beside the page in the sidebar.
  icon(name) {
    if (name && name in icons) return createElement(icons[name as keyof typeof icons]);
  },
});

export type DocsPage = InferPageType<typeof source>;

/** The page as Markdown, served from `/docs-md/...` for "Copy Markdown" and AI tools. */
export function getPageMarkdownUrl(page: DocsPage) {
  const slugs = page.slugs.length > 0 ? page.slugs : ["index"];
  return `/docs-md/${slugs.join("/")}.md`;
}

export async function getLLMText(page: DocsPage) {
  const processed = await page.data.getText("processed");
  return `# ${page.data.title}\n\n${page.data.description ?? ""}\n\n${processed}`;
}
