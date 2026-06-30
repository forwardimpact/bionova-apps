import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@bionova/polaris-handlers", () => ({
  showTrial: vi.fn(),
}));

import { showTrial } from "@bionova/polaris-handlers";
import TrialPage from "@/app/trials/[id]/page";

describe("TrialPage", () => {
  beforeEach(() => {
    vi.mocked(showTrial).mockReset();
  });

  it("shows trial fields, conditions, sites, FAQ and consent", async () => {
    vi.mocked(showTrial).mockResolvedValue({
      trial: { id: "diabetes-prevention", name: "Diabetes Prevention Study", phase: "2", status: "recruiting" },
      criteria: { inclusion: { custom: ["HbA1c between 7.0% and 10.5%"] }, exclusion: { custom: [] } },
      sites: [{ id: "site-1", name: "Boston Clinic", city: "Boston", state: "MA" }],
      conditions: [{ id: "diabetes-t2", name: "Type 2 Diabetes" }],
      principal_investigator: { name: "Dr. Rivera", specialty: "Endocrinology" },
      faq: "How long is the study?",
      consentSummary: "You may withdraw at any time.",
    });

    const ui = await TrialPage({ params: { id: "diabetes-prevention" } });
    render(ui);

    expect(screen.getByText("Diabetes Prevention Study")).toBeInTheDocument();
    expect(screen.getByText("Type 2 Diabetes")).toBeInTheDocument();
    expect(screen.getByText(/Boston Clinic/)).toBeInTheDocument();
    expect(screen.getByText(/HbA1c between/)).toBeInTheDocument();
    expect(screen.getByText("How long is the study?")).toBeInTheDocument();
    expect(screen.getByText("You may withdraw at any time.")).toBeInTheDocument();
  });
});
