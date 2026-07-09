import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@bionova/polaris-handlers", () => ({
  listSites: vi.fn(),
}));

import { listSites } from "@bionova/polaris-handlers";
import SitesPage from "@/app/sites/page";

describe("SitesPage", () => {
  beforeEach(() => {
    vi.mocked(listSites).mockReset();
  });

  it("renders the filtered site list with descriptions and threads ?specialty", async () => {
    vi.mocked(listSites).mockResolvedValue({
      sites: [
        {
          id: "site-1",
          name: "Boston Cancer Center",
          city: "Boston",
          state: "MA",
          country: "USA",
          specialties: ["oncology"],
          description: "A leading oncology research site.",
        },
      ],
    });

    const ui = await SitesPage({
      searchParams: Promise.resolve({ specialty: "oncology" }),
    });
    render(ui);

    expect(screen.getByText("Boston Cancer Center")).toBeInTheDocument();
    expect(
      screen.getByText("A leading oncology research site."),
    ).toBeInTheDocument();
    // Filter input is pre-populated with the active specialty.
    expect(screen.getByLabelText(/Filter by specialty/i)).toHaveValue(
      "oncology",
    );
    const ctx = vi.mocked(listSites).mock.calls[0][0];
    expect(ctx.options.specialty).toBe("oncology");
  });
});
