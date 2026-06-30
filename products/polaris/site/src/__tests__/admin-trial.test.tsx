import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// No staff cookie present → buildAdminCtx yields an undefined token →
// manageTrial throws its documented precondition.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@bionova/polaris-handlers", () => ({
  manageTrial: vi.fn(),
}));

import { manageTrial } from "@bionova/polaris-handlers";
import AdminTrialPage from "@/app/admin/trials/[id]/page";

describe("AdminTrialPage", () => {
  beforeEach(() => {
    vi.mocked(manageTrial).mockReset();
  });

  it("renders the unauthorized state when no staff JWT cookie is set", async () => {
    vi.mocked(manageTrial).mockRejectedValue(
      new Error("manageTrial requires ctx.data.token (staff JWT)"),
    );

    const ui = await AdminTrialPage({ params: { id: "diabetes-prevention" } });
    render(ui);

    expect(screen.getByText("Staff access required")).toBeInTheDocument();
    expect(screen.getByText("Go to staff sign-in")).toBeInTheDocument();
  });

  it("renders signal aggregates when the staff JWT is present", async () => {
    vi.mocked(manageTrial).mockResolvedValue({
      trial: { name: "Diabetes Prevention Study", status: "recruiting", current_enrollment: 12, target_enrollment: 40 },
      signals: { eligible: 5, possibly_eligible: 3, not_eligible: 2, total: 10 },
    });

    const ui = await AdminTrialPage({ params: { id: "diabetes-prevention" } });
    render(ui);

    expect(screen.getByText("Interest signals")).toBeInTheDocument();
    expect(screen.getByText("Total signals")).toBeInTheDocument();
  });
});
