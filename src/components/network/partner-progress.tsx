import { Crown, LockKeyhole, Sparkles, Star, Trophy, UsersRound, Zap } from "lucide-react";

const levels = [
  { name: "Explorador", min: 0, icon: Sparkles },
  { name: "Conector", min: 100, icon: UsersRound },
  { name: "Guía", min: 500, icon: Star },
  { name: "Líder", min: 1_500, icon: Crown },
  { name: "Leyenda", min: 5_000, icon: Trophy },
] as const;

export function PartnerProgress({
  directPartners,
  totalPartners,
  activePartners,
  depth,
}: {
  directPartners: number;
  totalPartners: number;
  activePartners: number;
  depth: number;
}) {
  const indirectPartners = Math.max(0, totalPartners - directPartners);
  const xp = directPartners * 100 + indirectPartners * 25;
  const levelIndex = levels.findLastIndex((level) => xp >= level.min);
  const level = levels[Math.max(0, levelIndex)];
  const nextLevel = levels[levelIndex + 1];
  const progress = nextLevel
    ? Math.min(100, Math.round(((xp - level.min) / (nextLevel.min - level.min)) * 100))
    : 100;
  const LevelIcon = level.icon;

  const achievements = [
    {
      title: "Primera conexión",
      description: "Invita a tu primer partner directo.",
      progress: `${Math.min(directPartners, 1)}/1`,
      unlocked: directPartners >= 1,
      icon: Sparkles,
    },
    {
      title: "Equipo en marcha",
      description: "Construye un equipo de 5 partners.",
      progress: `${Math.min(totalPartners, 5)}/5`,
      unlocked: totalPartners >= 5,
      icon: UsersRound,
    },
    {
      title: "Guía de equipo",
      description: "Acompaña a 5 partners directos.",
      progress: `${Math.min(directPartners, 5)}/5`,
      unlocked: directPartners >= 5,
      icon: Star,
    },
    {
      title: "Constelación",
      description: "Haz crecer tu comunidad a 20 partners.",
      progress: `${Math.min(totalPartners, 20)}/20`,
      unlocked: totalPartners >= 20,
      icon: Trophy,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#171322] p-6 text-white shadow-xl shadow-violet-950/10 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-violet-500/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 -z-10 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium tracking-wide text-violet-100">
              <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              TU PROGRESO DE PARTNERS
            </p>
            <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Partners</h1>
            <p className="mt-2 max-w-xl text-base font-medium text-violet-100 sm:text-lg">
              Tu comunidad crece. Tu nivel también.
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              Cada partner directo y cada nueva conexión en tu equipo suma experiencia para tu siguiente nivel.
            </p>

            <div className="mt-7 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">{xp.toLocaleString("es-MX")}</p>
              <p className="pb-1 text-sm font-medium text-violet-200">XP de comunidad</p>
            </div>
            <p className="mt-2 text-xs text-white/50">
              100 XP por partner directo · 25 XP por partner indirecto. XP simbólico; no equivale a dinero ni créditos.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.07] p-4 sm:p-5 lg:min-w-[280px]">
            <div
              className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full p-1"
              style={{ background: `conic-gradient(#C4B5FD ${progress}%, rgba(255,255,255,.12) ${progress}% 100%)` }}
              role="progressbar"
              aria-label={`Progreso al nivel ${nextLevel?.name ?? "máximo"}`}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className="grid h-full w-full place-items-center rounded-full bg-[#211b31]">
                <LevelIcon className="h-7 w-7 text-violet-200" aria-hidden />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium tracking-[0.18em] text-white/50 uppercase">Nivel actual</p>
              <p className="mt-1 truncate text-xl font-semibold">{level.name}</p>
              <p className="mt-1 text-xs text-white/65">
                {nextLevel ? `${Math.max(0, nextLevel.min - xp)} XP para ${nextLevel.name}` : "Has alcanzado el nivel máximo"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-white/75">{nextLevel ? `Camino a ${nextLevel.name}` : "Nivel máximo"}</span>
            <span className="tabular-nums text-white/60">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Partners directos", directPartners],
            ["Partners activos", activePartners],
            ["Equipo total", totalPartners],
            ["Niveles de profundidad", depth],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
              <dt className="text-xs text-white/55">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-[1.75rem] border border-[#E7E2DA] bg-white p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-violet-700 uppercase">Logros</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1E1E24]">Insignias de comunidad</h2>
          </div>
          <p className="text-xs text-[#8A8680]">{achievements.filter((item) => item.unlocked).length}/{achievements.length} desbloqueadas</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {achievements.map((achievement) => {
            const Icon = achievement.icon;
            return (
              <article
                key={achievement.title}
                className={`relative overflow-hidden rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${
                  achievement.unlocked
                    ? "border-violet-200 bg-gradient-to-br from-violet-50 to-white"
                    : "border-[#EEEAE5] bg-[#FAF9F7]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${achievement.unlocked ? "bg-violet-100 text-violet-700" : "bg-[#EFEDE9] text-[#A6A19A]"}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  {achievement.unlocked ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">LOGRADO</span>
                  ) : (
                    <LockKeyhole className="mt-1 h-4 w-4 text-[#A6A19A]" aria-hidden />
                  )}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-[#1E1E24]">{achievement.title}</h3>
                <p className="mt-1 min-h-10 text-xs leading-5 text-[#6F6A64]">{achievement.description}</p>
                <p className="mt-3 text-xs font-medium tabular-nums text-violet-700">{achievement.unlocked ? "Insignia desbloqueada" : `Progreso ${achievement.progress}`}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
