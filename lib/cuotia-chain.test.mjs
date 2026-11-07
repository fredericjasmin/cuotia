import test from 'node:test';
import assert from 'node:assert/strict';
import { toSavingsCircleView, toStroops } from './cuotia-chain.mjs';
import { planCircle, rotate } from './auto-pay-keeper.mjs';

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

function sampleCircle(overrides = {}) {
  return toSavingsCircleView({
    id: 7, owner: 'GONE', name: 'Ahorro', frequency: 'weekly', contribution: 10_000_000n,
    round: 0, rounds_total: 3, round_due_at: 1_000, created_at: 0, status: 'active',
    members: [{ address: 'GONE', name: 'Ana' }, { address: 'GTWO', name: 'Luis' }],
    contributed: [false, false], paid_totals: [0n, 0n], claimed: [false, false],
    auto_pay: [true, false],
    ...overrides,
  });
}

test('reads the per-member automatic contribution flag (off when missing)', () => {
  assert.deepEqual(sampleCircle().autoPay, [true, false]);
  assert.deepEqual(sampleCircle({ auto_pay: undefined }).autoPay, [false, false]);
});

test('keeper only collects from members who opted in and have not paid', () => {
  assert.deepEqual(planCircle(sampleCircle(), 500), { advance: false, collect: ['GONE'] });
  assert.deepEqual(planCircle(sampleCircle({ contributed: [true, false] }), 500).collect, []);
  assert.deepEqual(planCircle(sampleCircle({ auto_pay: [false, false] }), 500).collect, []);
});

test('keeper stops collecting after the grace period and advances fully paid rounds when due', () => {
  const graceEnd = 1_000 + 3 * 24 * 60 * 60;
  assert.deepEqual(planCircle(sampleCircle(), graceEnd + 1).collect, []);
  assert.equal(planCircle(sampleCircle({ contributed: [true, true] }), 999).advance, false);
  assert.equal(planCircle(sampleCircle({ contributed: [true, true] }), 1_000).advance, true);
  assert.equal(planCircle(sampleCircle({ contributed: [true, true], round: 2 }), 1_000).advance, false);
  assert.deepEqual(planCircle(sampleCircle({ status: 'cancelled' }), 500), { advance: false, collect: [] });
});

test('keeper ignores circles with unknown tokens or without automatic members', () => {
  const allowed = new Set(['CUSDC']);
  assert.deepEqual(planCircle(sampleCircle({ token: 'CEVIL' }), 500, allowed), { advance: false, collect: [] });
  assert.deepEqual(planCircle(sampleCircle({ token: 'CUSDC' }), 500, allowed).collect, ['GONE']);
  assert.equal(planCircle(sampleCircle({ contributed: [true, true], auto_pay: [false, false] }), 1_000).advance, false);
});

test('keeper scan order rotates so no circle is always last', () => {
  assert.deepEqual(rotate([1, 2, 3, 4], 2), [3, 4, 1, 2]);
  assert.deepEqual(rotate([1, 2, 3], 0), [1, 2, 3]);
  assert.deepEqual(rotate([], 5), []);
});
