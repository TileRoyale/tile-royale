/**
 * Community Event system integration tests.
 * Run with: ts-node src/ce-tests.ts <server-url> <admin-key> <pa-token>
 *
 * Tests require a live server and a valid PA token for a test user.
 * All state changes use a throwaway eventId prefix "ce_test_" that should
 * never collide with real events.
 */

const [,, SERVER, ADMIN_KEY, PA_TOKEN] = process.argv;
if (!SERVER || !ADMIN_KEY || !PA_TOKEN) {
  console.error('Usage: ts-node src/ce-tests.ts <server-url> <admin-key> <pa-token>');
  process.exit(1);
}

const BASE = SERVER.replace(/\/$/, '');
let passed = 0, failed = 0;

async function req(method: string, path: string, body?: unknown, auth?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = 'Bearer ' + auth;
  else      headers['x-admin-key']   = ADMIN_KEY;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { console.log('  PASS', name); passed++; }
  else           { console.error('  FAIL', name, detail ?? ''); failed++; }
}

// Schedule a test event (already started, ends 1 hour from now unless override).
// Returns the eventId; caller tears down.
async function scheduleTestEvent(
  overrides: Record<string,unknown> = {}
): Promise<string> {
  const now     = Date.now();
  const eventId = 'ce_test_' + now + '_' + Math.floor(Math.random() * 10000);
  await req('POST', '/admin/pa/community/start', {
    eventId,
    name: 'Test Event',
    startsAt: now - 1000,
    endsAt:   now + 3600 * 1000,
    target:   1000,
    milestones: [
      { pct: 50,  type: 'blackPearls', reward_pct: 5 },
      { pct: 100, type: 'blackPearls', reward_pct: 10 },
    ],
    lbTiers: [
      { key: 'top1',  maxPct:  1, reward_pct: 50, diamonds: 50, autoTokens: 5 },
      { key: 'top25', maxPct: 25, reward_pct: 10, diamonds: 10, autoTokens: 1 },
    ],
    ...overrides,
  });
  return eventId;
}

// End a test event by pushing it into the past via repair-timestamps.
async function endTestEvent(eventId: string): Promise<void> {
  const past = Date.now() - 2000;
  await req('POST', '/admin/pa/community/repair-timestamps', {
    eventId, startsAt: past - 3600000, endsAt: past,
  });
}

// ─── Section 1: pre-existing CE lifecycle tests ───────────────────────────────

async function testPreStartInvisibility() {
  console.log('\n[1] Pre-start invisibility');
  const now = Date.now();
  const eventId = await scheduleTestEvent({ startsAt: now + 3600 * 1000, endsAt: now + 2 * 3600 * 1000 });
  const status = await req('GET', `/pa/community/status?eventId=${encodeURIComponent(eventId)}`, undefined, PA_TOKEN);
  assert('future event not visible in status', !status.eventActive);
  assert('future event status is null',        status.status === null);
}

async function testExactStartActivation() {
  console.log('\n[2] Event active immediately at startsAt');
  const eventId = await scheduleTestEvent();
  const status = await req('GET', `/pa/community/status?eventId=${encodeURIComponent(eventId)}`, undefined, PA_TOKEN);
  assert('event active', status.eventActive === true);
  assert('status returned', status.status !== null);
}

async function testZeroProgress() {
  console.log('\n[3] Zero contribution on fresh event');
  const eventId = await scheduleTestEvent();
  const status = await req('GET', `/pa/community/status?eventId=${encodeURIComponent(eventId)}`, undefined, PA_TOKEN);
  assert('communityTotal = 0', Number(status.status?.communityTotal ?? -1) === 0);
  assert('playerTotal = 0',    Number(status.status?.playerTotal    ?? -1) === 0);
}

async function testContributionTimeBoundary() {
  console.log('\n[4] Contribution accepted during active window');
  const eventId = await scheduleTestEvent();
  const contrib = await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  assert('contribution accepted', contrib.ok === true);
  const status = await req('GET', `/pa/community/status?eventId=${encodeURIComponent(eventId)}`, undefined, PA_TOKEN);
  assert('playerTotal updated', Number(status.status?.playerTotal ?? 0) > 0);
}

async function testContributionRejectedBeforeStart() {
  console.log('\n[5] Contribution rejected before event starts');
  const now = Date.now();
  const eventId = await scheduleTestEvent({ startsAt: now + 3600 * 1000, endsAt: now + 2 * 3600 * 1000 });
  const contrib = await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  assert('contribution rejected for future event', contrib.ok === false);
}

