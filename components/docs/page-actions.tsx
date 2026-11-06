"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "fumadocs-ui/components/ui/popover";

const cache = new Map<string, string>();

/** Copies the page as Markdown, ready to paste into an AI chat. */
export function CopyMarkdown({ markdownUrl }: { markdownUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [checked, onClick] = useCopyButton(async () => {
    const cached = cache.get(markdownUrl);
    if (cached) return navigator.clipboard.writeText(cached);
    setLoading(true);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": fetch(markdownUrl).then(async (res) => {
            const text = await res.text();
            cache.set(markdownUrl, text);
            return text;
          }),
        }),
      ]);
    } finally {
      setLoading(false);
    }
  });

  return (
    <button type="button" disabled={loading} onClick={onClick} className="inline-flex items-center gap-2 [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
      {checked ? <Check /> : <Copy />}
      Copy Markdown
    </button>
  );
}

/** Opens the page in GitHub or an AI chat that reads it first. */
export function OpenIn({ markdownUrl, githubUrl }: { markdownUrl: string; githubUrl: string }) {
  const absolute = typeof window === "undefined" ? markdownUrl : new URL(markdownUrl, window.location.origin).toString();
  const q = `Read ${absolute}, I want to ask questions about it.`;
  const items = [
    { title: "View source on GitHub", href: githubUrl },
    { title: "Open in ChatGPT", href: `https://chatgpt.com/?${new URLSearchParams({ hints: "search", q })}` },
    { title: "Open in Claude", href: `https://claude.ai/new?${new URLSearchParams({ q })}` },
    { title: "View as Markdown", href: markdownUrl },
  ];
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1.5">
        Open
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-56 flex-col p-1">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground transition-colors hover:bg-accent"
          >
            {item.title}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
