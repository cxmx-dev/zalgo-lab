import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distLab = join(root, 'dist', 'lab', 'index.html');
const distDemo = join(root, 'dist', 'demo', 'breach-headline', 'index.html');
const distMdx = join(root, 'dist', 'demo', 'breach-promo', 'index.html');
const distIndex = join(root, 'dist', 'index.html');

if (existsSync(join(root, 'dist'))) {
  rmSync(join(root, 'dist'), { recursive: true, force: true });
}

execSync('npm run build', { cwd: root, stdio: 'inherit' });

for (const [label, path] of [
  ['dist/index.html', distIndex],
  ['dist/lab/index.html', distLab],
  ['dist/demo/breach-headline/index.html', distDemo],
  ['dist/demo/breach-promo/index.html', distMdx],
]) {
  if (!existsSync(path)) {
    console.error(`verify-build: ${label} missing after build`);
    process.exit(1);
  }
}

const labHtml = readFileSync(distLab, 'utf8');
const labHasUi =
  labHtml.includes('Zalgo Lab') &&
  labHtml.includes('id="preview"') &&
  labHtml.includes('id="intensity"');
if (!labHasUi) {
  console.error('verify-build: lab page missing expected interactive UI');
  process.exit(1);
}

const demoHtml = readFileSync(distDemo, 'utf8');
const hasCombining = /[\u0300-\u036f]/.test(demoHtml);
const hasCharBack = demoHtml.includes('ɘ') || demoHtml.includes(')ɘ');
if (!hasCombining && !hasCharBack) {
  console.error('verify-build: demo page missing corrupted output');
  process.exit(1);
}

const mdxHtml = readFileSync(distMdx, 'utf8');
const mdxHasZalgo = mdxHtml.includes('data-zalgo');
const mdxHasCombining = /data-zalgo[^>]*>[^<]*[\u0300-\u036f]/.test(mdxHtml);
const mdxHasPlainProse =
  mdxHtml.includes('Security bulletin') && mdxHtml.includes('Recovery channels remain open');
if (!mdxHasZalgo || !mdxHasCombining || !mdxHasPlainProse) {
  console.error('verify-build: MDX demo missing <Zalgo> marks or uncorrupted prose');
  process.exit(1);
}

console.log('verify-build: OK');