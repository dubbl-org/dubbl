import { notFound } from "next/navigation";
import { getLLMText, source } from "@/lib/source";

export const revalidate = false;

// A docs page as plain Markdown: `/docs-md/guides/invoices.md`.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugs = [...slug];
  slugs[slugs.length - 1] = slugs[slugs.length - 1].replace(/\.md$/, "");
  const page = source.getPage(slugs[0] === "index" && slugs.length === 1 ? [] : slugs);
  if (!page) notFound();
  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.generateParams().map(({ slug }) => {
    const slugs = slug && slug.length > 0 ? [...slug] : ["index"];
    slugs[slugs.length - 1] = `${slugs[slugs.length - 1]}.md`;
    return { slug: slugs };
  });
}
