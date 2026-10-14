import assert from "node:assert/strict";
import test from "node:test";

import { acceleratingHashtags } from "./acceleration";

test("una tendencia exige aceleración y un mínimo de menciones recientes", () => {
  const found = acceleratingHashtags({
    recent: [
      { tag: "lyra", count: 10 },
      { tag: "vega", count: 3 },
      { tag: "nuevo", count: 5 },
      { tag: "poco", count: 2 },
    ],
    previous: [
      { tag: "lyra", count: 2 },
      { tag: "vega", count: 3 },
      { tag: "nuevo", count: 0 },
      { tag: "poco", count: 0 },
    ],
    minRecent: 3,
    minAcceleration: 1,
  });
  assert.deepEqual(
    found.map((item) => item.tag),
    ["nuevo", "lyra"],
  );
  assert.equal(found[0]?.acceleration, 5);
  assert.equal(found[1]?.acceleration, 4);
});
