// Copies the OpenAPI snapshot from a sibling backend checkout, then regenerates types.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const dir = resolve(process.env.DMS_BACKEND_DIR ?? '../enterprise-dms-backend');
const src = resolve(dir, 'docs/api/openapi.json');
if (!existsSync(src)) {
  console.error(`OpenAPI spec not found at ${src}. Set DMS_BACKEND_DIR.`);
  process.exit(1);
}
copyFileSync(src, resolve('openapi/openapi.json'));
console.log(`Copied ${src} -> openapi/openapi.json`);
execSync('npm run api:types', { stdio: 'inherit' });
