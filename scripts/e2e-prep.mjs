// Stops stale `next dev` servers left over from earlier E2E runs of this checkout (Playwright cannot always
// reap the child of `npx` on Windows), so the dev-server lock and the E2E port are free.
import { execSync } from 'node:child_process';

try {
  if (process.platform === 'win32') {
    const filter = "$_.CommandLine -like '*enterprise-dms-frontend*start-server.js*'";
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { ${filter} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
      { stdio: 'ignore' },
    );
  } else {
    execSync('pkill -f "enterprise-dms-frontend.*start-server" || true', { stdio: 'ignore' });
  }
} catch {
  /* nothing to stop */
}
