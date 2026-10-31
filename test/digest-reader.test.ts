import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('has 5 jobs sorted by job and counts the 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
  });

  it('keeps the row of a job with a null owner', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render')!;
    expect(row.owner).toBeNull();
  });

  it('counts runs and retries and keeps the last error and the offsets', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('reports a failed job', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup')!;
    expect(row.lastStatus).toBe('fail');
    expect(row.lastError).toBe('quota exceeded');
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for anything that is not a YYYY-MM-DD night', () => {
    expect(readNight('runs', '../package')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('renders an empty file as no rows', () => {
    const dir = tempRuns({ '2026-02-01.jsonl': '' });
    expect(readNight(dir, '2026-02-01')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts lines that parse but have the wrong shape, and skips blank lines', () => {
    const dir = tempRuns({
      '2026-02-02.jsonl': [
        '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '',
        '{"at":"2026-02-02T02:00:00+01:00","job":"a","status":"weird"}',
        '[1,2]',
        'not json',
        '{"at":"2026-02-02T03:00:00+01:00","job":"a","status":"ok"}',
      ].join('\n'),
    });
    const night = readNight(dir, '2026-02-02')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]).toMatchObject({ job: 'a', runs: 2, retries: 0, owner: 'x' });
  });
});
