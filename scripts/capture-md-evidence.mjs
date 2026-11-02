import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.SCRATCH ?? join(root, '.scratch');
mkdirSync(scratch, { recursive: true });

const demoPath = join(root, 'dist', 'demo', 'breach-headline', 'index.html');
const mdxPath = join(root, 'dist', 'demo', 'breach-promo', 'index.html');

if (!existsSync(demoPath) || !existsSync(mdxPath)) {
  console.error('capture-md-evidence: run npm run build first');
  process.exit(1);
}

function captureMd(html, demoPath) {
  const lines = [
    '=== dist/demo/breach-headline/index.html evidence ===',
    `file: ${demoPath}`,
    `length: ${html.length}`,
    '',
    '--- checks ---',
    `has source text: ${html.includes('the breach is real')}`,
    `has CHAR-BACK mirror (ɘ): ${html.includes('ɘ')}`,
    `has combining marks U+0300-U+036F: ${/[\u0300-\u036f]/.test(html)}`,
    `has corrupted-output id: ${html.includes('corrupted-output')}`,
    '',
    '--- excerpt: source panel ---',
  ];

  const sourceMatch = html.match(/Source \(markdown body\)<\/h2><p[^>]*>([^<]+)/);
  if (sourceMatch) lines.push(`source panel: ${sourceMatch[1]}`);

  const charBackMatch = html.match(/CHAR-BACK transform[^<]*<\/h2><p[^>]*>([^<]+)/);
  if (charBackMatch) lines.push(`char-back panel: ${charBackMatch[1]}`);

  const corruptMatch = html.match(/id="corrupted-output"[^>]*>([^<]+)/);
  if (corruptMatch) {
    lines.push(`corrupted output (first 120 chars): ${corruptMatch[1].slice(0, 120)}`);
    let marks = 0;
    for (const ch of corruptMatch[1]) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x0300 && cp <= 0x036f) marks++;
    }
    lines.push(`combining marks in corrupted output: ${marks}`);
  }

  lines.push('', '--- raw HTML tail (corrupted panel region) ---');
  const idx = html.indexOf('corrupted-output');
  if (idx >= 0) lines.push(html.slice(idx, idx + 400));

  return lines;
}

function captureMdx(html, mdxPath) {
  const zalgoSpans = [...html.matchAll(/data-zalgo[^>]*>([^<]+)/g)].map((m) => m[1]);
  const lines = [
    '=== dist/demo/breach-promo/index.html evidence ===',
    `file: ${mdxPath}`,
    `length: ${html.length}`,
    '',
    '--- checks ---',
    `has mdx-content id: ${html.includes('id="mdx-content"')}`,
    `has plain prose: ${html.includes('Security bulletin')}`,
    `has data-zalgo spans: ${html.includes('data-zalgo')}`,
    `zalgo span count: ${zalgoSpans.length}`,
    `has combining marks in zalgo output: ${zalgoSpans.some((s) => /[\u0300-\u036f]/.test(s))}`,
    '',
    '--- zalgo span excerpts ---',
  ];

  for (const [i, span] of zalgoSpans.entries()) {
    lines.push(`span ${i + 1} (first 80 chars): ${span.slice(0, 80)}`);
  }

  lines.push('', '--- raw HTML (mdx-content region) ---');
  const idx = html.indexOf('id="mdx-content"');
  if (idx >= 0) lines.push(html.slice(idx, idx + 600));

  return lines;
}

const mdHtml = readFileSync(demoPath, 'utf8');
const mdxHtml = readFileSync(mdxPath, 'utf8');

const mdOut = join(scratch, 'md-build-snippet.txt');
const mdxOut = join(scratch, 'mdx-build-snippet.txt');
writeFileSync(mdOut, captureMd(mdHtml, demoPath).join('\n'), 'utf8');
writeFileSync(mdxOut, captureMdx(mdxHtml, mdxPath).join('\n'), 'utf8');
console.log(`capture-md-evidence: wrote ${mdOut}`);
console.log(`capture-md-evidence: wrote ${mdxOut}`);