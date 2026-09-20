import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateNoGuessLayout,
  isSolvableWithoutGuessing,
} from './no-guess.ts';

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

void describe('no-guess generator', () => {
  void it('generates a solver-verified board from the first click', () => {
    const rows = 16;
    const columns = 30;
    const mineCount = 99;
    const firstIndex = 225;
    const layout = generateNoGuessLayout(
      rows,
      columns,
      mineCount,
      firstIndex,
      seededRandom(7),
    );

    assert.equal(
      layout.mines.reduce((sum, mine) => sum + mine, 0),
      mineCount,
    );
    assert.equal(layout.mines[firstIndex], 0);
    assert.equal(
      isSolvableWithoutGuessing(layout, rows, columns, mineCount, firstIndex),
      true,
    );
  });

  void it('handles the large high-density desktop layout', () => {
    const rows = 29;
    const columns = 50;
    const mineCount = 363;
    const firstIndex = 725;
    const layout = generateNoGuessLayout(
      rows,
      columns,
      mineCount,
      firstIndex,
      seededRandom(42),
    );

    assert.equal(
      layout.mines.reduce((sum, mine) => sum + mine, 0),
      mineCount,
    );
    assert.equal(
      isSolvableWithoutGuessing(layout, rows, columns, mineCount, firstIndex),
      true,
    );
  });

  void it('keeps an edge first click solvable on the mobile layout', () => {
    const rows = 16;
    const columns = 34;
    const mineCount = 136;
    const firstIndex = 0;
    const layout = generateNoGuessLayout(
      rows,
      columns,
      mineCount,
      firstIndex,
      seededRandom(11),
    );

    assert.equal(layout.mines[firstIndex], 0);
    assert.equal(
      isSolvableWithoutGuessing(layout, rows, columns, mineCount, firstIndex),
      true,
    );
  });
});
