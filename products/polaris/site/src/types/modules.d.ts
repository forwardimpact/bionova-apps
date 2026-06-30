// Ambient declarations for the untyped workspace ESM-JS packages we consume.
// The handler package and libui ship plain JavaScript; these stubs give the
// TypeScript build the minimal shapes the web surface relies on.

declare module "@forwardimpact/libui" {
  export interface InvocationContext {
    data: any;
    args: Record<string, string>;
    options: Record<string, string | boolean | string[]>;
    deps?: Record<string, unknown>;
  }
  export function freezeInvocationContext(raw: {
    data: any;
    args: Record<string, string>;
    options: Record<string, unknown>;
    deps?: Record<string, unknown>;
  }): InvocationContext;
}

declare module "@bionova/polaris-handlers/context" {
  export function createDataContext(
    env?: Record<string, string | undefined>,
    opts?: { token?: string; fetchImpl?: typeof fetch; stub?: boolean },
  ): {
    db: any;
    embeddings: any;
    edgeFunctions: any;
    token?: string;
  };
}

declare module "@bionova/polaris-handlers" {
  type Ctx = { data?: any; args?: Record<string, string>; options?: any };
  export function searchTrials(ctx: Ctx): Promise<any>;
  export function showTrial(ctx: Ctx): Promise<any>;
  export function showCondition(ctx: Ctx): Promise<any>;
  export function checkEligibility(ctx: Ctx): Promise<any>;
  export function listSites(ctx: Ctx): Promise<any>;
  export function listStories(ctx: Ctx): Promise<any>;
  export function showAbout(ctx: Ctx): Promise<any>;
  export function manageTrial(ctx: Ctx): Promise<any>;
}