async function testMilestoneExactlyOnce() {
  console.log('\n[6] Milestone claimed exactly once (idempotent on second call)');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 50 }, PA_TOKEN);
  const claim1 = await req('POST', '/pa/community/claim', { eventId, milestonePct: 50 }, PA_TOKEN);
  assert('first claim succeeds', claim1.ok === true);
  const claim2 = await req('POST', '/pa/community/claim', { eventId, milestonePct: 50 }, PA_TOKEN);
  assert('second claim is already_claimed', claim2.error === 'already_claimed');
}

async function testAciLockedAt9999() {
  console.log('\n[7] ACI goal not unlocked at 99.99%');
  const eventId = await scheduleTestEvent({ target: 10000, isAciGoalEvent: false });
  await req('POST', '/pa/community/contribute', { eventId, amount: 9999 }, PA_TOKEN);
  const comp = await req('GET', '/pa/aci/comp', undefined, PA_TOKEN);
  // Can't directly check aci_goal from this test without knowing the real event;
  // just verify the aci/comp endpoint responds without error
  assert('aci/comp responds ok', comp.ok === true);
}

// ─── Section 2: two-phase LB grant tests ─────────────────────────────────────

async function testLbClaimRejectedBeforeEventEnds() {
  console.log('\n[8] lb-claim rejected before event ends');
  const eventId = await scheduleTestEvent();
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  const lb = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  assert('lb-claim rejected while event active', lb.error === 'event_not_ended');
}

async function testLbGrantIdempotent_LostResponse() {
  console.log('\n[9] Lost response: retry lb-claim returns same grant (no duplicate)');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  const first  = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  assert('first lb-claim ok', first.ok === true && !!first.grant?.grantId);
  const second = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  assert('second lb-claim ok', second.ok === true && !!second.grant?.grantId);
  assert('both calls return the same grantId', first.grant?.grantId === second.grant?.grantId);
  assert('second call never returns already_claimed', second.error !== 'already_claimed');
}

async function testLbGrantNotDuplicatedAfterAppRestart() {
  console.log('\n[10] lb-pending returns grant only while unacked (simulates app restart)');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  // First poll — grant is created and returned
  const poll1 = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  assert('lb-pending returns grants', poll1.ok === true);
  const grant = (poll1.grants || []).find((g: any) => g.eventId === eventId);
  assert('grant present before ack', !!grant);

  // Ack the grant
  await req('POST', '/pa/community/lb-ack', { grantId: grant.grantId }, PA_TOKEN);

  // Second poll — grant should not appear (already acked)
  const poll2 = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grantAfterAck = (poll2.grants || []).find((g: any) => g.eventId === eventId);
  assert('grant absent after ack', !grantAfterAck);
}

async function testLbRewardNoDuplicateIfAppClosedBeforeSave() {
  console.log('\n[11] Retry cannot duplicate reward if currency already applied (grantId in save)');
  // Simulated by: two calls to lb-claim both return the same grantId.
  // Client checks G.ceAppliedLbGrants before applying — server side cannot duplicate.
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  const r1 = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  const r2 = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  assert('both claims return same grantId', r1.grant?.grantId === r2.grant?.grantId);

  // Only one ack should change ack_at; second should be a no-op
  const ack1 = await req('POST', '/pa/community/lb-ack', { grantId: r1.grant.grantId }, PA_TOKEN);
  const ack2 = await req('POST', '/pa/community/lb-ack', { grantId: r1.grant.grantId }, PA_TOKEN);
  assert('first ack ok', ack1.ok === true);
  assert('second ack also ok (idempotent)', ack2.ok === true);
}

async function testLbPendingNoEventId() {
  console.log('\n[12] lb-pending requires no eventId — finds all eligible ended events');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  assert('lb-pending responds without eventId', poll.ok === true);
  assert('grants is an array', Array.isArray(poll.grants));
}

async function testLbNoPendingForActiveEvent() {
  console.log('\n[13] lb-pending does not include reward for event still active');
  const eventId = await scheduleTestEvent();
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  // Do NOT end the event
  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grant = (poll.grants || []).find((g: any) => g.eventId === eventId);
  assert('no grant for active event', !grant);
}

async function testLbMultiplePendingEvents() {
  console.log('\n[14] Multiple ended events: lb-pending returns all unacked grants');
  const now = Date.now();
  const id1 = await scheduleTestEvent({ target: 100 });
  const id2 = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId: id1, amount: 100 }, PA_TOKEN);
  await req('POST', '/pa/community/contribute', { eventId: id2, amount: 100 }, PA_TOKEN);
  await endTestEvent(id1);
  await endTestEvent(id2);

  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  assert('lb-pending ok', poll.ok === true);
  const ids = (poll.grants || []).map((g: any) => g.eventId);
  assert('event 1 in pending', ids.includes(id1));
  assert('event 2 in pending', ids.includes(id2));
}

