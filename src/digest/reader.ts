import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, Night, ReadNight } from './types.js';

type Entry = { at: string; job: string; status: DigestStatus; owner: string | null; error: string | null };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// Parse at the edge: a line is an Entry or it is bad. Never throws.
function parseLine(line: string): Entry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as DigestStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

function byJob(a: DigestRow, b: DigestRow): number {
  return a.job < b.job ? -1 : a.job > b.job ? 1 : 0;
}

export const readNight: ReadNight = (runsDir, night): Night | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const e = parseLine(line);
    if (!e) {
      badLines += 1;
      continue;
    }
    const row = rows.get(e.job);
    if (!row) {
      rows.set(e.job, {
        job: e.job,
        owner: e.owner,
        runs: 1,
        retries: e.status === 'retry' ? 1 : 0,
        lastStatus: e.status,
        lastError: e.error,
        firstAt: e.at,
        lastAt: e.at,
      });
      continue;
    }
    row.runs += 1;
    if (e.status === 'retry') row.retries += 1;
    row.lastStatus = e.status;
    row.lastAt = e.at;
    if (e.error !== null) row.lastError = e.error;
    if (e.owner !== null) row.owner = e.owner;
  }

  return { rows: [...rows.values()].sort(byJob), badLines };
};
