// Variantes observées (spec de l'étape 2, « Variantes observées ») : seules les
// clés et valeurs du tableau de la spec sont acceptées. Les cas refusés sont
// vérifiés par `npm run typecheck` (`@ts-expect-error`), le format par Vitest.
import { describe, expect, it } from "vitest";
import { skippedStepAnnotation, variantAnnotation } from "../../oracle/variants.ts";

describe("variantAnnotation", () => {
  it.each([
    ["lock", "readonly", "lock=readonly"],
    ["lock", "disabled", "lock=disabled"],
    ["lock", "aria-readonly", "lock=aria-readonly"],
    ["maxlength", "input-blocked", "maxlength=input-blocked"],
    ["maxlength", "message", "maxlength=message"],
    ["receipt-tab", "same-tab", "receipt-tab=same-tab"],
    ["receipt-tab", "new-tab", "receipt-tab=new-tab"],
  ] as const)("records %s=%s as an mb:variant annotation", (key, value, description) => {
    expect(variantAnnotation(key, value as never)).toEqual({ type: "mb:variant", description });
  });

  it("refuses at compile time a key or a value the spec does not list", () => {
    // @ts-expect-error clé absente de la spec
    variantAnnotation("tab", "same-tab");
    // @ts-expect-error valeur d'une autre clé
    variantAnnotation("receipt-tab", "readonly");
    // @ts-expect-error valeur absente de la spec
    variantAnnotation("lock", "hidden");
    expect(variantAnnotation("receipt-tab", "same-tab").description).toBe("receipt-tab=same-tab");
  });
});

describe("skippedStepAnnotation", () => {
  it("records the skipped step and the variant that justifies it as an mb:skipped-step annotation", () => {
    expect(skippedStepAnnotation("verification: message shown", "maxlength", "input-blocked")).toEqual({
      type: "mb:skipped-step",
      description: "verification: message shown (maxlength=input-blocked)",
    });
  });

  it("refuses at compile time a variant the spec does not list", () => {
    // @ts-expect-error valeur absente de la spec
    skippedStepAnnotation("step", "maxlength", "truncated");
    expect(skippedStepAnnotation("step", "lock", "disabled").description).toBe("step (lock=disabled)");
  });
});
