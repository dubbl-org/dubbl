import { source } from "@/lib/source";

export const revalidate = false;

// An index of the docs for AI tools (llmstxt.org).
export function GET() {
  const lines = ["# dubbl documentation", "", "> Open-source double-entry accounting, invoicing, payroll, inventory and more.", ""];
  for (const page of source.getPages()) {
    const slugs = page.slugs.length > 0 ? page.slugs : ["index"];
    lines.push(`- [${page.data.title}](/docs-md/${slugs.join("/")}.md): ${page.data.description ?? ""}`);
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
