import test from 'node:test';
import assert from 'node:assert/strict';
import { toSavingsCircleView, toStroops } from './cuotia-chain.mjs';

test('converts USDC contributions to stroops without losing precision', () => {
  assert.equal(toStroops('25.5'), 255_000_000n);
  assert.equal(toStroops('0.0000001'), 1n);
  assert.throws(() => toStroops('0.00000001'), /up to 7 decimal places/);
});

test('adapts savings contract state to the interface data model', () => {
  const circle = toSavingsCircleView({
    id: 3,
    owner: 'GOWNER',
    name: 'Sample circle',
    frequency: 'weekly',
    contribution: 25_000_000n,
    round: 0,
    rounds_total: 4,
    round_due_at: 1_800_000_000,
    created_at: 1_799_000_000,
    status: 'active',
    members: [
      { address: 'GONE', name: 'Ana' },
      { address: 'GTWO', name: 'Luis' },
    ],
    contributed: [true, false],
    paid_totals: [25_000_000n, 0n],
    claimed: [false, false],
  });

  assert.equal(circle.contribution, 2.5);
  assert.equal(circle.roundsTotal, 4);
  assert.equal(circle.pot, 2.5);
  assert.equal(circle.contributions[0].paid, true);
  assert.equal(circle.contributions[0].total, 2.5);
  assert.equal(circle.complete, false);
});
