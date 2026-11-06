import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPageMarkdownUrl, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import { CopyMarkdown, OpenIn } from "@/components/docs/page-actions";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  // The docs open on the guides.
  if (!params.slug?.length) redirect("/docs/guides");
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page);

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="dd-description mb-1">{page.data.description}</DocsDescription>
      <div className="dd-actions flex flex-row items-center gap-2 pb-4">
        <CopyMarkdown markdownUrl={markdownUrl} />
        <OpenIn markdownUrl={markdownUrl} githubUrl={`https://github.com/dubbl-org/dubbl/blob/master/content/docs/${page.path}`} />
      </div>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) return { title: "dubbl Docs" };
  return {
    title: `${page.data.title} · dubbl Docs`,
    description: page.data.description,
  };
}
