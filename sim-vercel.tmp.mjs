// Simulates Vercel: wraps the api/index.js handler in a plain Node server
import { createServer } from 'node:http';
import handler from './api/index.js';

const server = createServer((req, res) => handler(req, res));
server.listen(4100, () => console.log('serverless sim on :4100'));

setTimeout(async () => {
  const hit = async (path) => {
    const res = await fetch(`http://localhost:4100${path}`);
    const text = await res.text();
    console.log(`${path} -> ${res.status} ${text.slice(0, 160)}`);
  };
  await hit('/healthz');
  await hit('/api/system/status');
  await hit('/api/nonexistent');
  server.close();
}, 1500);
