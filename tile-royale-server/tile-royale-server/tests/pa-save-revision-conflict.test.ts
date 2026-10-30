// Multi-device cloud sync conflict protection (owner request, 2026-10-30; null-bypass hole fixed
// 2026-10-30; split into a separate /pa/save-v2 endpoint 2026-10-30 so the legacy /pa/save used by
// any already-installed Android/iOS build is never touched). Patient Angler's pa_save_data table
// carries a monotonically increasing `revision`; POST /pa/save-v2 only accepts a write when the
// client's expectedRevision matches the server's current one (see savePASaveConditional() in
// src/db.ts), so a stale device that missed another device's newer save gets HTTP 409 instead of
// silently clobbering it. POST /pa/save (legacy, unconditional) is left completely unchanged.
//
// An earlier version of this fix tried to share ONE endpoint with a `strictSync` flag chosen by
// the client, with a WHERE clause of `CASE WHEN strict THEN ... ELSE $3::int IS NULL OR revision =
// $3 END`. A later review correctly pointed out the ELSE branch there was exactly the original
// hole (null matching an EXISTING row), and that trying to parameterize a hole instead of removing
// it was the wrong shape for a "minimal, backward-compatible" fix. The final shape instead splits
// endpoints: /pa/save-v2 calls savePASaveConditional(), which is now UNCONDITIONALLY strict — no
// flag, no legacy branch inside it at all — and /pa/save (unreachable from any new client) keeps
// calling the separate, always-unconditional savePASave() it always has.
//
// This test runs the REAL savePASaveConditional() function body (extracted verbatim from
// src/db.ts, same vm-sandbox-extraction technique as tests/pa-version-ios-platform.test.js). Since
// there is no live Postgres available in this environment, two layers verify it:
//  1. A direct assertion on the extracted SQL text itself — the vulnerable bare OR clause must not
//     exist anywhere in it, and it must require a real, matching revision for an existing row.
//  2. A small in-memory fake `pa_save_data` table behind the mocked query(), whose UPSERT branch
//     mirrors the SAME WHERE condition the real SQL now uses (so a future accidental revert of the
//     SQL back toward the vulnerable form would also break assertion #1 even though this fake
//     table wouldn't itself notice) — driving the real function through actual accept/reject
//     outcomes for every scenario the owner asked to cover, including that a rejected (conflicting)
//     save never touches the stored save_json content.
// A separate source-level check (further below) confirms the legacy /pa/save route handler in
// index.ts was not touched by any of this. This is the most this sandbox can verify without a live
// Postgres; a real integration test against an actual database is recommended before relying on
// this for production confidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dbSource = fs.readFileSync('src/db.ts', 'utf8').replace(/\r\n/g, '\n');
const indexSource = fs.readFileSync('src/index.ts', 'utf8').replace(/\r\n/g, '\n');

const bodyStart = dbSource.indexOf('if (!pool || !dbAvailable) return { ok: false, conflict: false };', dbSource.indexOf('export async function savePASaveConditional('));
assert(bodyStart !== -1, 'savePASaveConditional body start not found — has db.ts changed shape?');
const bodyEnd = dbSource.indexOf('\n}\n\nexport async function loadPASaveHistory', bodyStart);
assert(bodyEnd !== -1, 'savePASaveConditional body end not found — has db.ts changed shape?');
// bodyEnd points at the start of "\n}\n\nexport ..." — slicing up to it keeps the try/catch's own
// balanced braces but deliberately excludes the function's OWN closing brace, since the wrapper
// below supplies that one itself.
const bodySrc = dbSource.slice(bodyStart, bodyEnd);

// ── Layer 1: the SQL text itself must not contain the null-bypass hole ─────────────────────────
{
  const upsertMatch = bodySrc.match(/INSERT INTO pa_save_data[\s\S]*?RETURNING revision/);
  assert(upsertMatch, 'main conditional UPSERT statement not found in savePASaveConditional()');
  const upsertSql = upsertMatch[0];
  assert.doesNotMatch(
    upsertSql,
    /\$3::int IS NULL OR pa_save_data\.revision = \$3/,
    'savePASaveConditional()\'s UPSERT must never accept a null/missing expectedRevision against an EXISTING row — that was the original hole'
  );
  assert.match(
    upsertSql,
    /WHERE\s+\$3::int IS NOT NULL AND pa_save_data\.revision = \$3\s*$/m,
    'an existing row must require a real, matching expectedRevision — no CASE/flag, unconditionally strict'
  );
}

