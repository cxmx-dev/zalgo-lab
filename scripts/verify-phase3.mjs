/**
 * Phase 3+ verification — drives index.html via Playwright.
 * Run: node scripts/verify-phase3.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = path.join(root, 'index.html');
const scratch = process.env.ZALGO_SCRATCH || path.join(os.tmpdir(), 'zalgo-lab-verify');
const invocation = process.env.ZALGO_INVOCATION || 'inv-default';

fs.mkdirSync(scratch, { recursive: true });

const errors = [];
const log = [];

const BLEED_EVAL = `(() => {
  function bleedEdgeVsCenterDensity(text, intensity, edgeFraction) {
    const out = makeBleedZalgo(text, intensity, edgeFraction);
    const len = Array.from(text).length;
    const edgeLen = Math.max(1, Math.ceil(len * edgeFraction));
    let edgeMarks = 0;
    let centerMarks = 0;
    let charIdx = -1;
    for (let i = 0; i < out.length;) {
      const cp = out.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      if (cp < 0x0300 || cp > 0x036F) {
        charIdx++;
        i += ch.length;
      } else {
        const inEdge = charIdx < edgeLen || charIdx >= len - edgeLen;
        if (inEdge) edgeMarks++; else centerMarks++;
        i += ch.length;
      }
    }
    return { edgeMarks, centerMarks, edgeLen, len };
  }
  const a = bleedEdgeVsCenterDensity('abcdefghijklmnop', 5, 0.5);
  const b = bleedEdgeVsCenterDensity('abcdefghijklmnop', 5, 0.1);
  let wins = 0;
  for (let i = 0; i < 25; i++) {
    const x = bleedEdgeVsCenterDensity('abcdefghijklmnopqrst', 6, 0.5);
    const y = bleedEdgeVsCenterDensity('abcdefghijklmnopqrst', 6, 0.1);
    if (x.edgeMarks > y.edgeMarks) wins++;
  }
  return { edgeLen50: a.edgeLen, edgeLen10: b.edgeLen, wins };
})()`;

async function runSession(label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 920, height: 1100 } });
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`${label} console: ${msg.text()}`);
  });

  await page.goto(`file:///${html.replace(/\\/g, '/')}`);

  const hasDebugFns = await page.evaluate(() => typeof bleedEdgeVsCenterDensity === 'function');
  if (hasDebugFns) errors.push(`${label}: debug functions still exposed`);

  await page.fill('#input', 'sample text for the lab test');
  await page.waitForTimeout(150);
  const previewLen = await page.evaluate(() => document.getElementById('preview').innerText.length);
  log.push(`${label}: preview length = ${previewLen}`);
  if (previewLen === 0) errors.push(`${label}: preview empty on load`);

  const mirrorTest = await page.evaluate(() => ({
    bang: mirrorChar('!'),
    paren: mirrorChar('('),
    loose: mirrorChar('!') !== '!',
  }));
  log.push(`${label}: mirror ${JSON.stringify(mirrorTest)}`);
  if (!mirrorTest.loose) errors.push(`${label}: mirrorChar should transform punctuation`);

  await page.click('#layer-reverse-zalgo');
  await page.fill('#input', '!e(');
  await page.fill('#intensity', '1');
  await page.dispatchEvent('#intensity', 'input');
  await page.click('#btn-char-back');

  const charBackFlow = await page.evaluate(() => {
    const stripMarks = (s) => Array.from(s).filter(ch => {
      const cp = ch.codePointAt(0);
      return cp < 0x0300 || cp > 0x036F;
    }).join('');
    const expectedBase = charBack('!e(');
    const previewBase = stripMarks(document.getElementById('preview').innerText);
    return {
      btnActive: document.getElementById('btn-char-back').classList.contains('active'),
      modeActive: modes.charBack,
      expectedBase,
      previewBase,
      previewLen: document.getElementById('preview').innerText.length,
    };
  });
  log.push(`${label}: char-back flow ${JSON.stringify(charBackFlow)}`);
  if (!charBackFlow.btnActive) errors.push(`${label}: CHAR-BACK button should be active after click`);
  if (!charBackFlow.modeActive) errors.push(`${label}: modes.charBack should be true after UI toggle`);
  if (charBackFlow.previewLen === 0) errors.push(`${label}: preview empty with CHAR-BACK on`);
  if (charBackFlow.previewBase !== charBackFlow.expectedBase) {
    errors.push(`${label}: preview base "${charBackFlow.previewBase}" !== expected "${charBackFlow.expectedBase}"`);
  }

  await page.click('#btn-char-back');
  await page.click('#layer-bleed');
  await page.fill('#input', 'abcdefghijklmnop');
  await page.fill('#intensity', '4');
  await page.dispatchEvent('#intensity', 'input');
  await page.fill('#bleed-decay', '50');
  await page.dispatchEvent('#bleed-decay', 'input');

  const bleedTest = await page.evaluate(BLEED_EVAL);
  log.push(`${label}: bleed density ${JSON.stringify(bleedTest)}`);
  if (bleedTest.edgeLen50 <= bleedTest.edgeLen10) errors.push(`${label}: edgeLen50 should exceed edgeLen10`);
  if (bleedTest.wins < 15) errors.push(`${label}: edge mark density should favor 50% decay (${bleedTest.wins}/25)`);

  await page.fill('#preset-name', 'My Breach Vibe');
  await page.fill('#input', 'named preset test');
  await page.click('#btn-save-preset');
  await page.waitForTimeout(200);

  const options = await page.evaluate(() =>
    Array.from(document.getElementById('preset-select').options).map(o => o.textContent)
  );
  log.push(`${label}: preset options ${JSON.stringify(options)}`);
  const namedOpt = options.find(t => t && t.includes('My Breach Vibe'));
  if (!namedOpt) errors.push(`${label}: named preset not in select`);

  await page.selectOption('#preset-select', '0');
  const loaded = await page.evaluate(() => ({
    input: document.getElementById('input').value,
    name: document.getElementById('preset-name').value,
  }));
  log.push(`${label}: preset load ${JSON.stringify(loaded)}`);
  if (loaded.input !== 'named preset test') errors.push(`${label}: preset input not restored`);
  if (loaded.name !== 'My Breach Vibe') errors.push(`${label}: preset name not restored`);

  await page.selectOption('#preset-select', '0');
  await page.click('#btn-delete-preset');
  await page.waitForTimeout(200);
  const afterDelete = await page.evaluate(() => ({
    count: getPresets().length,
    options: Array.from(document.getElementById('preset-select').options).map(o => o.textContent),
  }));
  log.push(`${label}: after delete ${JSON.stringify(afterDelete)}`);
  if (afterDelete.count !== 0) errors.push(`${label}: preset should be deleted`);
  if (afterDelete.options.some(t => t && t.includes('My Breach Vibe'))) {
    errors.push(`${label}: deleted preset still in select`);
  }

  const presetUi = await page.evaluate(() => ({
    hasSection: !!document.querySelector('.preset-section'),
    hasNameLabel: !!document.querySelector('label.preset-name-label[for="preset-name"]'),
    sectionLabel: document.querySelector('.preset-section-label')?.textContent?.trim() || '',
  }));
  log.push(`${label}: preset UI ${JSON.stringify(presetUi)}`);
  if (!presetUi.hasSection) errors.push(`${label}: preset section container missing`);
  if (!presetUi.hasNameLabel) errors.push(`${label}: preset name label missing`);
  if (!presetUi.sectionLabel.includes('Save')) errors.push(`${label}: preset section label not prominent`);

  await page.click('#layer-reverse-zalgo');
  if (await page.evaluate(() => terminalMode)) await page.click('#btn-terminal');
  await page.fill('#input', 'base');
  await page.fill('#intensity', '1');
  await page.dispatchEvent('#intensity', 'input');
  await page.click('#btn-preview-rendered');

  const classroomDemo = await page.evaluate(() => {
    const countCombining = (s) => {
      let n = 0;
      for (let i = 0; i < s.length;) {
        const cp = s.codePointAt(i);
        if (cp >= 0x0300 && cp <= 0x036F) n++;
        i += cp > 0xffff ? 2 : 1;
      }
      return n;
    };
    const marks = getMarks();
    const renderedAt1 = document.getElementById('preview').innerText;
    const marksAt1 = countCombining(renderedAt1);
    document.getElementById('intensity').value = '4';
    updatePreview();
    const marksAt4 = countCombining(document.getElementById('preview').innerText);
    setPreviewMode(true);
    const rawMarks = countCombining(document.getElementById('preview').textContent);
    return {
      markPoolSize: marks.length,
      firstMark: marks[0].codePointAt(0),
      lastMark: marks[marks.length - 1].codePointAt(0),
      marksAt1,
      marksAt4,
      rawMarks,
      intensityScales: marksAt4 > marksAt1,
      oneMarkPerBaseAt1: marksAt1 >= 4,
    };
  });
  log.push(`${label}: classroom demo ${JSON.stringify(classroomDemo)}`);
  if (classroomDemo.markPoolSize !== 112) errors.push(`${label}: getMarks should expose 112 combining chars (U+0300–U+036F)`);
  if (classroomDemo.firstMark !== 0x0300 || classroomDemo.lastMark !== 0x036F) {
    errors.push(`${label}: mark pool should span U+0300–U+036F`);
  }
  if (!classroomDemo.oneMarkPerBaseAt1) errors.push(`${label}: intensity 1 should add ≥1 combining mark per base letter`);
  if (!classroomDemo.intensityScales) errors.push(`${label}: higher intensity should add more combining marks`);
  if (classroomDemo.rawMarks < 4) errors.push(`${label}: Raw preview should show combining marks for classroom demo`);

  await page.click('#btn-terminal');
  await page.fill('#input', 'FX GLITCH TEST');
  await page.fill('#intensity', '7');
  await page.dispatchEvent('#intensity', 'input');
  await page.click('#layer-bleed');

  const fxControls = await page.evaluate(() => ({
    aberration: document.getElementById('fx-aberration')?.value,
    pixelation: document.getElementById('fx-pixelation')?.value,
    barcode: document.getElementById('fx-barcode')?.value,
    hasExportFx: !!document.getElementById('btn-export-fx'),
    readers: {
      getFxParams: typeof getFxParams === 'function',
      getFxAberrationStrength: typeof getFxAberrationStrength === 'function',
      getFxPixelationSize: typeof getFxPixelationSize === 'function',
      getFxBarcodeIntensity: typeof getFxBarcodeIntensity === 'function',
    },
    defaults: typeof getFxParams === 'function' ? getFxParams() : null,
  }));
  log.push(`${label}: fx controls ${JSON.stringify(fxControls)}`);
  if (!fxControls.hasExportFx) errors.push(`${label}: Export FX button missing`);
  if (fxControls.aberration !== '1') errors.push(`${label}: fx-aberration default should be 1`);
  if (fxControls.pixelation !== '5') errors.push(`${label}: fx-pixelation default should be 5`);
  if (fxControls.barcode !== '1') errors.push(`${label}: fx-barcode default should be 1`);
  if (!fxControls.readers.getFxParams) errors.push(`${label}: getFxParams missing`);
  if (!fxControls.defaults || fxControls.defaults.aberrationStrength !== 1) {
    errors.push(`${label}: getFxParams aberrationStrength default should be 1`);
  }
  if (!fxControls.defaults || fxControls.defaults.pixelationSize !== 5) {
    errors.push(`${label}: getFxParams pixelationSize default should be 5`);
  }

  const fxTest = await page.evaluate(async () => {
    const setFxControls = (aber, pix, bar) => {
      document.getElementById('fx-aberration').value = String(aber);
      document.getElementById('fx-pixelation').value = String(pix);
      document.getElementById('fx-barcode').value = String(bar);
      syncFxControlLabels();
    };

    const collapseCheck = {
      fn: typeof normalizeExportText === 'function',
      fxRows: typeof getFxExportLines === 'function' ? getFxExportLines('wait\nwait\nwait') : null,
      preserved: typeof normalizeExportText === 'function' ? normalizeExportText('wait\nwait\nwait', false) : null,
    };

    const savedOutput = lastOutput;
    lastOutput = 'LINE_A\nLINE_B\nLINE_C';
    const fxSource = getExportText(true);
    const styles = getPreviewStyles();
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    tctx.font = styles.font;
    const fxLayout = setupExportCanvas(fxSource, styles, true);
    lastOutput = savedOutput;

    const fns = {
      getExportText: typeof getExportText === 'function',
      getFxExportLines: typeof getFxExportLines === 'function',
      normalizeExportText: typeof normalizeExportText === 'function',
      maybeAppendTerminalBlock: typeof maybeAppendTerminalBlock === 'function',
      applyFxGlitch: typeof applyFxGlitch === 'function',
      applyChromaticAberration: typeof applyChromaticAberration === 'function',
      applyFxPostProcess: typeof applyFxPostProcess === 'function',
      applyHeavyScanlines: typeof applyHeavyScanlines === 'function',
      applyPixelation: typeof applyPixelation === 'function',
      applyBarcodeBleed: typeof applyBarcodeBleed === 'function',
      getFxPixelationStrength: typeof getFxPixelationStrength === 'function',
      setupExportCanvas: typeof setupExportCanvas === 'function',
      downloadCanvasPng: typeof downloadCanvasPng === 'function',
      fxExportScale: typeof FX_EXPORT_SCALE === 'number' ? FX_EXPORT_SCALE : null,
    };

    const px = (ctx, x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };

    setFxControls(1, 5, 1);
    const defaultParams = getFxParams();

    const pixCanvas = document.createElement('canvas');
    pixCanvas.width = 100;
    pixCanvas.height = 60;
    const pixCtx = pixCanvas.getContext('2d');
    pixCtx.fillStyle = '#ff0000';
    pixCtx.fillRect(0, 0, 50, 60);
    pixCtx.fillStyle = '#0000ff';
    pixCtx.fillRect(50, 0, 50, 60);
    applyPixelation(pixCtx, 100, 60, defaultParams.pixelationSize, defaultParams.pixelationStrength);
    const sameInBlock = JSON.stringify(px(pixCtx, 0, 0)) === JSON.stringify(px(pixCtx, 4, 0));
    const blockW = Math.floor(100 / defaultParams.pixelationSize);

    setFxControls(1, 10, 1);
    const largeParams = getFxParams();
    const gradedCanvas = document.createElement('canvas');
    gradedCanvas.width = 100;
    gradedCanvas.height = 60;
    const gradedCtx = gradedCanvas.getContext('2d');
    for (let x = 0; x < 100; x++) {
      gradedCtx.fillStyle = `rgb(${x * 2}, ${x}, ${255 - x})`;
      gradedCtx.fillRect(x, 0, 1, 60);
    }
    applyPixelation(gradedCtx, 100, 60, largeParams.pixelationSize, largeParams.pixelationStrength);
    const gradedDiffers = JSON.stringify(px(gradedCtx, 0, 0)) !== JSON.stringify(px(gradedCtx, 9, 0));

    setFxControls(1, 10, 1);
    const sizeParams = getFxParams();
    const sizeCanvas = document.createElement('canvas');
    sizeCanvas.width = 100;
    sizeCanvas.height = 60;
    const sizeCtx = sizeCanvas.getContext('2d');
    sizeCtx.fillStyle = '#ff0000';
    sizeCtx.fillRect(0, 0, 100, 60);
    applyPixelation(sizeCtx, 100, 60, sizeParams.pixelationSize, sizeParams.pixelationStrength);
    const sizeBlockW = Math.floor(100 / sizeParams.pixelationSize);

    const aberrSample = (strength) => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 80;
      const cx = c.getContext('2d');
      cx.font = '24px monospace';
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, 200, 80);
      applyFxGlitch(cx, ['TEST'], 10, 40, 30, '#ffffff', 0);
      applyChromaticAberration(cx, 200, 80, strength);
      let spread = 0;
      for (let y = 24; y < 58; y++) {
        for (let x = 12; x < 120; x++) {
          const p = px(cx, x, y);
          if (p[0] + p[1] + p[2] < 30) continue;
          if (Math.abs(p[0] - p[2]) > 20) spread++;
        }
      }
      return spread;
    };
    setFxControls(0, 5, 1);
    const lowAberrParams = getFxParams();
    setFxControls(2, 5, 1);
    const highAberrParams = getFxParams();
    const lowAberrSpread = aberrSample(lowAberrParams.aberrationStrength);
    const highAberrSpread = aberrSample(highAberrParams.aberrationStrength);
    const aberrationResponds = highAberrSpread > lowAberrSpread + 6;

    const barcodeSample = (intensity) => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 80;
      const cx = c.getContext('2d');
      cx.fillStyle = '#888888';
      cx.fillRect(0, 0, 200, 80);
      applyBarcodeBleed(cx, 200, 80, intensity);
      let dark = 0;
      for (let y = 0; y < 80; y += 2) {
        const p = px(cx, 5, y);
        if (p[0] < 100) dark++;
      }
      return dark;
    };
    setFxControls(1, 5, 0);
    const lowBarParams = getFxParams();
    setFxControls(1, 5, 2);
    const highBarParams = getFxParams();
    const barcodeResponds = barcodeSample(lowBarParams.barcodeIntensity) < barcodeSample(highBarParams.barcodeIntensity);

    setFxControls(1, 5, 1);
    const postParams = getFxParams();
    const exportCanvas = document.createElement('canvas');
    const ectx = exportCanvas.getContext('2d');
    const logicalW = 50;
    const logicalH = 30;
    exportCanvas.width = logicalW * FX_EXPORT_SCALE;
    exportCanvas.height = logicalH * FX_EXPORT_SCALE;
    ectx.scale(FX_EXPORT_SCALE, FX_EXPORT_SCALE);
    ectx.fillStyle = '#00ff00';
    ectx.fillRect(0, 0, logicalW, logicalH);
    applyFxPostProcess(ectx, postParams.pixelationSize, postParams.barcodeIntensity, postParams.pixelationStrength);
    const tf = ectx.getTransform();
    const transformReset = tf.a === 1 && tf.d === 1 && tf.e === 0 && tf.f === 0;
    const physicalBlocks = Math.floor(exportCanvas.width / postParams.pixelationSize);

    const inspectExportCanvas = (canvas, params) => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const sampleY = Math.floor(h * 0.55);
      let channelSpread = 0;
      let edgeDark = 0;
      let filled = 0;
      const physBlock = params.pixelationSize;
      const blockStart = physBlock * 2;
      const blockUniform = blockStart + physBlock - 1 < w
        && JSON.stringify(px(ctx, blockStart, sampleY)) === JSON.stringify(px(ctx, blockStart + physBlock - 1, sampleY));
      for (let x = 0; x < w; x += 3) {
        const p = px(ctx, x, sampleY);
        if (p[0] + p[1] + p[2] > 30) filled++;
        if (Math.abs(p[0] - p[1]) > 35 || Math.abs(p[1] - p[2]) > 35 || Math.abs(p[0] - p[2]) > 35) channelSpread++;
        if (x < 60 && p[0] < 45 && p[1] < 45 && p[2] < 45) edgeDark++;
      }
      return { channelSpread, edgeDark, filled, blockUniform, w, h, params };
    };

    const diffExportCanvases = (canvasA, canvasB) => {
      if (!canvasA || !canvasB) return 0;
      const ctxA = canvasA.getContext('2d');
      const ctxB = canvasB.getContext('2d');
      const w = Math.min(canvasA.width, canvasB.width);
      const h = Math.min(canvasA.height, canvasB.height);
      let diffs = 0;
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          if (JSON.stringify(px(ctxA, x, y)) !== JSON.stringify(px(ctxB, x, y))) diffs++;
        }
      }
      return diffs;
    };

    const hookExport = () => {
      let exportOk = false;
      let filename = '';
      let exportDims = null;
      let exportCanvasRef = null;
      let blobPending = 0;
      let resolveReady;
      const ready = new Promise((r) => { resolveReady = r; });
      const markReady = () => {
        if (blobPending === 0) resolveReady();
      };
      const origCreate = document.createElement.bind(document);
      document.createElement = (tag) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'click', {
            value() {
              exportOk = true;
              filename = el.download || '';
            },
          });
        }
        if (tag === 'canvas') {
          const origToBlob = el.toBlob.bind(el);
          el.toBlob = (cb, type) => {
            blobPending++;
            origToBlob((blob) => {
              if (!exportCanvasRef || el.width * el.height > exportCanvasRef.width * exportCanvasRef.height) {
                exportCanvasRef = el;
                exportDims = { width: el.width, height: el.height };
                exportOk = true;
              }
              blobPending--;
              markReady();
              cb(blob || new Blob(['x'], { type: type || 'image/png' }));
            }, type);
          };
        }
        return el;
      };
      return {
        async run(fn) {
          try {
            fn();
            if (blobPending === 0) resolveReady();
            await Promise.race([ready, new Promise((r) => setTimeout(r, 2000))]);
            return { exportOk, filename, exportDims, exportCanvasRef, err: null };
          } catch (e) {
            return { exportOk, filename, exportDims, exportCanvasRef, err: e.message };
          } finally {
            document.createElement = origCreate;
          }
        },
      };
    };

    setFxControls(1, 5, 1);
    const plainHook = hookExport();
    const plainResult = await plainHook.run(() => exportPng(false));
    const plainInspect = plainResult.exportCanvasRef
      ? inspectExportCanvas(plainResult.exportCanvasRef, getFxParams())
      : null;

    setFxControls(1, 5, 1);
    const fxHook = hookExport();
    const fxResult = await fxHook.run(() => exportPng(true));
    const fxInspect = fxResult.exportCanvasRef
      ? inspectExportCanvas(fxResult.exportCanvasRef, getFxParams())
      : null;

    setFxControls(0, 5, 0);
    const lowFxHook = hookExport();
    const lowFxResult = await lowFxHook.run(() => exportPng(true));
    const lowFxInspect = lowFxResult.exportCanvasRef
      ? inspectExportCanvas(lowFxResult.exportCanvasRef, getFxParams())
      : null;

    const fxVsPlainDiff = diffExportCanvases(fxResult.exportCanvasRef, plainResult.exportCanvasRef);
    const fxVsLowFxDiff = diffExportCanvases(fxResult.exportCanvasRef, lowFxResult.exportCanvasRef);

    setFxControls(1, 5, 1);
    const block = maybeAppendTerminalBlock('a', createTerminalBlockState(), true);
    return {
      fns,
      defaultParams,
      largeParams,
      plainResult,
      plainInspect,
      fxResult,
      fxInspect,
      lowFxInspect,
      fxVsPlainDiff,
      fxVsLowFxDiff,
      collapseCheck,
      fxSource,
      fxLineCount: fxLayout.lines.length,
      fxLines: fxLayout.lines,
      hasBlock: !!block.block || block.state.sinceBlock === 1,
      sameInBlock,
      blockW,
      transformReset,
      physicalBlocks,
      gradedDiffers,
      sizeBlockW,
      aberrationResponds,
      lowAberrSpread,
      highAberrSpread,
      barcodeResponds,
    };
  });
  log.push(`${label}: FX export ${JSON.stringify(fxTest)}`);
  if (!fxTest.fns.getExportText) errors.push(`${label}: getExportText missing`);
  if (!fxTest.fns.getFxExportLines) errors.push(`${label}: getFxExportLines missing`);
  if (!fxTest.fns.normalizeExportText) errors.push(`${label}: normalizeExportText missing`);
  if (!fxTest.collapseCheck?.fxRows || fxTest.collapseCheck.fxRows.length !== 3) {
    errors.push(`${label}: FX export should keep one row per input Enter (${JSON.stringify(fxTest.collapseCheck?.fxRows)})`);
  }
  if (fxTest.collapseCheck?.preserved !== 'wait\nwait\nwait') {
    errors.push(`${label}: plain export should preserve newlines`);
  }
  if (fxTest.fxSource !== 'LINE_A\nLINE_B\nLINE_C') {
    errors.push(`${label}: FX export should use lastOutput rows (${JSON.stringify(fxTest.fxSource)})`);
  }
  if (fxTest.fxLineCount !== 3) {
    errors.push(`${label}: FX export should have one unwrapped row per input line (got ${fxTest.fxLineCount})`);
  }
  if (fxTest.fxLines?.some((row, i) => row !== ['LINE_A', 'LINE_B', 'LINE_C'][i])) {
    errors.push(`${label}: FX export rows should match input lines unwrapped (${JSON.stringify(fxTest.fxLines)})`);
  }
  if (!fxTest.fns.maybeAppendTerminalBlock) errors.push(`${label}: shared terminal block helper missing`);
  if (!fxTest.fns.applyFxGlitch) errors.push(`${label}: applyFxGlitch missing`);
  if (!fxTest.fns.applyChromaticAberration) errors.push(`${label}: applyChromaticAberration missing`);
  if (!fxTest.fns.applyFxPostProcess) errors.push(`${label}: applyFxPostProcess missing`);
  if (!fxTest.fns.applyHeavyScanlines) errors.push(`${label}: applyHeavyScanlines missing`);
  if (!fxTest.fns.applyPixelation) errors.push(`${label}: applyPixelation missing`);
  if (!fxTest.fns.applyBarcodeBleed) errors.push(`${label}: applyBarcodeBleed missing`);
  if (!fxTest.fns.getFxPixelationStrength) errors.push(`${label}: getFxPixelationStrength missing`);
  if (!fxTest.fns.setupExportCanvas) errors.push(`${label}: setupExportCanvas helper missing`);
  if (!fxTest.fns.downloadCanvasPng) errors.push(`${label}: downloadCanvasPng helper missing`);
  if (fxTest.fns.fxExportScale !== 2) errors.push(`${label}: FX_EXPORT_SCALE should be 2`);
  if (!fxTest.defaultParams || fxTest.defaultParams.pixelationStrength !== 1) {
    errors.push(`${label}: default pixelationStrength should be 1`);
  }
  if (!fxTest.largeParams || fxTest.largeParams.pixelationStrength !== 0.5) {
    errors.push(`${label}: size-10 control should derive pixelationStrength 0.5`);
  }
  if (!fxTest.sameInBlock) errors.push(`${label}: default-size pixelation blocks not uniform within block`);
  if (!fxTest.gradedDiffers) errors.push(`${label}: control-sourced size/strength should produce graded blocks`);
  if (fxTest.blockW !== 20) errors.push(`${label}: expected blockW 20 for 100px/5, got ${fxTest.blockW}`);
  if (fxTest.sizeBlockW !== 10) errors.push(`${label}: expected sizeBlockW 10 for control size 10, got ${fxTest.sizeBlockW}`);
  if (!fxTest.aberrationResponds) errors.push(`${label}: control-sourced aberration should change canvas output`);
  if (!fxTest.barcodeResponds) errors.push(`${label}: control-sourced barcode intensity should change canvas output`);
  if (!fxTest.transformReset) errors.push(`${label}: applyFxPostProcess should reset transform to identity`);
  if (fxTest.physicalBlocks !== 20) errors.push(`${label}: expected 20 physical blocks at 2x scale, got ${fxTest.physicalBlocks}`);
  if (fxTest.plainResult?.err) errors.push(`${label}: exportPng(false) threw: ${fxTest.plainResult.err}`);
  if (!fxTest.plainResult?.exportOk) errors.push(`${label}: exportPng(false) did not trigger download`);
  if (fxTest.plainResult?.filename?.includes('-fx')) {
    errors.push(`${label}: exportPng(false) filename should not include -fx (${fxTest.plainResult.filename})`);
  }
  if (!fxTest.plainInspect || fxTest.plainInspect.filled < 10) {
    errors.push(`${label}: exportPng(false) canvas should have filled content`);
  }
  if (fxTest.fxResult?.err) errors.push(`${label}: exportPng(true) threw: ${fxTest.fxResult.err}`);
  if (!fxTest.fxResult?.exportOk) errors.push(`${label}: exportPng(true) did not trigger download`);
  if (!fxTest.fxResult?.filename?.includes('-fx')) {
    errors.push(`${label}: FX filename missing -fx suffix (${fxTest.fxResult?.filename})`);
  }
  if (!fxTest.fxResult?.exportDims || fxTest.fxResult.exportDims.width < 640) {
    errors.push(`${label}: exportPng(true) canvas dimensions too small (${JSON.stringify(fxTest.fxResult?.exportDims)})`);
  }
  if (!fxTest.fxInspect || fxTest.fxInspect.filled < 10) {
    errors.push(`${label}: exportPng(true) canvas should have filled content`);
  }
  if (fxTest.fxVsPlainDiff < 20) {
    errors.push(`${label}: exportPng(true) canvas should differ substantially from plain export (${fxTest.fxVsPlainDiff})`);
  }
  if (!fxTest.fxInspect || fxTest.fxInspect.params?.pixelationStrength !== 1) {
    errors.push(`${label}: exportPng(true) should apply default pixelationStrength 1`);
  }
  const caActive = (fxTest.fxInspect?.channelSpread || 0) > 30;
  if (!fxTest.fxInspect || (!caActive && !fxTest.fxInspect.blockUniform)) {
    errors.push(`${label}: exportPng(true) at default size should have uniform pixel blocks`);
  }
  if (fxTest.fxVsLowFxDiff < 15) {
    errors.push(`${label}: FX export with controls should differ from zero-aberration/zero-barcode export (${fxTest.fxVsLowFxDiff})`);
  }

  await page.fill('#fx-aberration', '1.5');
  await page.dispatchEvent('#fx-aberration', 'input');
  await page.fill('#fx-pixelation', '8');
  await page.dispatchEvent('#fx-pixelation', 'input');
  await page.fill('#fx-barcode', '1.8');
  await page.dispatchEvent('#fx-barcode', 'input');

  const fxExport2 = await page.evaluate(async () => {
    let exportOk = false;
    let dims = null;
    let exportCanvasRef = null;
    const params = getFxParams();
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value() { exportOk = true; } });
      }
      if (tag === 'canvas') {
        const origToBlob = el.toBlob.bind(el);
        el.toBlob = (cb, type) => {
          if (!exportCanvasRef || el.width * el.height > exportCanvasRef.width * exportCanvasRef.height) {
            exportCanvasRef = el;
            dims = { width: el.width, height: el.height };
          }
          origToBlob(blob => cb(blob || new Blob(['x'], { type: type || 'image/png' })), type);
        };
      }
      return el;
    };
    try {
      exportPng(true);
      await new Promise(r => setTimeout(r, 400));
      let gradedBlocksFound = false;
      if (exportCanvasRef) {
        const ctx = exportCanvasRef.getContext('2d');
        const block = params.pixelationSize;
        const pxAt = (x, y) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        for (let sampleY = 16; sampleY < exportCanvasRef.height - 8; sampleY += 12) {
          for (let bi = 2; bi < 12; bi++) {
            const start = block * bi;
            if (start + block - 1 < exportCanvasRef.width) {
              if (JSON.stringify(pxAt(start, sampleY)) !== JSON.stringify(pxAt(start + block - 1, sampleY))) {
                gradedBlocksFound = true;
                break;
              }
            }
          }
          if (gradedBlocksFound) break;
        }
      }
      return { exportOk, dims, params, gradedBlocksFound, err: null };
    } catch (e) {
      return { exportOk, dims, params, gradedBlocksFound: false, err: e.message };
    } finally {
      document.createElement = origCreate;
    }
  });
  log.push(`${label}: fx export round2 ${JSON.stringify(fxExport2)}`);
  if (fxExport2.err) errors.push(`${label}: second exportPng(true) threw: ${fxExport2.err}`);
  if (!fxExport2.exportOk) errors.push(`${label}: second exportPng(true) did not trigger download`);
  if (!fxExport2.params || fxExport2.params.aberrationStrength !== 1.5) {
    errors.push(`${label}: second export should use aberration 1.5`);
  }
  if (!fxExport2.params || fxExport2.params.pixelationSize !== 8) {
    errors.push(`${label}: second export should use pixelation 8`);
  }
  if (!fxExport2.params || Math.abs(fxExport2.params.pixelationStrength - 5 / 8) > 0.001) {
    errors.push(`${label}: second export should derive pixelationStrength 0.625 for size 8`);
  }
  if (!fxExport2.gradedBlocksFound) {
    errors.push(`${label}: size-8 export with strength 0.625 should produce graded non-uniform blocks`);
  }

  const colorTest = await page.evaluate(async () => {
    const CUSTOM = '#e63946';
    const DEFAULT = '#dddddd';
    const hexToRgb = (hex) => {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const pxAt = (ctx, x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const nearRgb = (p, rgb, tol = 48) =>
      p[3] > 128
      && Math.abs(p[0] - rgb[0]) <= tol
      && Math.abs(p[1] - rgb[1]) <= tol
      && Math.abs(p[2] - rgb[2]) <= tol;
    const countNearColor = (canvas, rgb, tol = 48) => {
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      let n = 0;
      for (let y = Math.floor(canvas.height * 0.35); y < Math.floor(canvas.height * 0.75); y += 2) {
        for (let x = 8; x < canvas.width - 8; x += 2) {
          if (nearRgb(pxAt(ctx, x, y), rgb, tol)) n++;
        }
      }
      return n;
    };
    const diffCanvases = (canvasA, canvasB) => {
      if (!canvasA || !canvasB) return 0;
      const ctxA = canvasA.getContext('2d');
      const ctxB = canvasB.getContext('2d');
      const w = Math.min(canvasA.width, canvasB.width);
      const h = Math.min(canvasA.height, canvasB.height);
      let diffs = 0;
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          if (JSON.stringify(pxAt(ctxA, x, y).slice(0, 3)) !== JSON.stringify(pxAt(ctxB, x, y).slice(0, 3))) diffs++;
        }
      }
      return diffs;
    };
    const hookExport = () => {
      let exportCanvasRef = null;
      const origCreate = document.createElement.bind(document);
      document.createElement = (tag) => {
        const el = origCreate(tag);
        if (tag === 'a') Object.defineProperty(el, 'click', { value() {} });
        if (tag === 'canvas') {
          const origToBlob = el.toBlob.bind(el);
          el.toBlob = (cb, type) => {
            if (!exportCanvasRef || el.width * el.height > exportCanvasRef.width * exportCanvasRef.height) {
              exportCanvasRef = el;
            }
            origToBlob(blob => cb(blob || new Blob(['x'], { type: type || 'image/png' })), type);
          };
        }
        return el;
      };
      return {
        async run(fn) {
          try {
            fn();
            await new Promise(r => setTimeout(r, 400));
            return exportCanvasRef;
          } finally {
            document.createElement = origCreate;
          }
        },
      };
    };

    if (terminalMode) toggleTerminal();
    document.getElementById('export-custom-color').checked = false;
    setPreviewTextColor(CUSTOM);

    const ui = {
      hasColorInput: !!document.getElementById('preview-color'),
      hasCheckbox: !!document.getElementById('export-custom-color'),
      hasSwatch: !!document.getElementById('preview-color-swatch'),
      previewColor: document.getElementById('preview').style.color,
      pickerValue: document.getElementById('preview-color').value,
      swatchBg: document.getElementById('preview-color-swatch').style.background,
    };

    const fns = {
      getExportDrawColor: typeof getExportDrawColor === 'function',
      setPreviewTextColor: typeof setPreviewTextColor === 'function',
      getDefaultPreviewColor: typeof getDefaultPreviewColor === 'function',
    };

    const exportUnchecked = getExportDrawColor();
    document.getElementById('export-custom-color').checked = true;
    const exportChecked = getExportDrawColor();
    document.getElementById('export-custom-color').checked = false;

    document.getElementById('input').value = 'COLOR';
    updatePreview();

    const defaultRgb = hexToRgb(DEFAULT);
    const customRgb = hexToRgb(CUSTOM);

    const plainDefaultCanvas = await hookExport().run(() => exportPng(false));
    const plainDefaultHits = countNearColor(plainDefaultCanvas, defaultRgb);
    const plainDefaultCustomHits = countNearColor(plainDefaultCanvas, customRgb);

    document.getElementById('export-custom-color').checked = true;
    const plainCustomCanvas = await hookExport().run(() => exportPng(false));
    const plainCustomHits = countNearColor(plainCustomCanvas, customRgb);
    const plainCustomDefaultHits = countNearColor(plainCustomCanvas, defaultRgb);

    document.getElementById('fx-aberration').value = '0';
    document.getElementById('fx-pixelation').value = '5';
    document.getElementById('fx-barcode').value = '0';
    syncFxControlLabels();
    document.getElementById('export-custom-color').checked = false;
    setPreviewTextColor(DEFAULT);
    const fxDefaultCanvas = await hookExport().run(() => exportPng(true));
    document.getElementById('export-custom-color').checked = true;
    setPreviewTextColor(CUSTOM);
    const fxCustomCanvas = await hookExport().run(() => exportPng(true));
    const fxColorDiff = diffCanvases(fxDefaultCanvas, fxCustomCanvas);

    const CYAN = '#00e5ff';
    setPreviewTextColor(CYAN);
    document.getElementById('export-custom-color').checked = true;
    document.getElementById('input').value = 'CYANFX';
    updatePreview();
    const cyanPlainCanvas = await hookExport().run(() => exportPng(false));
    const cyanFxCanvas = await hookExport().run(() => exportPng(true));
    const channelBias = (canvas) => {
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let n = 0;
      for (let y = Math.floor(canvas.height * 0.35); y < Math.floor(canvas.height * 0.75); y += 2) {
        for (let x = 8; x < canvas.width - 8; x += 2) {
          const p = pxAt(ctx, x, y);
          if (p[3] < 128 || p[0] + p[1] + p[2] < 60) continue;
          rSum += p[0];
          gSum += p[1];
          bSum += p[2];
          n++;
        }
      }
      if (!n) return null;
      return { r: rSum / n, g: gSum / n, b: bSum / n, n };
    };
    const cyanPlainBias = channelBias(cyanPlainCanvas);
    const cyanFxBias = channelBias(cyanFxCanvas);
    const chromaSpread = (canvas) => {
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      let spread = 0;
      for (let y = Math.floor(canvas.height * 0.35); y < Math.floor(canvas.height * 0.75); y += 2) {
        for (let x = 8; x < canvas.width - 8; x += 2) {
          const p = pxAt(ctx, x, y);
          if (p[3] < 128 || p[0] + p[1] + p[2] < 60) continue;
          if (Math.abs(p[0] - p[2]) > 24) spread++;
        }
      }
      return spread;
    };
    const cyanFxChroma = chromaSpread(cyanFxCanvas);

    document.getElementById('export-custom-color').checked = false;
    return {
      ui,
      fns,
      exportUnchecked,
      exportChecked,
      plainDefaultHits,
      plainDefaultCustomHits,
      plainCustomHits,
      plainCustomDefaultHits,
      fxColorDiff,
      cyanPlainBias,
      cyanFxBias,
      cyanFxChroma,
      defaultColor: getDefaultPreviewColor(),
    };
  });
  log.push(`${label}: preview/export color ${JSON.stringify(colorTest)}`);
  if (!colorTest.ui.hasColorInput) errors.push(`${label}: preview color input missing`);
  if (!colorTest.ui.hasCheckbox) errors.push(`${label}: export-custom-color checkbox missing`);
  if (!colorTest.ui.hasSwatch) errors.push(`${label}: preview color swatch missing`);
  if (!colorTest.fns.getExportDrawColor) errors.push(`${label}: getExportDrawColor missing`);
  if (!colorTest.fns.setPreviewTextColor) errors.push(`${label}: setPreviewTextColor missing`);
  if (!colorTest.fns.getDefaultPreviewColor) errors.push(`${label}: getDefaultPreviewColor missing`);
  if (colorTest.ui.pickerValue !== '#e63946') {
    errors.push(`${label}: preview color picker should reflect chosen color (${colorTest.ui.pickerValue})`);
  }
  if (!colorTest.ui.previewColor || !colorTest.ui.previewColor.includes('230')) {
    errors.push(`${label}: preview text color should update from color picker (${colorTest.ui.previewColor})`);
  }
  if (colorTest.exportUnchecked !== '#dddddd') {
    errors.push(`${label}: export draw color unchecked should use theme default (${colorTest.exportUnchecked})`);
  }
  if (colorTest.exportChecked !== '#e63946') {
    errors.push(`${label}: export draw color checked should use picker color (${colorTest.exportChecked})`);
  }
  if (colorTest.plainDefaultHits < 8) {
    errors.push(`${label}: plain export unchecked should use default text color (${colorTest.plainDefaultHits} hits)`);
  }
  if (colorTest.plainDefaultCustomHits > 4) {
    errors.push(`${label}: plain export unchecked should not use custom picker color (${colorTest.plainDefaultCustomHits} hits)`);
  }
  if (colorTest.plainCustomHits < 8) {
    errors.push(`${label}: plain export checked should use custom picker color (${colorTest.plainCustomHits} hits)`);
  }
  if (colorTest.fxColorDiff < 20) {
    errors.push(`${label}: FX export should change when custom export color enabled (${colorTest.fxColorDiff} diffs)`);
  }
  if (!colorTest.cyanPlainBias || !colorTest.cyanFxBias) {
    errors.push(`${label}: cyan export channel bias samples missing`);
  } else {
    const plainCyan = colorTest.cyanPlainBias.g + colorTest.cyanPlainBias.b > colorTest.cyanPlainBias.r * 1.8;
    const fxCyan = colorTest.cyanFxBias.g + colorTest.cyanFxBias.b > colorTest.cyanFxBias.r * 1.35;
    if (!plainCyan) errors.push(`${label}: plain cyan export should stay cyan-dominant`);
    if (!fxCyan) errors.push(`${label}: FX cyan export washed out (${JSON.stringify(colorTest.cyanFxBias)})`);
    if (colorTest.cyanFxChroma < 12) {
      errors.push(`${label}: FX cyan export should show chromatic aberration (${colorTest.cyanFxChroma} spread pixels)`);
    }
  }

  if (label === 'run1') {
    await page.screenshot({ path: path.join(scratch, `4-zalgo-fx-polish-${invocation}.png`), fullPage: true });
  }
  if (label === 'run2') {
    await page.click('#layer-reverse-zalgo');
    await page.fill('#input', '!test');
    await page.fill('#intensity', '1');
    await page.dispatchEvent('#intensity', 'input');
    await page.click('#btn-char-back');
    await page.screenshot({ path: path.join(scratch, '4-zalgo-charback-mode.png'), fullPage: true });
  }

  await browser.close();
}

await runSession('run1');
await runSession('run2');

const report = {
  ok: errors.length === 0,
  errors,
  log,
  html,
  scratch,
  invocation,
  finishedAt: new Date().toISOString(),
  exitCode: errors.length === 0 ? 0 : 1,
};
const reportPath = path.join(scratch, `verify-fx-polish-${invocation}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
process.exit(report.exitCode);