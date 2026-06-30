// notify-updates — invoked by the trials_status_change_notify DB trigger when a
// trial's status changes. Queries interest_signals for the affected trial and
// logs a would-notify line per signal. Email sending is stubbed (GoTrue email
// integration deferred per design). interest_signals are anonymous, so most
// status changes log a count with no addressable recipient.

import type { Env } from "../env.ts";

export type NotifyRequest = {
  trial_id: string;
  old_status?: string;
  new_status?: string;
};

export type InterestSignal = {
  id: string;
  match_score: string;
  screener_answers: Record<string, unknown>;
};

export type NotifyResponse = { trial_id: string; notified: number };

// Builds the deterministic would-notify log line for one signal.
export function notifyLine(req: NotifyRequest, signal: InterestSignal): string {
  const transition = `${req.old_status ?? "?"} -> ${req.new_status ?? "?"}`;
  return `would-notify signal=${signal.id} trial=${req.trial_id} status=${transition} match=${signal.match_score}`;
}

// Fetches interest signals for a trial via PostgREST.
export async function fetchSignals(trialId: string, env: Env): Promise<InterestSignal[]> {
  const url = `${env.PGREST_URL}/interest_signals?trial_id=eq.${encodeURIComponent(trialId)}` +
    `&select=id,match_score,screener_answers`;
  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    throw new Error(
      `PostgREST interest_signals query returned ${r.status}: ${(await r.text()).slice(0, 120)}`,
    );
  }
  return (await r.json()) as InterestSignal[];
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as NotifyRequest;
  if (!body.trial_id) {
    return new Response(JSON.stringify({ error: "trial_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const signals = await fetchSignals(body.trial_id, env);
  for (const signal of signals) {
    // Stub: log only. Re-running on the same transition logs the same lines,
    // so the trigger is safe to fire repeatedly.
    console.log(notifyLine(body, signal));
  }

  const result: NotifyResponse = { trial_id: body.trial_id, notified: signals.length };
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
