import assert from "node:assert/strict";
import test from "node:test";

import { classifyPost } from "./classify";
import { defaultCrisisConfig, evaluateCrisis, negativityIndex } from "./crisis";
import { scoreSpanish } from "./spanish";

const now = new Date("2026-10-14T12:00:00.000Z");

function post(sentiment: "positive" | "negative" | "neutral", minutesAgo: number) {
  return { sentiment, createdAt: new Date(now.getTime() - minutesAgo * 60 * 1000) };
}

test("VADER clasifica inglés y el léxico local clasifica español", () => {
  assert.equal(classifyPost("I love this product").label, "positive");
  assert.equal(classifyPost("I love this product").language, "en");
  assert.equal(classifyPost("This is the worst scam ever, I hate it").label, "negative");
  assert.equal(classifyPost("The meeting is at noon").label, "neutral");

  assert.equal(classifyPost("esto es una estafa horrible").label, "negative");
  assert.equal(classifyPost("esto es una estafa horrible").language, "es");
  assert.equal(classifyPost("excelente servicio recomendado").label, "positive");
  assert.equal(classifyPost("el clima de hoy").label, "neutral");
});

test("la negación española solo cubre una ventana corta", () => {
  assert.equal(scoreSpanish("no es malo").label, "positive");
  assert.equal(scoreSpanish("no es bueno").label, "negative");
  assert.equal(scoreSpanish("pésimo servicio").label, "negative");
  assert.equal(scoreSpanish("sin contexto emocional").label, "neutral");
});

test("el índice de negatividad dispara la alerta solo dentro de la ventana", () => {
  const config = { ...defaultCrisisConfig, threshold: 0.6, windowMs: 60 * 60 * 1000, minPosts: 5 };
  const loud = [post("negative", 1), post("negative", 2), post("negative", 3), post("negative", 4), post("positive", 5)];
  assert.equal(evaluateCrisis(loud, config, now).alert, true);
  assert.equal(evaluateCrisis(loud, config, now).negativity, 0.8);

  const exact = [post("negative", 1), post("negative", 2), post("negative", 3), post("positive", 4), post("positive", 5)];
  assert.equal(evaluateCrisis(exact, config, now).negativity, 0.6);
  assert.equal(evaluateCrisis(exact, config, now).alert, false);

  const short = [post("negative", 1), post("negative", 2), post("negative", 3), post("negative", 4)];
  assert.equal(evaluateCrisis(short, config, now).alert, false);

  const stale = [post("negative", 120), post("negative", 130), post("negative", 140), post("negative", 150), post("negative", 160)];
  assert.equal(evaluateCrisis(stale, config, now).alert, false);
  assert.equal(negativityIndex([]), 0);
});
