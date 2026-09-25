import type { SiteDocument } from "@/lib/site-document";

export function SiteView({ site }: { site: SiteDocument }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white">
      <header className="bg-[#16141C] px-6 py-12 text-white sm:px-10 sm:py-16">
        <p className="text-sm text-[#C4B5FD]">{site.title}</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">{site.headline}</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/80">{site.subhead}</p>
        <a href="#contacto" className="mt-8 inline-flex rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white">
          {site.action}
        </a>
      </header>
      <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-3">
        {site.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold tracking-tight text-[#1E1E24]">{section.heading}</h2>
            <p className="mt-3 text-sm leading-7 text-[#5C5854]">{section.body}</p>
          </section>
        ))}
      </div>
      <footer id="contacto" className="border-t border-[#E7E2DA] px-6 py-8 sm:px-10">
        <a href="#contacto" className="inline-flex rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-medium text-white">
          {site.action}
        </a>
      </footer>
    </article>
  );
}
