import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@bionova/polaris-handlers", () => ({
  showTrial: vi.fn(),
}));

import { showTrial } from "@bionova/polaris-handlers";
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
});
