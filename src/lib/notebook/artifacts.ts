export type Slide = {
  kicker: string;
  title: string;
  points: string[];
  note: string;
};

export type Deck = {
  title: string;
  slides: Slide[];
};

export type MindMap = {
  title: string;
  center: string;
  branches: { label: string; detail: string; leaves: string[] }[];
};

export type Report = {
  title: string;
  dek: string;
  sections: { heading: string; body: string }[];
};

export type FlashDeck = {
  title: string;
  cards: { front: string; back: string }[];
};

export type StudyQuiz = {
  title: string;
  questions: { prompt: string; choices: string[]; answer: number; why: string }[];
};

export type Infographic = {
  title: string;
  subtitle: string;
  stats: { value: string; label: string }[];
  points: { title: string; text: string }[];
};

export type DataTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export function readJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function parseDeck(raw: string): Deck | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.slides)) return null;
  const slides = value.slides
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const slide = item as Record<string, unknown>;
      const title = text(slide.title, 140);
      if (!title) return null;
      const points = Array.isArray(slide.points)
        ? slide.points.map((point) => text(point, 180)).filter(Boolean).slice(0, 4)
        : [];
      return {
        kicker: text(slide.kicker, 40),
        title,
        points,
        note: text(slide.note, 240),
      };
    })
    .filter((slide): slide is Slide => slide !== null)
    .slice(0, 8);
  if (slides.length === 0) return null;
  return { title: text(value.title, 120) || "Presentación", slides };
}

export function parseMindMap(raw: string): MindMap | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.branches)) return null;
  const branches = value.branches
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const branch = item as Record<string, unknown>;
      const label = text(branch.label, 48);
      if (!label) return null;
      const leaves = Array.isArray(branch.leaves)
        ? branch.leaves.map((leaf) => text(leaf, 80)).filter(Boolean).slice(0, 4)
        : [];
      return { label, detail: text(branch.detail, 160), leaves };
    })
    .filter((branch): branch is MindMap["branches"][number] => branch !== null)
    .slice(0, 6);
  if (branches.length === 0) return null;
  return {
    title: text(value.title, 80) || "Mapa mental",
    center: text(value.center, 48) || "Tema",
    branches,
  };
}

export function parseReport(raw: string): Report | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.sections)) return null;
  const sections = value.sections
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const section = item as Record<string, unknown>;
      const heading = text(section.heading, 80);
      const body = text(section.body, 900);
      if (!heading || !body) return null;
      return { heading, body };
    })
    .filter((section): section is Report["sections"][number] => section !== null)
    .slice(0, 6);
  if (sections.length === 0) return null;
  return {
    title: text(value.title, 120) || "Informe",
    dek: text(value.dek, 220),
    sections,
  };
}

export function parseCards(raw: string): FlashDeck | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.cards)) return null;
  const cards = value.cards
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const card = item as Record<string, unknown>;
      const front = text(card.front, 180);
      const back = text(card.back, 320);
      if (!front || !back) return null;
      return { front, back };
    })
    .filter((card): card is FlashDeck["cards"][number] => card !== null)
    .slice(0, 12);
  if (cards.length === 0) return null;
  return { title: text(value.title, 80) || "Tarjetas", cards };
}

export function parseQuiz(raw: string): StudyQuiz | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.questions)) return null;
  const questions = value.questions
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const question = item as Record<string, unknown>;
      const prompt = text(question.prompt, 220);
      const choices = Array.isArray(question.choices)
        ? question.choices.map((choice) => text(choice, 140)).filter(Boolean).slice(0, 4)
        : [];
      const answer = typeof question.answer === "number" ? question.answer : Number(question.answer);
      if (!prompt || choices.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) return null;
      return { prompt, choices, answer, why: text(question.why, 280) };
    })
    .filter((question): question is StudyQuiz["questions"][number] => question !== null)
    .slice(0, 8);
  if (questions.length === 0) return null;
  return { title: text(value.title, 80) || "Cuestionario", questions };
}

export function parseInfographic(raw: string): Infographic | null {
  const value = readJsonObject(raw);
  if (!value) return null;
  const stats = Array.isArray(value.stats)
    ? value.stats
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const stat = item as Record<string, unknown>;
          const label = text(stat.label, 48);
          const figure = text(stat.value, 24);
          if (!label || !figure) return null;
          return { value: figure, label };
        })
        .filter((stat): stat is Infographic["stats"][number] => stat !== null)
        .slice(0, 4)
    : [];
  const points = Array.isArray(value.points)
    ? value.points
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const point = item as Record<string, unknown>;
          const title = text(point.title, 60);
          const body = text(point.text, 220);
          if (!title || !body) return null;
          return { title, text: body };
        })
        .filter((point): point is Infographic["points"][number] => point !== null)
        .slice(0, 4)
    : [];
  if (stats.length === 0 && points.length === 0) return null;
  return {
    title: text(value.title, 80) || "Infografía",
    subtitle: text(value.subtitle, 140),
    stats,
    points,
  };
}

export function parseTable(raw: string): DataTable | null {
  const value = readJsonObject(raw);
  if (!value || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return null;
  const columns = value.columns.map((column) => text(column, 40)).filter(Boolean).slice(0, 6);
  if (columns.length < 2) return null;
  const rows = value.rows
    .map((row) => {
      if (!Array.isArray(row)) return null;
      const cells = columns.map((_, index) => text(row[index], 160));
      if (cells.every((cell) => cell.length === 0)) return null;
      return cells;
    })
    .filter((row): row is string[] => row !== null)
    .slice(0, 12);
  if (rows.length === 0) return null;
  return { title: text(value.title, 80) || "Tabla", columns, rows };
}
