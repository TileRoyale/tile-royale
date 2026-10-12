// Owner directive (2026-10-12): /pa/version must return a platform-specific min/latest
// pair — Android/web (default) keep PA_MIN_CLIENT_VERSION/PA_LATEST_VERSION; iOS
// (?platform=ios) gets its own PA_IOS_MIN_CLIENT_VERSION/PA_IOS_LATEST_VERSION, fully
// independent from the Android values. The real route handler and the 4 version
// constants are extracted verbatim from src/index.ts (brace-matching, same philosophy
// as the Patient Angler client test suite) and executed in a vm sandbox — nothing
// reimplemented. The one TypeScript-only type annotation on the handler's local
// `payload` variable is stripped before execution since vm runs plain JS, not TS.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const serverSource = fs.readFileSync('src/index.ts', 'utf8');

function _matchBraceEnd(src, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch; i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && next === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (ch === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error('unterminated block starting at ' + openBraceIdx);
}

function extractConst(name) {
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*"[^"]*"').exec(serverSource);
  if (!m) throw new Error('const not found in source: ' + name);
  return m[0] + ';\n';
}

function extractVersionHandlerSrc() {
  const routeIdx = serverSource.indexOf('app.get("/pa/version"');
  if (routeIdx === -1) throw new Error('/pa/version route not found in source');
  const arrowIdx = serverSource.indexOf('(req, res) => {', routeIdx);
  if (arrowIdx === -1) throw new Error('handler arrow function not found');
  const braceStart = serverSource.indexOf('{', arrowIdx);
  const raw = serverSource.slice(arrowIdx, _matchBraceEnd(serverSource, braceStart));
  // Strip the one TS-only type annotation so this runs as plain JS in the vm sandbox.
  return raw.replace(': Record<string, unknown>', '');
}

const constsSrc =
  extractConst('PA_MIN_CLIENT_VERSION') +
  extractConst('PA_LATEST_VERSION') +
  extractConst('PA_IOS_MIN_CLIENT_VERSION') +
  extractConst('PA_IOS_LATEST_VERSION');

const handlerSrc = extractVersionHandlerSrc();

function makeHandler(announcement) {
  const sandbox = { PA_ANNOUNCEMENT: announcement !== undefined ? announcement : null, console };
  const context = vm.createContext(sandbox);
  vm.runInContext(constsSrc + 'this.__handler = ' + handlerSrc + ';', context, { filename: 'index.ts (extracted /pa/version handler)' });
  return (query) => {
    let jsonBody = null;
    const req = { query: query || {} };
    const res = { json: (body) => { jsonBody = body; } };
    vm.runInContext('__handler', context)(req, res);
    return jsonBody;
  };
}

function test(name, fn) {
  try { fn(); console.log('  ' + name + ': OK'); }
  catch (e) { console.error('  ' + name + ': FAILED\n    ' + (e && e.stack || e)); process.exitCode = 1; }
}

console.log('/pa/version platform-specific tests:');

test('no platform query param -> returns the Android/web min+latest pair', () => {
  const handler = makeHandler();
  const body = handler({});
  assert.strictEqual(body.minClientVersion, 'v0.1.5');
  assert.strictEqual(body.latestVersion, 'v1.0.8.0');
});

test('platform=ios -> returns the iOS-specific min+latest pair, never the Android one', () => {
  const handler = makeHandler();
  const body = handler({ platform: 'ios' });
  assert.strictEqual(body.minClientVersion, 'v1.0');
  assert.strictEqual(body.latestVersion, 'v1.0.8');
  assert.notStrictEqual(body.latestVersion, 'v1.0.8.0', 'must not leak the Android latest value onto iOS');
});

test('platform=IOS (case-insensitive) -> still resolves to the iOS pair', () => {
  const handler = makeHandler();
  const body = handler({ platform: 'IOS' });
  assert.strictEqual(body.latestVersion, 'v1.0.8');
});

test('platform=android (explicit, non-ios) -> falls back to the Android pair, same as omitted', () => {
  const handler = makeHandler();
  const body = handler({ platform: 'android' });
  assert.strictEqual(body.latestVersion, 'v1.0.8.0');
});

test('announcement (when set) is included identically on both platforms', () => {
  const handler = makeHandler({ track: 'production', minBuild: 1, texts: { en: 'hi' } });
  const android = handler({});
  const ios = handler({ platform: 'ios' });
  assert.deepStrictEqual(android.announcement, { track: 'production', minBuild: 1, texts: { en: 'hi' } });
  assert.deepStrictEqual(ios.announcement, { track: 'production', minBuild: 1, texts: { en: 'hi' } });
});

test('no announcement set -> omitted from the payload on both platforms', () => {
  const handler = makeHandler(null);
  assert.strictEqual('announcement' in handler({}), false);
  assert.strictEqual('announcement' in handler({ platform: 'ios' }), false);
});

if (process.exitCode) {
  console.error('\nSome /pa/version platform tests FAILED.');
} else {
  console.log('\nAll /pa/version platform tests passed.');
}
