import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';

await mkdir('dist/obsidian-noter', { recursive: true });
await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'cjs', platform: 'node',
  target: 'es2022', external: ['obsidian'], outfile: 'main.js',
  logLevel: 'warning', sourcemap: false,
});
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/obsidian-noter/${name}`);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
process.stdout.write(`Built ${manifest.name} ${manifest.version}: main.js in the repository root and plugin files in dist/obsidian-noter/\n`);
