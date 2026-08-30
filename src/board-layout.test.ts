import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateBoardLayout,
  CELL_GAP,
  COMPACT_CELL_SIZE,
  DESKTOP_CELL_SIZE,
  HARD_MINE_DENSITY,
} from './board-layout.ts';

function renderedSize(trackCount: number, cellSize: number) {
  return trackCount * cellSize + (trackCount - 1) * CELL_GAP;
}

void describe('responsive board layout', () => {
  void it('fills a desktop board area with fixed-size cells', () => {
    const width = 1420;
    const height = 838;
    const layout = calculateBoardLayout(width, height, DESKTOP_CELL_SIZE);

    assert.deepEqual(layout, { rows: 29, columns: 50, mineCount: 363 });
    assert.ok(renderedSize(layout.columns, DESKTOP_CELL_SIZE) <= width);
    assert.ok(renderedSize(layout.rows, DESKTOP_CELL_SIZE) <= height);
    assert.ok(
      width - renderedSize(layout.columns, DESKTOP_CELL_SIZE) <
        DESKTOP_CELL_SIZE + CELL_GAP,
    );
    assert.equal(
      layout.mineCount,
      Math.round(layout.rows * layout.columns * HARD_MINE_DENSITY),
    );
  });

  void it('keeps compact cells while filling a portrait board area', () => {
    const layout = calculateBoardLayout(370, 782, COMPACT_CELL_SIZE);

    assert.deepEqual(layout, { rows: 34, columns: 16, mineCount: 136 });
    assert.ok(renderedSize(layout.columns, COMPACT_CELL_SIZE) <= 370);
    assert.ok(renderedSize(layout.rows, COMPACT_CELL_SIZE) <= 782);
  });

  void it('rejects invalid board measurements', () => {
    assert.throws(() => calculateBoardLayout(0, 100, DESKTOP_CELL_SIZE));
    assert.throws(() => calculateBoardLayout(100, 100, Number.NaN));
  });
});
