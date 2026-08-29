export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export type Cell = {
  mine: boolean;
  adjacent: number;
  open: boolean;
  flagged: boolean;
  exploded: boolean;
};

export type GameState = {
  rows: number;
  columns: number;
  mineCount: number;
  cells: Cell[];
  status: GameStatus;
  openedCount: number;
  flaggedCount: number;
};

type RandomSource = () => number;

export const EXPERT_MINES = 99;

const emptyCell = (): Cell => ({
  mine: false,
  adjacent: 0,
  open: false,
  flagged: false,
  exploded: false,
});

export function createGame(
  rows = 16,
  columns = 30,
  mineCount = EXPERT_MINES,
): GameState {
  if (rows < 1 || columns < 1 || mineCount < 1 || mineCount >= rows * columns) {
    throw new Error('Invalid board dimensions');
  }

  return {
    rows,
    columns,
    mineCount,
    cells: Array.from({ length: rows * columns }, emptyCell),
    status: 'ready',
    openedCount: 0,
    flaggedCount: 0,
  };
}

export function neighborsOf(
  index: number,
  rows: number,
  columns: number,
): number[] {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const neighbors: number[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (
        nextRow >= 0 &&
        nextRow < rows &&
        nextColumn >= 0 &&
        nextColumn < columns
      ) {
        neighbors.push(nextRow * columns + nextColumn);
      }
    }
  }

  return neighbors;
}

export function placeMines(
  game: GameState,
  firstIndex: number,
  random: RandomSource = Math.random,
): GameState {
  if (game.status !== 'ready') return game;

  const protectedArea = new Set([
    firstIndex,
    ...neighborsOf(firstIndex, game.rows, game.columns),
  ]);
  let candidates = game.cells
    .map((_, index) => index)
    .filter((index) => !protectedArea.has(index));

  if (candidates.length < game.mineCount) {
    candidates = game.cells
      .map((_, index) => index)
      .filter((index) => index !== firstIndex);
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [candidates[index], candidates[target]] = [
      candidates[target],
      candidates[index],
    ];
  }

  const mineIndexes = new Set(candidates.slice(0, game.mineCount));
  const cells = game.cells.map((cell, index) => ({
    ...cell,
    mine: mineIndexes.has(index),
    adjacent: mineIndexes.has(index)
      ? 0
      : neighborsOf(index, game.rows, game.columns).filter((neighbor) =>
          mineIndexes.has(neighbor),
        ).length,
  }));

  return { ...game, cells, status: 'playing' };
}

function openSafeArea(game: GameState, startIndexes: number[]): GameState {
  const cells = game.cells.map((cell) => ({ ...cell }));
  const queue = [...startIndexes];
  const queued = new Set(queue);
  let openedCount = game.openedCount;

  while (queue.length > 0) {
    const index = queue.shift()!;
    const cell = cells[index];
    if (cell.open || cell.flagged || cell.mine) continue;

    cell.open = true;
    openedCount += 1;

    if (cell.adjacent === 0) {
      for (const neighbor of neighborsOf(index, game.rows, game.columns)) {
        const neighborCell = cells[neighbor];
        if (
          !neighborCell.open &&
          !neighborCell.flagged &&
          !neighborCell.mine &&
          !queued.has(neighbor)
        ) {
          queue.push(neighbor);
          queued.add(neighbor);
        }
      }
    }
  }

  const hasWon = openedCount === cells.length - game.mineCount;
  if (hasWon) {
    for (const cell of cells) {
      if (cell.mine) cell.flagged = true;
    }
  }

  return {
    ...game,
    cells,
    openedCount,
    flaggedCount: hasWon ? game.mineCount : game.flaggedCount,
    status: hasWon ? 'won' : game.status,
  };
}

function loseGame(game: GameState, explodedIndex: number): GameState {
  return {
    ...game,
    status: 'lost',
    cells: game.cells.map((cell, index) => ({
      ...cell,
      open: cell.mine || cell.open,
      exploded: index === explodedIndex,
    })),
  };
}

export function revealCell(
  currentGame: GameState,
  index: number,
  random: RandomSource = Math.random,
): GameState {
  if (index < 0 || index >= currentGame.cells.length) return currentGame;
  if (currentGame.status === 'won' || currentGame.status === 'lost')
    return currentGame;

  let game = currentGame;
  const initialCell = game.cells[index];
  if (initialCell.flagged) return game;
  if (game.status === 'ready') game = placeMines(game, index, random);

  const cell = game.cells[index];
  if (cell.open) {
    if (cell.adjacent === 0) return game;
    const neighbors = neighborsOf(index, game.rows, game.columns);
    const adjacentFlags = neighbors.filter(
      (neighbor) => game.cells[neighbor].flagged,
    ).length;
    if (adjacentFlags !== cell.adjacent) return game;

    const hiddenNeighbors = neighbors.filter(
      (neighbor) => !game.cells[neighbor].open && !game.cells[neighbor].flagged,
    );
    const mine = hiddenNeighbors.find((neighbor) => game.cells[neighbor].mine);
    if (mine !== undefined) return loseGame(game, mine);
    return openSafeArea(game, hiddenNeighbors);
  }

  if (cell.mine) return loseGame(game, index);
  return openSafeArea(game, [index]);
}

export function toggleFlag(game: GameState, index: number): GameState {
  if (index < 0 || index >= game.cells.length) return game;
  if (game.status === 'won' || game.status === 'lost' || game.cells[index].open)
    return game;

  const flagged = !game.cells[index].flagged;
  if (flagged && game.flaggedCount >= game.mineCount) return game;

  const cells = game.cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...cell, flagged } : cell,
  );

  return {
    ...game,
    cells,
    flaggedCount: game.flaggedCount + (flagged ? 1 : -1),
  };
}

export function minesRemaining(game: GameState): number {
  return game.mineCount - game.flaggedCount;
}
