// The job's feed: every event goes to events.jsonl and to the browsers watching, over SSE.
//   GET /events          SSE: replays every event (or from Last-Event-ID), then follows. The contract is web/src/lib/events.ts
//   GET /files/<path>    a file of the job folder (stills, the video, the poster), with Range for the video
// Same server on the PC (PIPELINE=local) and in the CreateOS sandbox, where ingress makes it public.
import { createServer } from 'node:http';
import { appendFileSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.json': 'application/json',
  '.js': 'text/javascript', '.html': 'text/html', '.txt': 'text/plain', '.jsonl': 'application/x-ndjson',
};

export function createFeed({ dir, port = 0, host = '127.0.0.1' }) {
  const events = [];
  const clients = new Set();
  const t0 = Date.now();
  const log = join(dir, 'events.jsonl');

  function emit(e) {
    const ev = { at: +((Date.now() - t0) / 1000).toFixed(2), ...e };
    events.push(ev);
    try {
      appendFileSync(log, JSON.stringify(ev) + '\n');
    } catch {}
    const id = events.length - 1;
    for (const res of clients) res.write(`id: ${id}\ndata: ${JSON.stringify(ev)}\n\n`);
    return ev;
  }

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'last-event-id, range', 'access-control-expose-headers': 'content-range, accept-ranges, content-length' };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (url.pathname === '/health') return res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, events: events.length }));
    if (url.pathname === '/events' || url.pathname.startsWith('/events/')) {
      res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 2000\n\n');
      const from = Number(req.headers['last-event-id'] ?? -1) + 1;
      for (let i = Math.max(0, from); i < events.length; i++) res.write(`id: ${i}\ndata: ${JSON.stringify(events[i])}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    if (url.pathname.startsWith('/files/')) {
      const rel = normalize(decodeURIComponent(url.pathname.slice(7)));
      const file = resolve(dir, rel);
      if (!file.startsWith(resolve(dir) + sep) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404, cors).end('not found');
      const size = statSync(file).size, type = TYPES[extname(file)] ?? 'application/octet-stream';
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { ...cors, 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
        return createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...cors, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' });
      return createReadStream(file).pipe(res);
    }
    res.writeHead(404, cors).end('not found');
  });

  const ready = new Promise((ok) => server.listen(port, host, () => ok(server.address().port)));
  return {
    emit,
    events,
    ready,
    close: () => {
      for (const res of clients) res.end();
      server.close();
    },
  };
}
