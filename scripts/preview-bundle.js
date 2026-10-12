import { build } from 'esbuild';

// Shared by the preview server and its browser dependency check.
export function buildPreview() {
  return build({ entryPoints: ['preview/preview.js'], bundle: true, format: 'esm', platform: 'browser', write: false,
    alias: { 'node:events': './preview/events.js' } });
}
