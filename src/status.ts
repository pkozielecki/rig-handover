import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import type { DigestStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightRow = {
  night: string;
  counts: Record<DigestStatus, number>;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightRow[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Each night on disk with its valid-line counts (from the digest reader). A night the reader
// cannot read gets zero counts, so the row still shows.
function nightRows(runsDir: string): NightRow[] {
  return nightsOnDisk(runsDir).map((night) => {
    const n = readNight(runsDir, night);
    return { night, counts: n ? n.counts : { ok: 0, retry: 0, fail: 0 } };
  });
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightRows(config.runsDir),
  };
}
