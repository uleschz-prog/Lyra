import { transform } from "esbuild";
import { describe, expect, it } from "vitest";

import { checkGameCode, extractGameCode, syntaxErrors, validateGameCode } from "@/lib/games/checks";
import { gameConfigScript, gameHtml, gameRuntimeSource, inlineScript } from "@/lib/games/runtime";
import { neonBlocksSource } from "@/lib/games/template-neon";

import { brokenGame, tinyGame } from "./fixtures";

describe("motor LyraGame", () => {
  it("es JS válido sin comillas invertidas ni interpolaciones (va dentro de String.raw)", async () => {
    expect(gameRuntimeSource).not.toMatch(/`|\$\{/);
    await expect(transform(gameRuntimeSource, { loader: "js", target: "es2018" })).resolves.toBeTruthy();
  });

  it("trae bucle de paso fijo, devicePixelRatio, táctil, pausa por visibilidad, WebAudio, récord y ranking", () => {
    for (const piece of ["STEP = 1 / 60", "devicePixelRatio", "pointerdown", "visibilitychange", "AudioContext", "lyra-game:", "__LYRA_GAME__", "requestFullscreen", "Jugar de nuevo"]) {
      expect(gameRuntimeSource).toContain(piece);
    }
  });

  it("el juego oficial pasa las mismas revisiones que el código del modelo", async () => {
    const code = neonBlocksSource({ title: "Mi juego </script>", colors: { primary: "#FF0000" } });
    expect(code).not.toMatch(/`/);
    expect(await validateGameCode(code)).toEqual([]);
    expect(code).toContain('"#FF0000"');
  });

  it("gameHtml escapa </script> y el título", () => {
    const html = gameHtml({ title: "<b>Hola</b>", description: "x", bg: "javascript:alert(1)", code: 'var a = "</script><script>alert(1)</script>"; LyraGame.start({});' });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("&lt;b&gt;Hola&lt;/b&gt;");
    expect(html).toContain('content="#0B0718"');
    expect(html).toContain("user-scalable=no");
    expect(inlineScript("a</SCRIPT>b<!--")).toBe("a<\\/SCRIPT>b<\\!--");
  });

  it("gameConfigScript no permite cerrar la etiqueta", () => {
    expect(gameConfigScript({ api: "https://lyyra.vercel.app/api/apps/x/", slug: "</script>" })).not.toContain("</script></script>");
  });
});

describe("revisión del código de juego", () => {
  it("acepta un juego mínimo", async () => {
    expect(await validateGameCode(tinyGame)).toEqual([]);
  });

  it("rechaza red, URLs externas, almacenamiento, eval, bucles propios y módulos", () => {
    const errors = checkGameCode(brokenGame);
    expect(errors.join(" ")).toMatch(/Sin red/);
    expect(errors.join(" ")).toMatch(/direcciones externas/);
    expect(checkGameCode(tinyGame.replace("var SPEED", "localStorage.x = 1; var SPEED")).join(" ")).toMatch(/almacenamiento/);
    expect(checkGameCode(tinyGame.replace("var SPEED", "eval('1'); var SPEED")).join(" ")).toMatch(/eval/);
    expect(checkGameCode(tinyGame.replace("var SPEED", "requestAnimationFrame(function(){}); var SPEED")).join(" ")).toMatch(/bucle/);
    expect(checkGameCode(`import x from "y";\n${tinyGame}`).join(" ")).toMatch(/import/);
    expect(checkGameCode("var a = 1;").join(" ")).toMatch(/LyraGame.start|corto/);
  });

  it("los comentarios con URLs no cuentan", () => {
    expect(checkGameCode(`// ver https://example.com\n/* fetch( */\n${tinyGame}`)).toEqual([]);
  });

  it("detecta errores de sintaxis sin ejecutar el código", async () => {
    const errors = await syntaxErrors(tinyGame.replace("var SPEED = 200;", "var SPEED = ;"));
    expect(errors[0]).toMatch(/línea 1/);
  });

  it("extrae el bloque ```js más largo", () => {
    expect(extractGameCode("hola\n```js\nvar a=1;\n```\n```javascript\nvar bb = 22;\n```")).toBe("var bb = 22;\n");
  });
});

describe("textos de fin de juego", () => {
  it("el rompebloques usa un motivo real y el motor no inventa subtítulo sin motivo", () => {
    const source = neonBlocksSource({ title: "Bloques Neón", colors: {}, leaderboard: true });
    expect(source).toContain('g.over("Se acabaron las vidas.")');
    expect(gameRuntimeSource).toContain('(overReason ? \'<p class="lg-sub">\'');
    for (const text of [source, gameRuntimeSource]) expect(text).not.toMatch(/fin de la prueba|lorem|ipsum/i);
  });
});
