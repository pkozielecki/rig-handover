// The morning digest's contract. Every part of the digest (page, JSON, board link, tests)
// builds against this file; the logic lives in reader.ts.

export type DigestStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  // Owner of the job's most recent line that had one. null when no line did; views show it as "—" (styleguide).
  owner: string | null;
  // Every log line for the job, retries and failures included.
  runs: number;
  // Lines with status "retry".
  retries: number;
  // Status of the job's last line, in file order.
  lastStatus: DigestStatus;
  // Error of the job's most recent line that carried one, even if a later line was ok. null if none did.
  lastError: string | null;
  // `at` of the job's first and last line, exactly as logged: offset kept, never converted to UTC.
  firstAt: string;
  lastAt: string;
};

export type Night = {
  // Sorted by job (plain string order). The page and the JSON both render this order as is,
  // so they cannot disagree (ADR 0001).
  rows: DigestRow[];
  // Valid log lines per status over the whole night (what the status board shows beside a night).
  counts: Record<DigestStatus, number>;
  // Lines that did not parse or did not have the log's shape. Counted, never thrown.
  badLines: number;
};

// Reads runs/<night>.jsonl. `night` is YYYY-MM-DD.
// Returns null when there is no file for that night (also for anything that is not a YYYY-MM-DD
// night), so callers answer 404. An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
