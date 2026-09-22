export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-8 max-w-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-lyra-cyan">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-medium tracking-[0.08em] text-white sm:text-4xl">
        {title}
      </h1>
      <div className="mt-4 h-px w-24 bg-gradient-to-r from-lyra-violet to-lyra-cyan" />
      <p className="mt-4 text-sm leading-6 text-zinc-400">{description}</p>
    </header>
  );
}
