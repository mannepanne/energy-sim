// ABOUT: Hello-world page for the stack spike: fetches the register and weather, runs the engine in a module worker
// ABOUT: Shows each setup's central running cost and carbon on the price cap for the reference house

import Head from 'next/head';
import { useEffect, useState } from 'react';
import type { CentralRow } from '../src/centralRun.ts';
import type { WorkerReply } from '../src/engine.worker.ts';

type State = { kind: 'working' } | { kind: 'done'; rows: CentralRow[]; ms: number } | { kind: 'failed'; message: string };

const SETUP_NAMES: Record<CentralRow['setup'], string> = {
  gas: 'Gas boiler',
  gasSolar: 'Gas boiler with solar',
  heatPump: 'Heat pump',
  heatPumpSolar: 'Heat pump with solar',
};

const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status})`);
  return response.json() as Promise<unknown>;
}

export default function Home() {
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    const worker = new Worker(new URL('../src/engine.worker.ts', import.meta.url), { type: 'module' });
    const started = performance.now();
    worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      setState(reply.ok ? { kind: 'done', rows: reply.rows, ms: performance.now() - started } : { kind: 'failed', message: reply.message });
    });
    Promise.all([fetchJson('/data/register.json'), fetchJson('/data/pvgis-tmy-london.json')])
      .then(([register, weather]) => worker.postMessage({ register, weather }))
      .catch((error: unknown) => setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
    return () => worker.terminate();
  }, []);

  return (
    <>
      <Head>
        <title>energy-sim (beta)</title>
      </Head>
      <main>
        <h1>energy-sim: stack spike</h1>
        <p>A 1930s semi in London, central values on the price cap, computed in your browser.</p>
        {state.kind === 'working' && <p aria-live="polite">Working it out…</p>}
        {state.kind === 'failed' && <p role="alert">{state.message}</p>}
        {state.kind === 'done' && (
          <table>
            <thead>
              <tr>
                <th scope="col">Setup</th>
                <th scope="col">Running cost a year</th>
                <th scope="col">Carbon a year (kg)</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.setup}>
                  <th scope="row">{SETUP_NAMES[row.setup]}</th>
                  <td>{pounds.format(row.totalPounds)}</td>
                  <td>{whole.format(row.carbonKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {state.kind === 'done' && <p>Worked out in {whole.format(state.ms)} ms.</p>}
        <p>These are estimates for a typical house of this kind in London, not advice for your home, and not financial advice.</p>
      </main>
    </>
  );
}
