import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the handler module so the page needs no database.
vi.mock("@bionova/polaris-handlers", () => ({
  searchTrials: vi.fn(),
}));

// SearchForm (a client component) calls useRouter(); stub it so the form
// renders without the App Router runtime mounted.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { searchTrials } from "@bionova/polaris-handlers";
import SearchPage from "@/app/search/page";

describe("SearchPage", () => {
  beforeEach(() => {
    vi.mocked(searchTrials).mockReset();
  });

  it("renders the trial list from the mocked handler", async () => {
    vi.mocked(searchTrials).mockResolvedValue({
      total: 1,
      trials: [
        {
          id: "diabetes-prevention",
          name: "Diabetes Prevention Study",
          phase: "2",
          status: "recruiting",
          conditions: [{ id: "diabetes-t2", name: "Type 2 Diabetes" }],
          sites_count: 3,
        },
      ],
      query: {},
    });

    const ui = await SearchPage({
      searchParams: Promise.resolve({ condition: "high blood sugar" }),
    });
    render(ui);

    expect(screen.getByText("Diabetes Prevention Study")).toBeInTheDocument();
    expect(screen.getByText("1 trial found")).toBeInTheDocument();
    expect(searchTrials).toHaveBeenCalledOnce();
    // The page threads the search param into the handler's options.
    const ctx = vi.mocked(searchTrials).mock.calls[0][0];
    expect(ctx.options.condition).toBe("high blood sugar");
  });
});
