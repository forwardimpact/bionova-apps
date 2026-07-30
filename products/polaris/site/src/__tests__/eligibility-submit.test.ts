import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@bionova/polaris-handlers", () => ({
  checkEligibility: vi.fn(),
}));
vi.mock("@bionova/polaris-handlers/context", () => ({
  createDataContext: vi.fn(() => ({})),
}));
vi.mock("@forwardimpact/libui", () => ({
  freezeInvocationContext: vi.fn((ctx) => ctx),
}));

import { checkEligibility } from "@bionova/polaris-handlers";
import { POST } from "@/app/trials/[id]/eligibility/submit/route";

// The submit route runs behind a reverse proxy, where `request.url` is the
// container bind host (0.0.0.0:3000). These tests pin the redirect back onto
// the public origin — never that internal address.
const INTERNAL_URL =
  "http://0.0.0.0:3000/trials/diabetes-prevention/eligibility/submit";

function submitRequest() {
  const body = new FormData();
  body.set("answer:On stable metformin dose for 3+ months", "true");
  return new NextRequest(INTERNAL_URL, { method: "POST", body });
}

describe("eligibility submit redirect", () => {
  beforeEach(() => {
    vi.mocked(checkEligibility).mockResolvedValue({ match_score: "eligible" });
    delete process.env.POLARIS_SITE_URL;
  });

  afterEach(() => {
    delete process.env.POLARIS_SITE_URL;
  });

  it("emits a relative Location when no public origin is pinned", async () => {
    const res = await POST(submitRequest(), {
      params: Promise.resolve({ id: "diabetes-prevention" }),
    });

    expect(res.status).toBe(303);
    const location = res.headers.get("Location");
    expect(location).toBe(
      "/trials/diabetes-prevention/eligibility?score=eligible",
    );
    expect(location).not.toContain("0.0.0.0");
  });

  it("resolves against POLARIS_SITE_URL when it is pinned", async () => {
    process.env.POLARIS_SITE_URL = "https://polaris.example.org";
    const res = await POST(submitRequest(), {
      params: Promise.resolve({ id: "diabetes-prevention" }),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(
      "https://polaris.example.org/trials/diabetes-prevention/eligibility?score=eligible",
    );
  });
});
