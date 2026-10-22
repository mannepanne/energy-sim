// ABOUT: Module web worker that runs the engine off the main thread
// ABOUT: Receives the data the page has already fetched and posts back the central rows, or an error message

import { centralOnCap, type CentralData, type CentralRow } from './centralRun.ts';

export type WorkerReply = { ok: true; rows: CentralRow[] } | { ok: false; message: string };

self.addEventListener('message', (event: MessageEvent<CentralData>) => {
  let reply: WorkerReply;
  try {
    reply = { ok: true, rows: centralOnCap(event.data) };
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
});
