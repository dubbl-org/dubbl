"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownHint({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)}>
      Markdown supported: <strong>**bold**</strong>, <em>*italic*</em>, lists, links, code
    </p>
  );
}

/**
 * Renders user-authored markdown as React elements. Raw HTML in the source is
 * dropped (react-markdown default) — this is user content, so it must never
 * inject markup. If embedded HTML is ever needed, it requires a sanitization
 * pass (rehype-raw + rehype-sanitize), not a flag here.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
          a: (props) => (
            <a
              className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: (props) => <ul className="my-2 list-disc pl-5 space-y-1" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal pl-5 space-y-1" {...props} />,
          li: (props) => <li className="marker:text-muted-foreground" {...props} />,
          strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          del: (props) => <del className="line-through opacity-75" {...props} />,
          h1: (props) => <h1 className="mt-3 mb-1 text-base font-bold first:mt-0" {...props} />,
          h2: (props) => <h2 className="mt-3 mb-1 text-sm font-bold first:mt-0" {...props} />,
          h3: (props) => <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
              {...props}
            />
          ),
          hr: () => <hr className="my-3 border-border" />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            return isBlock ? (
              <code
                className="block my-2 overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-xs"
                {...rest}
              >
                {children}
              </code>
            ) : (
              <code
                className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em]"
                {...rest}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: (props) => (
            <div className="my-2 overflow-x-auto rounded-md border">
              <table className="w-full text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b bg-muted/50 px-2.5 py-1.5 text-left font-semibold"
              {...props}
            />
          ),
          td: (props) => <td className="border-b px-2.5 py-1.5 align-top" {...props} />,
          input: (props) => (
            <input
              className="mr-1.5 align-middle accent-emerald-600"
              disabled
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
