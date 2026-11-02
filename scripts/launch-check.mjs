import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.SCRATCH ?? join(root, '.scratch');
mkdirSync(scratch, { recursive: true });

const mode = process.argv[2] ?? 'preview'; // 'dev' | 'preview'
const port = mode === 'dev' ? 4323 : 4322;
const distLab = join(root, 'dist', 'lab', 'index.html');
const logLines = [];

function log(line) {
  logLines.push(line);
  console.log(line);
}

function hasCombiningMarks(text) {
  return /[\u0300-\u036f]/.test(text);
}

function countCombiningMarks(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0300 && cp <= 0x036f) n++;
  }
  return n;
}

async function fallbackBuiltHtml() {
  if (!existsSync(distLab)) {
    log('launch-check: dist/lab/index.html missing — run build first');
    process.exit(1);
  }
  const html = readFileSync(distLab, 'utf8');
  const hasEngine = html.includes('btn-char-back') && html.includes('id="preview"');
  if (!hasEngine) {
    log('launch-check: built lab HTML missing interactive UI');
    process.exit(1);
  }
  log('launch-check: Playwright unavailable — built HTML fallback OK');
  writeFileSync(join(scratch, `launch-${mode}.log`), logLines.join('\n'), 'utf8');
}

function startServer() {
  const astroBin = join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
  const args =
    mode === 'dev'
      ? ['dev', '--port', String(port), '--force']
      : ['preview', '--port', String(port)];
  return spawn(process.execPath, [astroBin, ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function main() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    log(`launch-check: Playwright import failed: ${err.message}`);
    await fallbackBuiltHtml();
    return;
  }

  log(`launch-check: mode=${mode} port=${port}`);
  const server = startServer();
  server.stderr?.on('data', (d) => log(`[server stderr] ${d.toString().trim()}`));

  const base = `http://localhost:${port}/lab/`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(base);
      if (res.ok) {
        ready = true;
        log(`launch-check: server ready at ${base} (attempt ${i + 1})`);
        break;
      }
      log(`launch-check: attempt ${i + 1} status ${res.status}`);
    } catch (err) {
      if (i % 5 === 4) log(`launch-check: waiting… (${err.message})`);
    }
  }

  if (!ready) {
    server.kill();
    log('launch-check: server did not become ready');
    writeFileSync(join(scratch, `launch-${mode}.log`), logLines.join('\n'), 'utf8');
    process.exit(1);
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const errors = [];

  for (let run = 1; run <= 2; run++) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
    });

    await page.goto(base, { waitUntil: 'networkidle' });
    log(`run ${run}: loaded ${base}`);

    const inputVal = 'test ascii';
    await page.locator('#input').fill(inputVal);
    await page.locator('#intensity').fill('4');
    await page.waitForTimeout(300);

    const preview = await page.locator('#preview').innerText();
    const markCount = countCombiningMarks(preview);
    log(`run ${run}: input="${inputVal}" intensity=4 previewLen=${preview.length} marks=${markCount}`);
    log(`run ${run}: preview sample=${JSON.stringify(preview.slice(0, 80))}`);

    if (preview === inputVal) {
      errors.push(`run ${run}: preview identical to raw input`);
    }
    if (!hasCombiningMarks(preview)) {
      errors.push(`run ${run}: preview missing combining marks U+0300–U+036F`);
    }
    if (consoleErrors.length) {
      errors.push(`run ${run}: ${consoleErrors.join('; ')}`);
      log(`run ${run}: console errors: ${consoleErrors.join('; ')}`);
    } else {
      log(`run ${run}: zero page/console errors`);
    }

    const shot = join(scratch, mode === 'dev' ? `lab-dev-launch${run}.png` : `lab-launch${run}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    log(`run ${run}: screenshot ${shot}`);
    await page.close();
  }

  await browser.close();
  server.kill();

  if (errors.length) {
    log(`launch-check FAILED: ${errors.join('; ')}`);
    writeFileSync(join(scratch, `launch-${mode}.log`), logLines.join('\n'), 'utf8');
    process.exit(1);
  }

  log(`launch-check: OK (${mode}, 2 runs, combining marks in preview, zero errors)`);
  writeFileSync(join(scratch, `launch-${mode}.log`), logLines.join('\n'), 'utf8');
}

main().catch((err) => {
  log(`launch-check fatal: ${err.stack ?? err}`);
  writeFileSync(join(scratch, `launch-${mode}.log`), logLines.join('\n'), 'utf8');
  process.exit(1);
});