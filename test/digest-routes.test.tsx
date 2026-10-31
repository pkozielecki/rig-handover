import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';
import type { DigestRow, DigestStatus } from '../src/digest/types.js';

const FIXTURE_NIGHT = '2026-10-28';
const MISSING_NIGHT = '2026-01-01';
const FIXTURE_JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

type DigestJson = {
  night: string;
  rows: DigestRow[];
  counts: Record<DigestStatus, number>;
  badLines: number;
};

function configFor(runsDir: string) {
  return { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
}

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

// Where the job's cell starts. A flagged row has "⚠ " in front of the job name.
function jobCellAt(html: string, job: string): number {
  const plain = html.indexOf(`>${job}<`);
  return plain >= 0 ? plain : html.indexOf(`>⚠ ${job}<`);
}

// The table row (<tr>...</tr>) that holds the job's cell.
function rowHtml(html: string, job: string): string {
  const at = jobCellAt(html, job);
  if (at === -1) throw new Error(`no row for ${job} in page`);
  const start = html.lastIndexOf('<tr', at);
  const end = html.indexOf('</tr>', at);
  return html.slice(start, end);
}

// The listed jobs, in the order they appear on the page.
function pageJobOrder(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: jobCellAt(html, job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

const WARN = /class="[^"]*\bwarn\b[^"]*"/;

describe('GET /digest/:night (page)', () => {
  const app = createApp(configFor('runs'));

  it('answers 200 for a normal night and renders all 5 jobs in job order', async () => {
    const res = await app.request(`/digest/${FIXTURE_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobOrder(html, FIXTURE_JOBS)).toEqual(FIXTURE_JOBS);
  });

  it('marks rows with 3 or more retries and rows that failed with the warn class, and no others', async () => {
    const html = await (await app.request(`/digest/${FIXTURE_NIGHT}`)).text();
    // fixtures/refresh has 3 retries; notes/backup failed.
    expect(rowHtml(html, 'fixtures/refresh')).toMatch(WARN);
    expect(rowHtml(html, 'notes/backup')).toMatch(WARN);
    // lane/sync has 1 retry and ends ok; rig/rotate-logs and digest/render are clean.
    expect(rowHtml(html, 'lane/sync')).not.toMatch(WARN);
    expect(rowHtml(html, 'rig/rotate-logs')).not.toMatch(WARN);
    expect(rowHtml(html, 'digest/render')).not.toMatch(WARN);
  });

  it('renders a null owner as the dash', async () => {
    const html = await (await app.request(`/digest/${FIXTURE_NIGHT}`)).text();
    expect(rowHtml(html, 'digest/render')).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('answers 200 and says "nothing ran" for an empty night', async () => {
    const dir = tempRuns({ '2026-02-01.jsonl': '' });
    const res = await createApp(configFor(dir)).request('/digest/2026-02-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('answers 200 with the valid rows when a line is bad', async () => {
    const dir = tempRuns({
      '2026-02-02.jsonl': [
        '{"at":"2026-02-02T01:00:00+01:00","job":"b/second","status":"ok","owner":"rook"}',
        'this is not json',
        '{"at":"2026-02-02T02:00:00+01:00","job":"a/first","status":"fail","owner":"rook","error":"boom"}',
      ].join('\n'),
    });
    const res = await createApp(configFor(dir)).request('/digest/2026-02-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobOrder(html, ['a/first', 'b/second'])).toEqual(['a/first', 'b/second']);
    expect(rowHtml(html, 'a/first')).toMatch(WARN);
  });

  it('lists the same jobs in the same order as the JSON route', async () => {
    const page = await (await app.request(`/digest/${FIXTURE_NIGHT}`)).text();
    const json = (await (await app.request(`/api/digest/${FIXTURE_NIGHT}`)).json()) as DigestJson;
    const jsonJobs = json.rows.map((r) => r.job);
    expect(pageJobOrder(page, jsonJobs)).toEqual(jsonJobs);
    expect(jsonJobs).toEqual(FIXTURE_JOBS);
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  const app = createApp(configFor('runs'));

  it('answers 200 with { night, rows, counts, badLines } for a normal night', async () => {
    const res = await app.request(`/api/digest/${FIXTURE_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'night', 'rows']);
    expect(body.night).toBe(FIXTURE_NIGHT);
    expect(body.rows).toEqual(readNight('runs', FIXTURE_NIGHT)!.rows);
    expect(body.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(body.badLines).toBe(1);
  });

  it('answers 404 with { "error": "not found" } for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('answers 200 with no rows for an empty night', async () => {
    const dir = tempRuns({ '2026-02-01.jsonl': '' });
    const res = await createApp(configFor(dir)).request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body).toEqual({ night: '2026-02-01', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 });
  });

  it('answers 200 with the valid rows and counts the bad line', async () => {
    const dir = tempRuns({
      '2026-02-02.jsonl': [
        '{"at":"2026-02-02T01:00:00+01:00","job":"b/second","status":"ok","owner":"rook"}',
        'this is not json',
        '{"at":"2026-02-02T02:00:00+01:00","job":"a/first","status":"fail","owner":"rook","error":"boom"}',
      ].join('\n'),
    });
    const res = await createApp(configFor(dir)).request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.rows.map((r) => r.job)).toEqual(['a/first', 'b/second']);
    expect(body.badLines).toBe(1);
    expect(body.counts).toEqual({ ok: 1, retry: 0, fail: 1 });
  });
});
