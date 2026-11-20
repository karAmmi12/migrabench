// Test négatif de #20 : doit faire échouer le workflow « Tests du banc ».
import { expect, test } from "vitest";

test("deliberately fails to prove the CI job fails", () => {
  expect(1 + 1).toBe(3);
});
