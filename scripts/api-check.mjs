// Fails when src/lib/api-client/schema.d.ts is out of date with openapi/openapi.json.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const tmp = mkdtempSync(join(tmpdir(), 'dms-api-'));
const out = join(tmp, 'schema.d.ts');
try {
  execSync(`npx openapi-typescript openapi/openapi.json -o "${out}"`, { stdio: 'pipe' });
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const fresh = norm(readFileSync(out, 'utf8'));
  const committed = norm(readFileSync('src/lib/api-client/schema.d.ts', 'utf8'));
  if (fresh !== committed) {
    console.error('API type drift: run `npm run api:types` and commit the result.');
    process.exit(1);
  }
  console.log('API types are up to date.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