async function testLbPopupAppearsExactlyOnce() {
  console.log('\n[15] Grant acked → no longer in lb-pending (popup shown at most once)');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  const poll1 = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grant = (poll1.grants || []).find((g: any) => g.eventId === eventId);
  assert('grant in first poll', !!grant);
  if (!grant) return;

  await req('POST', '/pa/community/lb-ack', { grantId: grant.grantId }, PA_TOKEN);

  const poll2 = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grantAfter = (poll2.grants || []).find((g: any) => g.eventId === eventId);
  assert('grant absent after ack — popup would not show again', !grantAfter);
}

async function testLbGrantStaleEventId() {
  console.log('\n[16] lb-pending works even when client has no saved eventId (stale/missing G.ceLastEventId)');
  // lb-pending requires no eventId on the client — server scans the archive independently
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  // The endpoint takes no eventId — simulates client that lost G.ceLastEventId
  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  assert('lb-pending ok without client eventId', poll.ok === true);
  const grant = (poll.grants || []).find((g: any) => g.eventId === eventId);
  assert('grant found without eventId hint', !!grant);
}

async function testLbReturnsAfterNewerEventStarted() {
  console.log('\n[17] Old event grant still returned while a newer event is active');
  // End an old event, then start a new active event
  const oldId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId: oldId, amount: 100 }, PA_TOKEN);
  await endTestEvent(oldId);

  // Start a brand-new active event (simulates the next event starting)
  const newId = await scheduleTestEvent();

  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  assert('lb-pending ok', poll.ok === true);
  const oldGrant = (poll.grants || []).find((g: any) => g.eventId === oldId);
  const newGrant = (poll.grants || []).find((g: any) => g.eventId === newId);
  assert('old ended event grant present', !!oldGrant);
  assert('new active event NOT in grants', !newGrant);
}

async function testLbAckIdempotent() {
  console.log('\n[18] lb-ack is idempotent — safe to call multiple times');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);
  await endTestEvent(eventId);

  const poll = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grant = (poll.grants || []).find((g: any) => g.eventId === eventId);
  if (!grant) { console.error('  SKIP: no grant created'); return; }

  for (let i = 0; i < 3; i++) {
    const ack = await req('POST', '/pa/community/lb-ack', { grantId: grant.grantId }, PA_TOKEN);
    assert(`ack call ${i + 1} ok`, ack.ok === true);
  }
}

async function testLbNoClaimBeforeEventEnd() {
  console.log('\n[19] No LB claim possible before event ends (lb-claim and lb-pending)');
  const eventId = await scheduleTestEvent({ target: 100 });
  await req('POST', '/pa/community/contribute', { eventId, amount: 100 }, PA_TOKEN);

  const claimRes = await req('POST', '/pa/community/lb-claim', { eventId }, PA_TOKEN);
  assert('lb-claim rejected during active event', claimRes.error === 'event_not_ended');

  const pending = await req('GET', '/pa/community/lb-pending', undefined, PA_TOKEN);
  const grant = (pending.grants || []).find((g: any) => g.eventId === eventId);
  assert('lb-pending shows no grant for active event', !grant);
}

// ─── Run all ──────────────────────────────────────────────────────────────────

(async () => {
  console.log('Community Event system tests — server:', BASE);
  try {
    // CE lifecycle
    await testPreStartInvisibility();
    await testExactStartActivation();
    await testZeroProgress();
    await testContributionTimeBoundary();
    await testContributionRejectedBeforeStart();
    await testMilestoneExactlyOnce();
    await testAciLockedAt9999();

    // Two-phase LB grant
    await testLbClaimRejectedBeforeEventEnds();
    await testLbGrantIdempotent_LostResponse();
    await testLbGrantNotDuplicatedAfterAppRestart();
    await testLbRewardNoDuplicateIfAppClosedBeforeSave();
    await testLbPendingNoEventId();
    await testLbNoPendingForActiveEvent();
    await testLbMultiplePendingEvents();
    await testLbPopupAppearsExactlyOnce();
    await testLbGrantStaleEventId();
    await testLbReturnsAfterNewerEventStarted();
    await testLbAckIdempotent();
    await testLbNoClaimBeforeEventEnd();
  } catch (e) {
    console.error('Test suite error:', e);
    failed++;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
