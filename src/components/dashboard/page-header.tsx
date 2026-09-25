import { sectionDesks, type ConstellationSection } from "@/config/constellation";

export function PageHeader({
  eyebrow,
  title,
  description,
  section,
}: {
  eyebrow: string;
  title: string;
  description: string;
  section?: ConstellationSection;
}) {
  const desk = section ? sectionDesks[section] : null;
  const badge = desk?.squad ?? eyebrow;

  return (
    <header className="mb-8">
      <p className="text-sm text-[#8A8680]">{badge}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#1E1E24] sm:text-5xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#252525] sm:text-base">{description}</p>
      {desk ? (
        <p className="mt-4 text-sm text-[#7C3AED]">
          {desk.star} · {desk.line}
        </p>
      ) : null}
    </header>
  );
}
