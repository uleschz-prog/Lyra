import { describe, expect, it } from "vitest";

import { parseCards, parseDeck, parseInfographic, parseMindMap, parseQuiz, parseReport, parseTable } from "@/lib/notebook/artifacts";

const fenced = (json: unknown) => "```json\n" + JSON.stringify(json) + "\n```";

describe("piezas del notebook", () => {
  it("lee una presentación aunque venga entre marcas de código", () => {
    const deck = parseDeck(
      fenced({
        title: "Plan",
        slides: [{ kicker: "Portada", title: "Inicio", points: ["Una idea"], note: "Abre con calma." }],
      }),
    );
    expect(deck?.title).toBe("Plan");
    expect(deck?.slides[0]?.points).toEqual(["Una idea"]);
  });

  it("arma mapa, informe, tarjetas, quiz, infografía y tabla", () => {
    expect(
      parseMindMap(JSON.stringify({ title: "Red", center: "Lyra", branches: [{ label: "Inicio", detail: "Entrada", leaves: ["29"] }, { label: "Pro", detail: "Fondo", leaves: ["249"] }] }))?.branches,
    ).toHaveLength(2);

    expect(parseReport(JSON.stringify({ title: "Informe", dek: "Síntesis", sections: [{ heading: "Hecho", body: "Solo lo que está en la fuente." }] }))?.sections[0]?.heading).toBe("Hecho");

    expect(parseCards(JSON.stringify({ title: "Estudio", cards: [{ front: "¿Precio?", back: "249" }] }))?.cards).toHaveLength(1);

    expect(
      parseQuiz(JSON.stringify({ title: "Quiz", questions: [{ prompt: "¿Cuál?", choices: ["A", "B"], answer: 1, why: "Porque B." }] }))?.questions[0]?.answer,
    ).toBe(1);

    expect(parseQuiz(JSON.stringify({ questions: [{ prompt: "¿Cuál?", choices: ["A"], answer: 0, why: "" }] }))).toBeNull();

    expect(parseInfographic(JSON.stringify({ title: "Cifras", subtitle: "Del material", stats: [{ value: "6", label: "Niveles" }], points: [] }))?.stats[0]?.value).toBe("6");

    expect(parseTable(JSON.stringify({ title: "Comparar", columns: ["Plan", "Precio"], rows: [["Pro", "249"]] }))?.rows).toEqual([["Pro", "249"]]);
  });
});
