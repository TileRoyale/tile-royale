// Angler's Canvas Bobber short share codes (2026-11-18). Runs the real src/paCanvasBobber.ts against an
// in-memory pa_canvas_bobbers table that enforces the same rules as the real schema (owner_uid
// PRIMARY KEY, share_code UNIQUE, upsert ON CONFLICT (owner_uid)). Run: npx ts-node tests/pa-canvas-bobber.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ACB_CODE_ALPHABET, ACB_MAX_DESIGN_CHARS, generateCanvasShareCode, normalizeCanvasShareCode,
  validateCanvasDesign, publishCanvasBobber, lookupCanvasBobber,
} from '../src/paCanvasBobber';

type Row = { owner_uid: string; share_code: string; design_data: string; design_hash: string; updated_at: Date };
function fakeDb() {
  const rows = new Map<string, Row>();
  let clock = Date.UTC(2026, 10, 18);
  const q = async (sql: string, p: any[] = []): Promise<any[] | null> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT share_code, design_hash, updated_at FROM pa_canvas_bobbers WHERE owner_uid')) {
      const r = rows.get(p[0]); return r ? [{ share_code: r.share_code, design_hash: r.design_hash, updated_at: r.updated_at }] : [];
    }
    if (s.startsWith('SELECT 1 FROM pa_canvas_bobbers WHERE share_code')) return [...rows.values()].some(r => r.share_code === p[0]) ? [{ '?column?': 1 }] : [];
    if (s.startsWith('INSERT INTO pa_canvas_bobbers')) {
      const [uid, code, data, hash] = p;
      if ([...rows.values()].some(r => r.share_code === code && r.owner_uid !== uid)) return null; // UNIQUE violation
      rows.set(uid, { owner_uid: uid, share_code: code, design_data: data, design_hash: hash, updated_at: new Date(clock) });
      return [{ share_code: code }];
    }
    if (s.startsWith('SELECT design_data FROM pa_canvas_bobbers WHERE share_code')) {
      const r = [...rows.values()].find(x => x.share_code === p[0]); return r ? [{ design_data: r.design_data }] : [];
    }
    throw new Error('unexpected SQL: ' + s);
  };
  return { q, rows, advance: (ms: number) => { clock += ms; }, now: () => clock };
}
const design = (seed: number) => 'AC3:' + Buffer.from([1, 0, 5, seed & 255, 20, 30]).toString('base64');

