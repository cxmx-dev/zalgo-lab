/**
 * Pure Zalgo corruption engine — extracted from canonical Zalgo Lab
 * (`index.html` at the project root). Injectable RNG for tests.
 */

export const TERMINAL_CHARS = '░▒▓█▀▄▌▐┌┐└┘├┤┬┴┼│─';

export const MIRROR = {
  a: 'ɐ', b: 'd', c: 'ɔ', d: 'b', e: 'ɘ', f: 'ɟ',
  g: 'ᵷ', h: 'ʜ', i: 'i', j: 'ꞁ', k: 'ʞ', l: 'l',
  m: 'ɯ', n: 'u', o: 'o', p: 'q', q: 'p', r: 'ɹ',
  s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x',
  y: 'ʎ', z: 'z',
  A: '∀', B: 'ꓭ', C: 'Ɔ', D: 'ꓷ', E: 'Ǝ', F: 'Ⅎ',
  G: 'פ', H: 'H', I: 'I', J: 'ſ', K: 'ʞ', L: '|',
  M: 'W', N: 'N', O: 'O', P: 'Ԁ', Q: 'Ό', R: 'ᴚ',
  S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X',
  Y: '⅄', Z: 'Z',
  '0': '0', '1': '⇂', '2': 'ς', '3': 'Ɛ', '4': 'ㄣ', '5': '߸',
  '6': '9', '7': 'ㄥ', '8': '8', '9': '6',
  '!': '¡', '¡': '!', '?': '¿', '¿': '?',
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
  '<': '>', '>': '<', '/': '\\', '\\': '/',
  ',': '\u2018', '.': '\u02D9', ';': ':', ':': ';',
  '"': '\u201C', "'": '\u2018', '&': '\u214B', '%': '\u2030',
  '@': '\u0259', '#': '\u266F', '$': '\uFFE5', '^': '˅', '_': '\u203E',
  '+': '+', '-': '-', '=': '=', '*': '*', '~': '~', '`': '\u02CB',
};

const MARKS = Array.from({ length: 0x70 }, (_, i) => String.fromCharCode(0x0300 + i));

/** @returns {string[]} */
export function getMarks() {
  return MARKS;
}

/** Mulberry32 — deterministic RNG for unit tests */
export function createSeededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mirrorChar(char) {
  return MIRROR[char] ?? char;
}

export function charBack(text) {
  return Array.from(text).reverse().map(mirrorChar).join('');
}

export function backWords(text) {
  const words = text.trim().split(/\s+/);
  if (!words.length || (words.length === 1 && words[0] === '')) return text;
  return words
    .reverse()
    .map((word) => Array.from(word).reverse().join(''))
    .join(' ');
}

/**
 * @param {string} text
 * @param {{ charBack?: boolean; backWords?: boolean }} modes
 */
export function applyReverseModes(text, modes = {}) {
  if (modes.charBack) return charBack(text);
  if (modes.backWords) return backWords(text);
  return text;
}

/**
 * @param {string} text
 * @param {number} intensity
 * @param {() => number} rng
 */
export function makeZalgo(text, intensity, rng = Math.random) {
  const marks = MARKS;
  const ml = marks.length;
  const parts = [];
  for (const char of text) {
    parts.push(char);
    for (let i = 0; i < intensity; i++) parts.push(marks[(rng() * ml) | 0]);
  }
  return parts.join('');
}

function createTerminalBlockState(rng) {
  return { sinceBlock: 0, nextBlock: 4 + Math.floor(rng() * 5) };
}

function maybeAppendTerminalBlock(char, state, shouldSprinkle, rng) {
  if (!shouldSprinkle || !char.trim()) return { block: '', state };
  const next = { ...state, sinceBlock: state.sinceBlock + 1 };
  if (next.sinceBlock >= next.nextBlock) {
    return {
      block: TERMINAL_CHARS[Math.floor(rng() * TERMINAL_CHARS.length)],
      state: { sinceBlock: 0, nextBlock: 4 + Math.floor(rng() * 5) },
    };
  }
  return { block: '', state: next };
}

export function makeTerminalZalgo(text, intensity, rng = Math.random) {
  const marks = MARKS;
  const ml = marks.length;
  const heavy = Math.max(intensity, 7);
  const parts = [];
  let blockState = createTerminalBlockState(rng);

  for (const char of text) {
    parts.push(char);
    const markCount = heavy + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < markCount; i++) parts.push(marks[(rng() * ml) | 0]);
    const sprinkled = maybeAppendTerminalBlock(char, blockState, true, rng);
    if (sprinkled.block) parts.push(sprinkled.block);
    blockState = sprinkled.state;
  }
  return parts.join('');
}

export function applyZalgo(text, intensity, options = {}) {
  const { terminal = false, rng = Math.random } = options;
  return terminal ? makeTerminalZalgo(text, intensity, rng) : makeZalgo(text, intensity, rng);
}

export function makeBleedZalgo(text, intensity, edgeFraction = 0.3, options = {}) {
  const { terminal = false, rng = Math.random } = options;
  const chars = Array.from(text);
  const len = chars.length;
  const edgeLen = Math.max(1, Math.ceil(len * edgeFraction));
  const marks = MARKS;
  const ml = marks.length;
  const parts = [];
  let blockState = createTerminalBlockState(rng);

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const inEdge = i < edgeLen || i >= len - edgeLen;
    const markIntensity = inEdge ? Math.min(intensity + 2, 8) : intensity;

    let markCount = markIntensity;
    if (terminal && inEdge) {
      markCount = Math.max(markIntensity, 7) + (rng() < 0.4 ? 1 : 0);
    }
    parts.push(char);
    for (let j = 0; j < markCount; j++) parts.push(marks[(rng() * ml) | 0]);
    const sprinkled = maybeAppendTerminalBlock(char, blockState, terminal && inEdge, rng);
    if (sprinkled.block) parts.push(sprinkled.block);
    blockState = sprinkled.state;
  }
  return parts.join('');
}

/**
 * @typedef {Object} BuildOptions
 * @property {boolean} [charBack]
 * @property {boolean} [backWords]
 * @property {boolean} [terminal]
 * @property {'reverse-then-zalgo'|'zalgo-then-reverse'|'bleed'} [layerMode]
 * @property {number} [bleedDecay]
 * @property {() => number} [rng]
 */

/**
 * @param {string} rawText
 * @param {number} intensity
 * @param {BuildOptions} [options]
 */
export function buildOutput(rawText, intensity, options = {}) {
  const {
    charBack: cb = false,
    backWords: bw = false,
    terminal = false,
    layerMode = 'reverse-then-zalgo',
    bleedDecay = 0.3,
    rng = Math.random,
  } = options;

  const reverseModes = { charBack: cb, backWords: bw };
  const zalgoOpts = { terminal, rng };

  if (layerMode === 'zalgo-then-reverse') {
    return applyReverseModes(applyZalgo(rawText, intensity, zalgoOpts), reverseModes);
  }
  if (layerMode === 'bleed') {
    return makeBleedZalgo(applyReverseModes(rawText, reverseModes), intensity, bleedDecay, zalgoOpts);
  }
  return applyZalgo(applyReverseModes(rawText, reverseModes), intensity, zalgoOpts);
}

/** Count Unicode combining marks (U+0300–U+036F) in a string */
export function countCombiningMarks(text) {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0300 && cp <= 0x036f) n++;
  }
  return n;
}