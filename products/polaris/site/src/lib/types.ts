// Plain data shapes returned by the handlers, typed for the React surface.
// Handlers are ESM JS; these mirror their documented return shapes.

export interface TrialSummary {
  id: string;
  name: string;
  phase?: string;
  status?: string;
  therapeutic_area?: string;
  conditions: Array<{ id: string; name: string }>;
  sites_count: number;
  [key: string]: unknown;
}

export interface Site {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  capacity?: number;
  specialties?: string[];
  description?: string | null;
}

export interface Criteria {
  inclusion: { custom?: string[]; [key: string]: unknown } | null;
  exclusion: { custom?: string[]; [key: string]: unknown } | null;
}

export type MatchScore = "eligible" | "possibly_eligible" | "not_eligible";

export interface SignalSummary {
  eligible: number;
  possibly_eligible: number;
  not_eligible: number;
  total: number;
}
