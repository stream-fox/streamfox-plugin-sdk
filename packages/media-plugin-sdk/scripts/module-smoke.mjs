import { createRequire } from 'node:module';

const esm = await import('../dist/index.js');
if (typeof esm.createPlugin !== 'function') {
  throw new Error('ESM build missing createPlugin export');
}

const require = createRequire(import.meta.url);
const cjs = require('../dist/index.cjs');
if (typeof cjs.createPlugin !== 'function') {
  throw new Error('CJS build missing createPlugin export');
}

console.log('Module smoke test passed');
