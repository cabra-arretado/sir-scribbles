import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Rebuild on every request so edits to src/ and styles.css show on reload.
const routes = new Map([
  ['/', async () => ['text/html', await readFile('preview/index.html')]],
  ['/preview.js', async () => {
    const result = await build({ entryPoints: ['preview/preview.js'], bundle: true, format: 'esm', platform: 'browser', write: false,
      alias: { 'node:events': './preview/events.js' } });
    return ['text/javascript', result.outputFiles[0].contents];
  }],
  ['/styles.css', async () => ['text/css', await readFile('styles.css')]],
]);
const port = Number(process.env.PORT) || 8787;
createServer(async (request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404); response.end(); return; }
  try {
    const [type, body] = await route();
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end(String(error));
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`UI fixtures: http://127.0.0.1:${port} (no agent process)\n`));
