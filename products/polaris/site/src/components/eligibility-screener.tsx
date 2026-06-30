"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Criteria } from "@/lib/types";

// Prefix used on each custom-answer field. The POST route strips it and
// reassembles `custom_answers` keyed by the verbatim criterion text the edge
// function scores against.
export const ANSWER_PREFIX = "answer:";

function Question({ text }: { text: string }) {
  const name = `${ANSWER_PREFIX}${text}`;
  return (
    <fieldset className="space-y-1 border-b border-border pb-3">
      <Label className="block">{text}</Label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name={name} value="true" /> Yes
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name={name} value="false" defaultChecked /> No
        </label>
      </div>
    </fieldset>
  );
}

export function EligibilityScreener({
  trialId,
  criteria,
}: {
  trialId: string;
  criteria: Criteria;
}) {
  const inclusion = criteria.inclusion?.custom ?? [];
  const exclusion = criteria.exclusion?.custom ?? [];

  return (
    <form
      method="post"
      action={`/trials/${trialId}/eligibility/submit`}
      className="space-y-4"
    >
      {inclusion.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Inclusion questions</h2>
          {inclusion.map((q) => (
            <Question key={`inc-${q}`} text={q} />
          ))}
        </section>
      ) : null}
      {exclusion.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Exclusion questions</h2>
          {exclusion.map((q) => (
            <Question key={`exc-${q}`} text={q} />
          ))}
        </section>
      ) : null}
      <Button type="submit">Check eligibility</Button>
    </form>
  );
}
