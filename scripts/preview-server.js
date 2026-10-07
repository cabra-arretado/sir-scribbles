import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const result = await build({ entryPoints: ['preview/preview.js'], bundle: true, format: 'esm', platform: 'browser', write: false });
const html = await readFile('preview/index.html');
const styles = await readFile('styles.css');
const routes = new Map([
  ['/', ['text/html', html]],
  ['/preview.js', ['text/javascript', result.outputFiles[0].contents]],
  ['/styles.css', ['text/css', styles]],
]);
createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': route[0], 'Cache-Control': 'no-store' });
  response.end(route[1]);
}).listen(8787, '127.0.0.1', () => process.stdout.write('UI fixtures: http://127.0.0.1:8787 (no agent process)\n'));
