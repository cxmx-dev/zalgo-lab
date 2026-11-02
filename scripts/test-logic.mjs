import {
  buildOutput,
  charBack,
  countCombiningMarks,
  createSeededRng,
  mirrorChar,
} from '../src/lib/zalgo-engine.mjs';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('Zalgo — logic tests\n');

// CHAR-BACK mirror
assert(mirrorChar('e') === 'ɘ', 'mirrorChar e → ɘ');
const cb = charBack('!e(');
assert(cb.includes('ɘ'), 'charBack contains mirrored ɘ');
assert(cb === ')ɘ¡', `charBack !e( → )ɘ¡ (got ${cb})`);

// Intensity increases mark density (seeded)
const seed = 12345;
const rngLo = createSeededRng(seed);
const rngHi = createSeededRng(seed);
const text = 'abc';
const outLo = buildOutput(text, 1, { rng: rngLo });
const outHi = buildOutput(text, 5, { rng: rngHi });
const marksLo = countCombiningMarks(outLo);
const marksHi = countCombiningMarks(outHi);
assert(marksHi > marksLo, `intensity 5 yields more marks than 1 (${marksHi} > ${marksLo})`);
assert(marksLo === 3, `intensity 1 on 3 chars → 3 marks (got ${marksLo})`);
assert(marksHi === 15, `intensity 5 on 3 chars → 15 marks (got ${marksHi})`);

// buildOutput layer/reverse configs differ
const rngA = createSeededRng(99);
const rngB = createSeededRng(99);
const rngC = createSeededRng(99);
const raw = 'word';
const forward = buildOutput(raw, 3, { rng: rngA });
const charBackOut = buildOutput(raw, 3, { charBack: true, rng: rngB });
const zrev = buildOutput(raw, 3, { layerMode: 'zalgo-then-reverse', charBack: true, rng: rngC });
assert(forward !== charBackOut, 'forward vs charBack produce different output');
assert(charBackOut !== zrev, 'charBack vs zalgo-then-reverse+charBack differ');
assert(countCombiningMarks(forward) > 0, 'forward output has combining marks');

// bleed mode
const rngBleed = createSeededRng(7);
const bleedOut = buildOutput('abcdefgh', 2, { layerMode: 'bleed', bleedDecay: 0.3, rng: rngBleed });
assert(countCombiningMarks(bleedOut) > 0, 'bleed mode adds combining marks');

// terminal mode
const rngTerm = createSeededRng(11);
const termOut = buildOutput('hi', 3, { terminal: true, rng: rngTerm });
assert(countCombiningMarks(termOut) >= 14, `terminal mode heavy marks (got ${countCombiningMarks(termOut)})`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);