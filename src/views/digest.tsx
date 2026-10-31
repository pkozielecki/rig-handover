import type { DigestRow, Night } from '../digest/types.js';

// A row is flagged on 3+ retries or a failed last status. The ⚠ in the job cell keeps the flag
// visible in plain HTML, where the colour of `warn` is not seen (ADR 0001).
const flagged = (row: DigestRow) => row.retries >= 3 || row.lastStatus === 'fail';

// Missing data renders as "—", never an empty cell (styleguide).
const orDash = (value: string | null) => value ?? '—';

export function DigestPage({ night, data }: { night: string; data: Night }) {
  const { rows, badLines } = data;
  return (
    <>
      <h1>digest {night}</h1>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr class={flagged(row) ? 'warn' : undefined}>
                <td>{flagged(row) ? `⚠ ${row.job}` : row.job}</td>
                <td>{orDash(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{orDash(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 && (
        <p class="mute">
          {badLines} bad {badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      )}
    </>
  );
}
