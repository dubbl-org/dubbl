import { getLLMText, source } from "@/lib/source";

export const revalidate = false;

// Every docs page in one Markdown file, for AI tools.
export async function GET() {
  const pages = await Promise.all(source.getPages().map(getLLMText));
  return new Response(pages.join("\n\n---\n\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
