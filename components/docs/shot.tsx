import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import { cn } from "@/lib/utils";
import manifest from "./shots.json";

interface Mark {
  /** Position and size on the image, in percent. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
interface ShotMeta {
  width: number;
  height: number;
  marks?: Mark[];
}
const shots = manifest as Record<string, ShotMeta>;

/**
 * A screenshot of the app, taken from the demo company by `scripts/docs-shots.mjs`.
 * `pins` numbers the areas the shot's spec marked and lists them under the image.
 * `narrow` keeps a tall shot (a drawer, a dialog) at its natural size.
 *
 *   <Shot name="invoices" alt="The invoices list" pins />
 */
export function Shot({ name, alt, caption, pins = false, narrow = false }: { name: string; alt: string; caption?: string; pins?: boolean; narrow?: boolean }) {
  const meta = shots[name];
  if (!meta) {
    return (
      <div className="not-prose my-8 rounded-[10px] border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
        Missing screenshot <code>{name}</code>. Add it to <code>scripts/docs-shots.config.mjs</code> and run <code>pnpm docs:shots {name}</code>.
      </div>
    );
  }
  const marks = pins ? (meta.marks ?? []) : [];

  return (
    <figure className={cn("dd-shot not-prose my-8", narrow && "mx-auto max-w-[560px]")}>
      <div className="relative overflow-hidden rounded-[10px] border border-border bg-muted shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)]">
        <ImageZoom src={`/docs/shots/${name}.webp`} width={meta.width} height={meta.height} alt={alt} className="block h-auto w-full" />
        {marks.map((m, i) => (
          <span key={i} aria-hidden="true" className="pointer-events-none absolute" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>
            <span className="absolute inset-0 rounded-[6px] ring-2 ring-foreground/70 ring-offset-0" />
            {/* A mark on the image's edge keeps its badge inside, where the frame won't clip it. */}
            <span
              className={cn(
                "absolute flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background shadow-sm",
                m.x < 1.5 ? "left-1" : "-left-2.5",
                m.y < 2.5 ? "top-1" : "-top-2.5",
              )}
            >
              {i + 1}
            </span>
          </span>
        ))}
      </div>
      {marks.length > 0 && (
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[13.5px] text-muted-foreground sm:grid-cols-2">
          {marks.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-foreground text-[10.5px] font-semibold text-background">{i + 1}</span>
              <span>{m.label}</span>
            </li>
          ))}
        </ol>
      )}
      {caption && <figcaption className="mt-2.5 text-[13px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
