/**
 * Thin PostgREST + TEI + edge-function client for the Polaris handlers.
 *
 * Handlers read data through Kong, which fronts PostgREST (`/rest/v1/*`),
 * GoTrue, the edge functions (`/functions/v1/*`), and storage. This module
 * builds the three collaborators a handler needs and hands them back inside a
 * single data context.
 *
 * Test mode: pass a `fetchImpl` (any `fetch`-shaped function) and the clients
 * call it instead of `globalThis.fetch`, so handler unit tests run against
 * canned fixtures with no live stack. `createDataContext({ stub: true })` is a
 * convenience that returns a context whose `fetchImpl` rejects every call —
 * useful for asserting a handler never touches the network on a given path.
 *
 * @module clients/postgrest
 */

/**
 * @typedef {(url: string, init?: object) => Promise<Response>} FetchImpl
 */

const STUB_FETCH = () =>
  Promise.reject(
    new Error("createDataContext stub: no fetchImpl provided for this call"),
  );

/**
 * Build a PostgREST client bound to a Supabase URL and anon key.
 *
 * @param {object} cfg
 * @param {string} cfg.baseUrl  - `${SUPABASE_URL}` (Kong front door)
 * @param {string} cfg.anonKey  - anon apikey (`SUPABASE_ANON_KEY`)
 * @param {FetchImpl} cfg.fetchImpl
 * @param {string} [cfg.token]  - default Bearer token (staff JWT) for all calls
 */
function createPostgrest({ baseUrl, anonKey, fetchImpl, token: defaultToken }) {
  const rest = `${baseUrl}/rest/v1`;

  const headers = (token) => {
    const bearer = token ?? defaultToken ?? anonKey;
    return {
      apikey: anonKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    };
  };

  const parse = async (res, where) => {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostgREST ${where} failed: ${res.status} ${body}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    /**
     * GET `${rest}/${pathAndQuery}`. Returns parsed JSON (usually an array).
     * @param {string} pathAndQuery e.g. `trials?id=eq.foo&select=*`
     * @param {{ token?: string }} [opts]
     */
    async get(pathAndQuery, { token } = {}) {
      const res = await fetchImpl(`${rest}/${pathAndQuery}`, {
        method: "GET",
        headers: headers(token),
      });
      return parse(res, `GET ${pathAndQuery}`);
    },

    /**
     * PATCH `${rest}/${pathAndQuery}` with a JSON body.
     * @param {string} pathAndQuery e.g. `trials?id=eq.foo`
     * @param {object} body
     * @param {{ token?: string, prefer?: string }} [opts]
     */
    async patch(pathAndQuery, body, { token, prefer } = {}) {
      const h = headers(token);
      if (prefer) h.Prefer = prefer;
      const res = await fetchImpl(`${rest}/${pathAndQuery}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify(body),
      });
      return parse(res, `PATCH ${pathAndQuery}`);
    },

    /**
     * POST `${rest}/${pathAndQuery}` with a JSON body. By design this does NOT
     * default to `Prefer: return=representation`: anonymous inserts into
     * `interest_signals` cannot read the row back (staff-only SELECT policy),
     * so callers opt in to representation only when they hold a staff token.
     * @param {string} pathAndQuery e.g. `interest_signals`
     * @param {object} body
     * @param {{ token?: string, prefer?: string }} [opts]
     */
    async post(pathAndQuery, body, { token, prefer } = {}) {
      const h = headers(token);
      if (prefer) h.Prefer = prefer;
      const res = await fetchImpl(`${rest}/${pathAndQuery}`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
      return parse(res, `POST ${pathAndQuery}`);
    },

    /**
     * Call a PostgREST RPC (`/rest/v1/rpc/<name>`) with a JSON argument object.
     * @param {string} name function name, e.g. `match_conditions`
     * @param {object} args
     * @param {{ token?: string }} [opts]
     */
    async rpc(name, args, { token } = {}) {
      const res = await fetchImpl(`${rest}/rpc/${name}`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(args),
      });
      return parse(res, `RPC ${name}`);
    },
  };
}

/**
 * Build a TEI embeddings client.
 * @param {object} cfg
 * @param {string} cfg.teiUrl
 * @param {FetchImpl} cfg.fetchImpl
 */
function createEmbeddings({ teiUrl, fetchImpl }) {
  return {
    /**
     * Embed a single string. Returns a 384-dim number[] (`arr[0]`).
     * @param {string} text
     */
    async embed(text) {
      const res = await fetchImpl(`${teiUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: [text] }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`TEI embed failed: ${res.status} ${body}`);
      }
      const arr = await res.json();
      return arr[0];
    },
  };
}

/**
 * Build an edge-function client.
 * @param {object} cfg
 * @param {string} cfg.baseUrl  - `${SUPABASE_URL}`
 * @param {string} cfg.anonKey
 * @param {FetchImpl} cfg.fetchImpl
 */
function createEdgeFunctions({ baseUrl, anonKey, fetchImpl }) {
  return {
    /**
     * Invoke `${baseUrl}/functions/v1/${name}` with a JSON body.
     * @param {string} name
     * @param {object} body
     * @param {{ token?: string }} [opts]
     */
    async invoke(name, body, { token } = {}) {
      const res = await fetchImpl(`${baseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token ?? anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Edge function ${name} failed: ${res.status} ${text}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
  };
}

/**
 * Build the data context handlers read from.
 *
 * @param {object} [env] - process.env-shaped object. Reads SUPABASE_URL,
 *   SUPABASE_ANON_KEY, TEI_URL.
 * @param {object} [opts]
 * @param {string} [opts.token]      - default staff JWT (Bearer for all calls)
 * @param {FetchImpl} [opts.fetchImpl] - inject a fake fetch for tests
 * @param {boolean} [opts.stub]      - convenience: rejecting fetch for unit tests
 * @returns {{ db: object, embeddings: object, edgeFunctions: object, token: (string|undefined) }}
 */
export function createDataContext(env = {}, opts = {}) {
  const { token, stub } = opts;
  const fetchImpl =
    opts.fetchImpl ?? (stub ? STUB_FETCH : globalThis.fetch?.bind(globalThis));
  if (!fetchImpl) {
    throw new Error(
      "createDataContext: no fetch available; pass opts.fetchImpl",
    );
  }

  const baseUrl = env.SUPABASE_URL ?? "http://localhost:8000";
  const anonKey = env.SUPABASE_ANON_KEY ?? "";
  const teiUrl = env.TEI_URL ?? "http://localhost:8080";

  return {
    db: createPostgrest({ baseUrl, anonKey, fetchImpl, token }),
    embeddings: createEmbeddings({ teiUrl, fetchImpl }),
    edgeFunctions: createEdgeFunctions({ baseUrl, anonKey, fetchImpl }),
    token,
  };
}