// ── Legacy /pa/save must be byte-for-byte behaviorally unchanged ───────────────────────────────
// (regression #1 from the owner's test list: "legacy /pa/save jätkab vana request-kujuga
// töötamist") — extracts the route handler and checks it still does exactly what it always did:
// destructure only `save` from the body, run anti-cheat, call the plain unconditional savePASave(),
// and respond with nothing but { ok }. No expectedRevision, no syncProtocol, no revision in the
// response, no 409 path.
{
  const routeStart = indexSource.indexOf('app.post("/pa/save", verifyPAToken');
  assert(routeStart !== -1, 'legacy POST /pa/save route not found');
  const routeEnd = indexSource.indexOf('\n});', routeStart) + 4;
  const routeSrc = indexSource.slice(routeStart, routeEnd);
  assert.match(routeSrc, /const\s*\{\s*save\s*\}\s*=\s*req\.body/, 'legacy /pa/save must destructure only `save` from the request body — no expectedRevision/syncProtocol');
  assert.doesNotMatch(routeSrc, /savePASaveConditional/, 'legacy /pa/save must never call the revision-conditional save path');
  assert.doesNotMatch(routeSrc, /status\(409\)/, 'legacy /pa/save must never return a 409');
  assert.match(routeSrc, /const ok = await savePASave\(uid, JSON\.stringify\(save\)\);/, 'legacy /pa/save must still call the plain, unconditional savePASave()');
  assert.match(routeSrc, /res\.json\(\{\s*ok\s*\}\);/, 'legacy /pa/save must still respond with exactly { ok }');
}

// ── adoptLocalSave must be a distinct, separately-named flag from explicitReset ────────────────
// (owner correction, 2026-10-30: "Ära kasuta explicitReset nime tavalise Save to Cloud jaoks...
// lisa eraldi selgelt nimetatud adoptLocalSave") — Settings → Account "Save to Cloud" opting a
// never-before-synced device into v2 must stay auditably distinct from the progress-reset flow,
// even though both end up calling the same unconditional savePASave() underneath.
{
  const v2Start = indexSource.indexOf('app.post("/pa/save-v2", verifyPAToken');
  assert(v2Start !== -1, 'POST /pa/save-v2 route not found');
  const v2End = indexSource.indexOf('\napp.get("/pa/load/:uid"', v2Start);
  assert(v2End !== -1, 'POST /pa/save-v2 route end not found');
  const v2Src = indexSource.slice(v2Start, v2End);
  assert.match(v2Src, /explicitReset/, '/pa/save-v2 must still support explicitReset for the progress-reset flow');
  assert.match(v2Src, /adoptLocalSave/, '/pa/save-v2 must support a separate adoptLocalSave flag for "Save to Cloud" opt-in');
  assert.doesNotMatch(v2Src, /adoptLocalSave\s*===\s*explicitReset|explicitReset\s*\|\|\s*adoptLocalSave|adoptLocalSave\s*\|\|\s*explicitReset/, 'adoptLocalSave and explicitReset must be handled as two distinct conditions, not merged into one check');
}

// ── pa_save_data schema change must be metadata-only — no content migration/rewrite ────────────
// (regression #2: "olemasolev save_json jääb revision schema lisamisel muutmata") — Postgres 11+
// does not rewrite a table for ADD COLUMN ... DEFAULT <constant> (metadata-only), and this project
// never issues any UPDATE against existing save_json rows as part of adding the column.
{
  const alterMatch = dbSource.match(/ALTER TABLE pa_save_data ADD COLUMN IF NOT EXISTS revision[^\n]*/);
  assert(alterMatch, 'pa_save_data revision column migration not found');
  assert.doesNotMatch(dbSource, /UPDATE pa_save_data\s+SET\s+save_json/, 'adding the revision column must never also rewrite existing save_json content');
}

// ── Layer 2: behavioral tests via a small in-memory fake pa_save_data table ─────────────────────
// Mirrors the same WHERE condition the real SQL now uses — kept intentionally tiny and obviously
// parallel to it so a reviewer can compare the two directly. Tracks save_json too (not just
// revision) so a rejected/conflicting save's effect on stored content can be asserted directly.
function makeFakeDb(initialRows: Record<string, { revision: number; saveJson: string }> = {}) {
  const table: Record<string, { revision: number; saveJson: string }> = {};
  for (const [uid, row] of Object.entries(initialRows)) table[uid] = { ...row };
  const query = async (sql, params) => {
    if (sql.includes('RETURNING revision')) {
      const [uid, saveJson, expectedRevision] = params;
      const existing = table[uid];
      if (existing === undefined) {
        table[uid] = { revision: 1, saveJson };
        return [{ revision: 1 }]; // brand new uid: INSERT branch, always accepted
      }
      const typedExpected = typeof expectedRevision === 'number' ? expectedRevision : null;
      const matches = typedExpected !== null && typedExpected === existing.revision;
      if (!matches) return []; // 0 rows: conflict — row (including save_json) must stay untouched
      existing.revision += 1;
      existing.saveJson = saveJson;
      return [{ revision: existing.revision }];
    }
    if (sql.includes('SELECT revision, updated_at')) {
      const uid = params[0];
      const existing = table[uid];
      return existing === undefined ? [] : [{ revision: existing.revision, updated_at: '2026-10-30T12:00:00.000Z' }];
    }
    return []; // history archive/trim — not modeled, irrelevant to these assertions
  };
  return { query, table };
}