(async () => {
  // Code format: ACB-XXXX-XXXX from the readable alphabet (no 0/O/1/I)
  assert.ok(!/[01OI]/.test(ACB_CODE_ALPHABET));
  for (let i = 0; i < 200; i++) assert.match(generateCanvasShareCode(), /^ACB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeCanvasShareCode('  acb-k7m4-p9q2 '), 'ACB-K7M4-P9Q2');
  assert.equal(normalizeCanvasShareCode('ACBK7M4P9Q2'), 'ACB-K7M4-P9Q2');
  assert.equal(normalizeCanvasShareCode('K7M4 P9Q2'), 'ACB-K7M4-P9Q2');
  assert.equal(normalizeCanvasShareCode('ACB-K7M4-P9Q0'), null, '0 is not in the alphabet');
  assert.equal(normalizeCanvasShareCode('ACB-K7M4'), null);

  // Unauthenticated requests are rejected: both routes sit behind verifyPAToken (401 without a token)
  const index = fs.readFileSync('src/index.ts', 'utf8');
  assert.match(index, /app\.post\('\/pa\/canvas-bobber', verifyPAToken,/);
  assert.match(index, /app\.get\('\/pa\/canvas-bobber\/:shareCode', verifyPAToken,/);
  assert.match(index, /const uid = res\.locals\.paUid as string;\s*const r = await publishCanvasBobber\(query, uid,/, 'uid comes only from the verified token');
  assert.match(fs.readFileSync('src/db.ts', 'utf8'), /CREATE TABLE IF NOT EXISTS pa_canvas_bobbers \(\s*owner_uid\s+TEXT\s+PRIMARY KEY,\s*share_code\s+TEXT\s+UNIQUE NOT NULL,/);
  const db = fakeDb();
  const missing = await publishCanvasBobber(db.q, '', design(1));
  assert.equal(missing.ok, false); assert.equal(missing.status, 401);

  // First publish creates one row
  const a1 = await publishCanvasBobber(db.q, 'uidA', design(1), { now: db.now() });
  assert.ok(a1.ok && a1.shareCode); assert.equal(db.rows.size, 1);

  // Same payload returns the same code (no write, no rate limit)
  const a2 = await publishCanvasBobber(db.q, 'uidA', design(1), { now: db.now() });
  assert.equal(a2.shareCode, a1.shareCode); assert.equal(a2.unchanged, true);

  // Changed payload within 10 s is rate limited; afterwards it changes the code, still one row
  const rl = await publishCanvasBobber(db.q, 'uidA', design(2), { now: db.now() + 1000 });
  assert.equal(rl.ok, false); assert.equal(rl.status, 429);
  db.advance(11_000);
  const a3 = await publishCanvasBobber(db.q, 'uidA', design(2), { now: db.now() });
  assert.ok(a3.ok); assert.notEqual(a3.shareCode, a1.shareCode); assert.equal(db.rows.size, 1);

  // The old code no longer works; the new one returns only the design data
  const old = await lookupCanvasBobber(db.q, a1.shareCode);
  assert.equal(old.ok, false); assert.equal(old.status, 404);
  const got = await lookupCanvasBobber(db.q, (a3.shareCode as string).toLowerCase());
  assert.deepEqual(Object.keys(got).sort(), ['designData', 'ok'], 'import returns only ok + designData (no owner uid, name or account data)');
  assert.equal(got.designData, design(2));
  assert.equal((await lookupCanvasBobber(db.q, 'not a code')).status, 400);

  // Too large or invalid payloads are rejected and never written
  const before = db.rows.get('uidA')!.design_data;
  assert.equal((await publishCanvasBobber(db.q, 'uidA', 'AC3:' + 'A'.repeat(ACB_MAX_DESIGN_CHARS), { now: db.now() + 60_000 })).status, 413);
  for (const bad of ['ACB1.abc.def', 'AC3:@@@@', 'AC3:', 'AC3:' + Buffer.from([2, 1, 1]).toString('base64'), 12345, null]) {
    const r = await publishCanvasBobber(db.q, 'uidA', bad as any, { now: db.now() + 60_000 });
    assert.equal(r.ok, false, 'rejects ' + String(bad)); assert.equal(r.status, 400);
  }
  assert.equal(validateCanvasDesign(design(9)).ok, true);
  assert.equal(db.rows.get('uidA')!.design_data, before, 'rejected payloads never change the stored design');

  // Two players never share a code, even when the random source collides once (safe retry)
  const fixed = [Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])];
  let call = 0;
  const rand = () => fixed[Math.min(call++, fixed.length - 1)];
  const b1 = await publishCanvasBobber(db.q, 'uidB', design(3), { now: db.now(), rand: () => fixed[0] });
  call = 0;
  const c1 = await publishCanvasBobber(db.q, 'uidC', design(4), { now: db.now(), rand });
  assert.ok(b1.ok && c1.ok); assert.notEqual(b1.shareCode, c1.shareCode, 'a colliding code is retried');
  assert.equal(db.rows.size, 3, 'one row per player');
  const codes = [...db.rows.values()].map(r => r.share_code);
  assert.equal(new Set(codes).size, codes.length, 'all codes unique');

  // Legacy save endpoints were not touched
  assert.ok(!/pa_canvas_bobbers/.test(index.slice(index.indexOf('app.post("/pa/save"'), index.indexOf('app.post("/pa/save"') + 4000)));

  console.log('pa-canvas-bobber: all tests passed');
})().catch(e => { console.error(e); process.exit(1); });
