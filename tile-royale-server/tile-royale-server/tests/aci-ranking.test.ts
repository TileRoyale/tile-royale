import assert from 'assert';
import { getAciRewardBracket, getAciRewardCutoffs } from '../src/aciRanking';

assert.deepStrictEqual(getAciRewardCutoffs(0), { top1: 0, top3: 0, top5: 0 });
assert.deepStrictEqual(getAciRewardCutoffs(1), { top1: 1, top3: 1, top5: 1 });
assert.deepStrictEqual(getAciRewardCutoffs(10), { top1: 1, top3: 1, top5: 1 });
assert.deepStrictEqual(getAciRewardCutoffs(40), { top1: 1, top3: 1, top5: 2 });
assert.deepStrictEqual(getAciRewardCutoffs(100), { top1: 1, top3: 3, top5: 5 });
assert.deepStrictEqual(getAciRewardCutoffs(250), { top1: 2, top3: 7, top5: 12 });

assert.strictEqual(getAciRewardBracket(1, 1), 'top1');
assert.strictEqual(getAciRewardBracket(1, 10), 'top1');
assert.strictEqual(getAciRewardBracket(2, 10), 'participant');
assert.strictEqual(getAciRewardBracket(1, 40), 'top1');
assert.strictEqual(getAciRewardBracket(2, 40), 'top5');
assert.strictEqual(getAciRewardBracket(3, 40), 'participant');
assert.strictEqual(getAciRewardBracket(2, 100), 'top3');
assert.strictEqual(getAciRewardBracket(4, 100), 'top5');
assert.strictEqual(getAciRewardBracket(6, 100), 'participant');
assert.strictEqual(getAciRewardBracket(null, 100), 'participant');
assert.strictEqual(getAciRewardBracket(1, 0), 'participant');

console.log('ACI ranking cutoff tests passed.');