function makeSavePASaveConditional(queryImpl) {
  const sandbox = { pool: {}, dbAvailable: true, query: queryImpl, console: { error() {} } };
  const context = vm.createContext(sandbox);
  const fnSrc = `(async function savePASaveConditional(uid, saveJson, expectedRevision) {\n${bodySrc}\n})`;
  return vm.runInContext(fnSrc, context, { filename: 'savePASaveConditional.js' });
}

async function testV2RejectsNullExpectedAgainstExistingRow() {
  // The exact hole that was reported: existing revision 5, but expectedRevision null — must now
  // be REJECTED, not accepted.
  const db = makeFakeDb({ 'user-1': { revision: 5, saveJson: '{"coins":1}' } });
  const savePASaveConditional = makeSavePASaveConditional(db.query);
  const result = await savePASaveConditional('user-1', '{"coins":999999}', null);
  assert.equal(result.ok, false, 'a null expectedRevision must never overwrite an existing row via /pa/save-v2');
  assert.equal(result.conflict, true);
  assert.equal(result.currentRevision, 5);
}

async function testV2RejectsMismatchedRevision() {
  const db = makeFakeDb({ 'user-1': { revision: 5, saveJson: '{"coins":1}' } });
  const savePASaveConditional = makeSavePASaveConditional(db.query);
  const result = await savePASaveConditional('user-1', '{"coins":999999}', 4);
  assert.equal(result.ok, false, 'a stale expectedRevision must be rejected');
  assert.equal(result.conflict, true);
  assert.equal(result.currentRevision, 5);
}

async function testV2ConflictDoesNotChangeStoredSaveJson() {
  // Regression #4: "v2 konflikt ei muuda serveri save_json sisu".
  const db = makeFakeDb({ 'user-1': { revision: 5, saveJson: '{"coins":1}' } });
  const savePASaveConditional = makeSavePASaveConditional(db.query);
  await savePASaveConditional('user-1', '{"coins":999999}', null);
  await savePASaveConditional('user-1', '{"coins":888888}', 4);
  assert.equal(db.table['user-1'].saveJson, '{"coins":1}', 'rejected saves must never change the stored save_json');
  assert.equal(db.table['user-1'].revision, 5, 'rejected saves must never bump the stored revision');
}

async function testV2MatchingRevisionSucceedsAndIncrements() {
  const db = makeFakeDb({ 'user-1': { revision: 5, saveJson: '{"coins":1}' } });
  const savePASaveConditional = makeSavePASaveConditional(db.query);
  const result = await savePASaveConditional('user-1', '{"coins":2}', 5);
  assert.equal(result.ok, true, 'a matching expectedRevision must be accepted');
  assert.equal(result.conflict, false);
  assert.equal(result.revision, 6, 'revision must increment by exactly 1');
  assert.equal(db.table['user-1'].saveJson, '{"coins":2}');
}

async function testV2FreshAccountFirstSaveSucceeds() {
  // Regression #5: "fresh account saab v2 kaudu esimese save'i teha".
  const db = makeFakeDb({}); // no row for this uid at all
  const savePASaveConditional = makeSavePASaveConditional(db.query);
  const result = await savePASaveConditional('new-uid', '{"coins":0}', 0);
  assert.equal(result.ok, true, 'a brand new account\'s first save must be accepted regardless of what expectedRevision it sent');
  assert.equal(result.conflict, false);
  assert.equal(result.revision, 1);
  assert.equal(db.table['new-uid'].revision, 1);
}

async function main() {
  await testV2RejectsNullExpectedAgainstExistingRow();
  await testV2RejectsMismatchedRevision();
  await testV2ConflictDoesNotChangeStoredSaveJson();
  await testV2MatchingRevisionSucceedsAndIncrements();
  await testV2FreshAccountFirstSaveSucceeds();
  console.log('pa-save-revision-conflict: ok');
}

main().catch(err => { console.error(err); process.exit(1); });
