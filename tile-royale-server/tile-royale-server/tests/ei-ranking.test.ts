import assert from 'assert';
import { eiLbReward, eiLbPercentile, eiCanSubmit, eiCanClaim, EI_EVENT_WINDOWS } from '../src/eiRanking';

const tokens = (rank: number, total: number) => eiLbReward(rank, total).tokens;

// Below 100 players: real place (owner 2026-11-06, same as ACI).
assert.strictEqual(tokens(1, 1), 10);
assert.strictEqual(tokens(1, 7), 10, 'winner of a 7-player board is 1st place');
assert.strictEqual(tokens(2, 7), 5);
assert.strictEqual(tokens(5, 7), 5);
assert.strictEqual(tokens(6, 7), 3);
assert.strictEqual(tokens(7, 7), 3);
assert.strictEqual(tokens(10, 44), 3);
assert.strictEqual(tokens(11, 44), 1);
assert.strictEqual(tokens(25, 44), 1);
assert.strictEqual(tokens(26, 44), 0);
assert.strictEqual(tokens(25, 99), 1);
assert.strictEqual(tokens(26, 99), 0);

// From 100 players: Top 1 / 5 / 10 / 25 percent.
assert.strictEqual(tokens(1, 100), 10);
assert.strictEqual(tokens(2, 100), 5);
assert.strictEqual(tokens(25, 100), 1);
assert.strictEqual(tokens(26, 100), 0);
assert.strictEqual(tokens(1, 150), 10);
assert.strictEqual(tokens(2, 150), 5, '2/150 = 1.33% is not Top 1%');
assert.strictEqual(tokens(7, 150), 5);
assert.strictEqual(tokens(8, 150), 3);
assert.strictEqual(tokens(15, 150), 3);
assert.strictEqual(tokens(16, 150), 1);
assert.strictEqual(tokens(37, 150), 1);
assert.strictEqual(tokens(38, 150), 0);
assert.strictEqual(tokens(3, 300), 10);
assert.strictEqual(tokens(4, 300), 5);

// Invalid input never pays.
assert.strictEqual(tokens(0, 10), 0);
assert.strictEqual(tokens(11, 10), 0);
assert.strictEqual(eiLbPercentile(1, 0), Infinity);

// Event windows: submit only while running (+10 min grace), claim only after the end (5 min clock skew).
const w = EI_EVENT_WINDOWS.november_event_island;
assert.strictEqual(w.start, Date.parse('2026-11-09T08:00:00Z'));
assert.strictEqual(w.end, Date.parse('2026-11-16T08:00:00Z'));
assert.strictEqual(eiCanSubmit('november_event_island', w.start - 1), false);
assert.strictEqual(eiCanSubmit('november_event_island', w.start), true);
assert.strictEqual(eiCanSubmit('november_event_island', w.end + 9 * 60000), true);
assert.strictEqual(eiCanSubmit('november_event_island', w.end + 11 * 60000), false);
assert.strictEqual(eiCanSubmit('unknown_event', w.start + 1000), false);
assert.strictEqual(eiCanClaim('november_event_island', w.start + 1000), false);
assert.strictEqual(eiCanClaim('november_event_island', w.end - 4 * 60000), true);
assert.strictEqual(eiCanClaim('november_event_island', w.end + 86400000), true);
assert.strictEqual(eiCanClaim('unknown_event', w.end + 1), false);

console.log('ei-ranking: ok');
