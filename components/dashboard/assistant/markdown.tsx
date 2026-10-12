import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The small Markdown subset Tilly writes: paragraphs, bullet and numbered
 * lists, **bold**, *italic*, `code` and links. Built from React elements, so
 * model output can never inject HTML.
 */
function inline(text: string, onNavigate?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (match.index! > last) out.push(text.slice(last, match.index));
    if (token.startsWith("**")) {
      out.push(<strong key={key++} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={key++} className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[12px]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const className = "font-medium text-tilly-700 underline decoration-tilly-200 underline-offset-2 hover:decoration-tilly-500 dark:text-tilly-400";
      out.push(
        href?.startsWith("/") ? (
          <Link key={key++} href={href} onClick={onNavigate} className={className}>{label}</Link>
        ) : href?.startsWith("https://") ? (
          <a key={key++} href={href} target="_blank" rel="noreferrer" className={className}>{label}</a>
        ) : (
          label
        )
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index! + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onNavigate, tail }: { text: string; onNavigate?: () => void; tail?: ReactNode }) {
  // Each block renders with an optional tail, so a typing caret sits at the very end.
  const blocks: ((tail?: ReactNode) => ReactNode)[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) {
        items.push(lines[i].replace(ordered ? numbered : bullet, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      const k = key++;
      blocks.push((end) => (
        <List key={k} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5 marker:text-tilly-400"}>
          {items.map((item, j) => (
            <li key={j}>
              {inline(item, onNavigate)}
              {j === items.length - 1 && end}
            </li>
          ))}
        </List>
      ));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
      para.push(lines[i].replace(/^#+\s*/, ""));
      i++;
    }
    const k = key++;
    const content = inline(para.join(" "), onNavigate);
    blocks.push((end) => (
      <p key={k}>
        {content}
        {end}
      </p>
    ));
  }

  return (
    <div className="space-y-2.5">
      {blocks.length === 0 ? tail : blocks.map((render, j) => render(j === blocks.length - 1 ? tail : undefined))}
    </div>
  );
}
