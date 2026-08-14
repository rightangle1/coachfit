/**
 * Decision-log service (ADR-0005 / CLAUDE.md §7).
 *
 * Centralizes writing engine-call records so no call can bypass the log. Talks to
 * the persistence port (ADR-0007), so it works identically on native (SQLite) and
 * web/Node (localStorage/in-memory).
 */

import {
  insertDecision,
  listDecisions,
  countDecisions,
} from '../data/persistence';
import type { DecisionRow } from '../data/persistence-types';
import { uid } from './id';

// The web implementation uses localStorage, which is deliberately a small,
// best-effort diagnostic store. Keep an individual payload bounded before it
// reaches the persistence layer; native SQLite has no comparable quota issue.
const MAX_JSON_FIELD_CHARS = 64 * 1024;

export type EngineCall =
  | 'generateSession'
  | 'adjustDuringSession'
  | 'interpretDebrief'
  | 'planRollingWeek';

export interface LogDecisionArgs {
  call: EngineCall;
  engineId: string;
  engineVersion: string;
  input: unknown;
  output: unknown;
  /** Which structured inputs drove which adjustments. */
  drivers?: unknown;
  sessionId?: string;
}

function jsonForDecisionLog(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_JSON_FIELD_CHARS) return json;
    return JSON.stringify({
      truncated: true,
      originalChars: json.length,
      preview: json.slice(0, MAX_JSON_FIELD_CHARS),
    });
  } catch {
    // Logging must never interrupt a workout because a future caller supplied
    // a non-serializable diagnostic object.
    return JSON.stringify({ unavailable: true });
  }
}

export function logDecision(args: LogDecisionArgs): string {
  const id = uid('dec');
  insertDecision({
    id,
    createdAt: Date.now(),
    call: args.call,
    engineId: args.engineId,
    engineVersion: args.engineVersion,
    inputJson: jsonForDecisionLog(args.input),
    outputJson: jsonForDecisionLog(args.output),
    driversJson: args.drivers ? jsonForDecisionLog(args.drivers) : null,
    sessionId: args.sessionId ?? null,
  });
  return id;
}

export function recentDecisions(limit = 20): DecisionRow[] {
  return listDecisions(limit);
}

export function decisionCount(): number {
  return countDecisions();
}
