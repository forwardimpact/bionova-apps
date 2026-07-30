import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@bionova/polaris-handlers", () => ({
  showTrial: vi.fn(),
  checkEligibility: vi.fn(),
}));
vi.mock("@bionova/polaris-handlers/context", () => ({
  createDataContext: vi.fn(() => ({})),
}));
// freezeInvocationContext just returns the ctx it is handed; the identity mock
// lets the route's assembled ctx (with its custom_answers map) flow straight
// into the checkEligibility spy so we can inspect it.
vi.mock("@forwardimpact/libui", () => ({
  freezeInvocationContext: vi.fn((ctx) => ctx),
}));

import { showTrial, checkEligibility } from "@bionova/polaris-handlers";
import EligibilityPage from "@/app/trials/[id]/eligibility/page";

describe("EligibilityPage", () => {
  beforeEach(() => {
    vi.mocked(showTrial).mockReset();
  });

  it("renders a question per custom criterion and posts to the submit route", async () => {
    vi.mocked(showTrial).mockResolvedValue({
      trial: { name: "Diabetes Prevention Study" },
      criteria: {
        inclusion: { custom: ["On stable metformin dose for 3+ months"] },
        exclusion: { custom: ["History of diabetic ketoacidosis"] },
      },
    });

    const ui = await EligibilityPage({
      params: Promise.resolve({ id: "diabetes-prevention" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    expect(
      screen.getByText("On stable metformin dose for 3+ months"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("History of diabetic ketoacidosis"),
    ).toBeInTheDocument();

    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe(
      "/trials/diabetes-prevention/eligibility/submit",
    );
  });

  it("renders the match score badge when a score is in the query string", async () => {
    vi.mocked(showTrial).mockResolvedValue({
      trial: { name: "Diabetes Prevention Study" },
      criteria: { inclusion: { custom: [] }, exclusion: { custom: [] } },
    });

    const ui = await EligibilityPage({
      params: Promise.resolve({ id: "diabetes-prevention" }),
      searchParams: Promise.resolve({ score: "eligible" }),
    });
    render(ui);

    expect(screen.getByText("Likely eligible")).toBeInTheDocument();
  });

  // Regression for #300: no answer may be pre-selected. A pre-checked "No"
  // radio made an untouched inclusion question submit `false`, which the scorer
  // reads as answered-No (not_eligible) rather than unanswered. The screener
  // must force a deliberate choice so unanswered questions reach the scorer as
  // unanswered.
  it("pre-selects no answer on any criterion", async () => {
    vi.mocked(showTrial).mockResolvedValue({
      trial: { name: "Diabetes Prevention Study" },
      criteria: {
        inclusion: { custom: ["On stable metformin dose for 3+ months"] },
        exclusion: { custom: ["History of diabetic ketoacidosis"] },
      },
    });

    const ui = await EligibilityPage({
      params: Promise.resolve({ id: "diabetes-prevention" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    // Two rows (one inclusion, one exclusion) × Yes/No = four radios, none checked.
    expect(radios.length).toBe(4);
    for (const radio of radios) {
      expect(radio.checked).toBe(false);
    }
  });
});

// The submit route builds the `custom_answers` map the scorer scores against.
// The scorer already distinguishes unanswered (undefined -> possibly_eligible)
// from answered-No (false -> not_eligible); its semantics are anchored by the
// edge-function test "score: missing custom answer is possibly_eligible"
// (services/polaris-functions/eligibility-check/test.ts:142). This layer was
// unspecified and is where the UI drifted out of line: it must OMIT the key for
// any question the patient did not answer, so the scorer sees `undefined`
// rather than a manufactured `false`. #300.
describe("eligibility submit route", () => {
  beforeEach(() => {
    vi.mocked(checkEligibility).mockReset();
    vi.mocked(checkEligibility).mockResolvedValue({
      match_score: "possibly_eligible",
    });
  });

  async function submit(entries: Array<[string, string]>) {
    const { POST } = await import(
      "@/app/trials/[id]/eligibility/submit/route"
    );
    const body = new FormData();
    for (const [k, v] of entries) body.append(k, v);
    const request = new Request(
      "http://localhost/trials/diabetes-prevention/eligibility/submit",
      { method: "POST", body },
    );
    await POST(request as never, {
      params: Promise.resolve({ id: "diabetes-prevention" }),
    });
    return vi.mocked(checkEligibility).mock.calls[0][0].options
      .custom_answers as Record<string, boolean>;
  }

  it("omits unanswered keys on a fully blank submit", async () => {
    const answers = await submit([]);
    expect(answers).toEqual({});
  });

  it("keeps only answered keys on a partial submit", async () => {
    const answers = await submit([
      ["answer:On stable metformin dose for 3+ months", "true"],
      // "History of diabetic ketoacidosis" left unanswered -> no entry posted.
    ]);
    expect(answers).toEqual({
      "On stable metformin dose for 3+ months": true,
    });
    expect(answers).not.toHaveProperty("History of diabetic ketoacidosis");
  });
});
