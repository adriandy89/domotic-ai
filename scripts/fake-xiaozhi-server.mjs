#!/usr/bin/env node
/**
 * Local stand-in for wss://api.xiaozhi.me/mcp/?token=...
 *
 * Behaviour:
 *  - On every WS connection, drives the standard MCP sequence:
 *      1. initialize
 *      2. tools/list
 *      3. tools/call get-weather { location: "Madrid" }
 *  - Logs every response from the backend.
 *  - Replies to ping with pong (built into ws by default).
 *
 * Run:  node scripts/fake-xiaozhi-server.mjs [port]
 *       (default port 9999)
 */
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? 9999);
const wss = new WebSocketServer({ port });

console.log(`fake xiaozhi listening on ws://localhost:${port}`);

wss.on('connection', (ws, req) => {
  console.log(`[+] client connected url=${req.url}`);
  let id = 0;

  ws.on('message', (buf) => {
    const text = buf.toString('utf8').trim();
    if (!text) return;
    try {
      const msg = JSON.parse(text);
      console.log('<-', JSON.stringify(msg));
    } catch {
      console.log('<- (unparsed)', text);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[x] client closed code=${code} reason=${reason?.toString()}`);
  });

  const send = (obj) => {
    const line = JSON.stringify(obj);
    console.log('->', line);
    ws.send(line);
  };

  // Sequence
  setTimeout(
    () => send({ jsonrpc: '2.0', id: ++id, method: 'initialize', params: {} }),
    50,
  );
  setTimeout(
    () =>
      send({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} }),
    250,
  );
  setTimeout(
    () =>
      send({
        jsonrpc: '2.0',
        id: ++id,
        method: 'tools/call',
        params: {
          name: 'get-weather',
          arguments: { location: 'Madrid' },
        },
      }),
    450,
  );
});
