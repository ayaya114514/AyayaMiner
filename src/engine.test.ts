import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGame,
  minesRemaining,
  neighborsOf,
  placeMines,
  revealCell,
  toggleFlag,
} from './engine.ts';

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

void describe('AyayaMiner engine', () => {
  void it('creates the fixed expert board', () => {
    const game = createGame();
    assert.equal(game.rows, 16);
    assert.equal(game.columns, 30);
    assert.equal(game.cells.length, 480);
    assert.equal(game.mineCount, 99);
    assert.equal(game.status, 'ready');
  });

  void it('returns only valid neighbors at corners and in the center', () => {
    assert.deepEqual(neighborsOf(0, 3, 3), [1, 3, 4]);
    assert.equal(neighborsOf(4, 3, 3).length, 8);
  });

  void it('places the requested number of mines outside the first-click safe area', () => {
    const game = placeMines(createGame(), 225, seededRandom());
    const protectedArea = new Set([
      225,
      ...neighborsOf(225, game.rows, game.columns),
    ]);
    assert.equal(game.cells.filter((cell) => cell.mine).length, 99);
    assert.equal(
      [...protectedArea].some((index) => game.cells[index].mine),
      false,
    );
  });

  void it('opens on the first click and never detonates it', () => {
    const game = revealCell(createGame(), 225, seededRandom());
    assert.equal(game.status, 'playing');
    assert.equal(game.cells[225].mine, false);
    assert.equal(game.cells[225].open, true);
    assert.ok(game.openedCount >= 1);
  });

  void it('toggles a flag without starting the board', () => {
    const flagged = toggleFlag(createGame(), 7);
    assert.equal(flagged.status, 'ready');
    assert.equal(flagged.cells[7].flagged, true);
    assert.equal(flagged.flaggedCount, 1);
    assert.equal(minesRemaining(flagged), 98);
    assert.equal(revealCell(flagged, 7, seededRandom()), flagged);

    const cleared = toggleFlag(flagged, 7);
    assert.equal(cleared.cells[7].flagged, false);
    assert.equal(cleared.flaggedCount, 0);
    assert.equal(minesRemaining(cleared), 99);
  });

  void it('reveals every mine and marks the detonated cell on loss', () => {
    const started = revealCell(createGame(), 225, seededRandom());
    const mineIndex = started.cells.findIndex((cell) => cell.mine);
    const lost = revealCell(started, mineIndex);
    assert.equal(lost.status, 'lost');
    assert.equal(lost.cells[mineIndex].exploded, true);
    assert.equal(
      lost.cells.filter((cell) => cell.mine && cell.open).length,
      99,
    );
  });

  void it('wins when every safe cell is open', () => {
    let game = revealCell(createGame(4, 4, 1), 0, seededRandom());
    for (
      let index = 0;
      index < game.cells.length && game.status !== 'won';
      index += 1
    ) {
      if (!game.cells[index].mine) game = revealCell(game, index);
    }
    assert.equal(game.status, 'won');
    assert.equal(game.cells.filter((cell) => cell.flagged).length, 1);
  });
});
