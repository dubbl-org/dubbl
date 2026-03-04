export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
      <div className="shrink-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
