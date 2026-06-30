/**
 * Test helpers: build a fake `fetch` that routes requests to canned responses
 * by matching the path (and optionally method) against a route table, so
 * handler unit tests run with no live stack.
 */

/** Build a Response-like object with the bits the clients read. */
export function jsonResponse(body, { status = 200 } = {}) {
  const text = body === null ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  };
}

/**
 * @param {Array<{ match: (url:string, init:object)=>boolean, respond: (url:string, init:object)=>object }>} routes
 * Returns { fetchImpl, calls } — `calls` records every { url, init }.
 */
export function makeFetch(routes) {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    calls.push({ url, init });
    for (const r of routes) {
      if (r.match(url, init)) return Promise.resolve(r.respond(url, init));
    }
    return Promise.reject(new Error(`No fake route for ${init.method ?? "GET"} ${url}`));
  };
  return { fetchImpl, calls };
}

/** Convenience: a route matching when the URL contains `needle`. */
export function route(needle, body, opts = {}) {
  return {
    match: (url, init) =>
      url.includes(needle) && (!opts.method || init.method === opts.method),
    respond: () => jsonResponse(body, opts),
  };
}
