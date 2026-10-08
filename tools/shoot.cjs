// Headless screenshot harness.
// usage: NODE_PATH=$(npm root -g) node tools/shoot.cjs <scenario.cjs> <outDir> [w] [h]
// A scenario exports: async ({ page, shot, ev, step }) => { ... }
//   ev(fn, ...args)  – page.evaluate wrapper (fn receives window.__app as first arg)
//   step(n)          – advance n fixed frames (1/60 s)
//   shot(name)       – screenshot to outDir/name.png
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [scenarioPath, outDir = 'shots', w = '1280', h = '720'] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const port = process.env.PORT || 8080;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(`http://localhost:${port}/index.html?test&w=${w}&h=${h}`);
  await page.waitForFunction(() => !!window.__app, null, { timeout: 30000 }).catch(() => {});
  const ev = (fn, ...args) => page.evaluate(([src, a]) => { const f = eval('(' + src + ')'); return f(window.__app, ...a); }, [fn.toString(), args]);
  const step = (n = 1) => page.evaluate((n) => window.__app.step(n), n);
  const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 180000 }); console.log('shot', name); };
  try {
    const scenario = require(path.resolve(scenarioPath));
    await scenario({ page, shot, ev, step });
  } catch (e) {
    console.error('SCENARIO ERROR', e);
  }
  if (errors.length) console.log('--- page errors ---\n' + errors.slice(0, 30).join('\n'));
  await browser.close();
})();
