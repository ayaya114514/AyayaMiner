export const CELL_GAP = 1;
export const DESKTOP_CELL_SIZE = 27;
export const COMPACT_CELL_SIZE = 22;
export const HARD_MINE_DENSITY = 0.25;
// Generating a no-guess board blocks the first click; beyond ~1080p-sized
// boards that pause becomes noticeable, so very large viewports stop filling.
export const MAX_BOARD_CELLS = 2500;

export type BoardLayout = {
  rows: number;
  columns: number;
  mineCount: number;
};

export function canFitBoardArea(
  availableWidth: number,
  availableHeight: number,
  cellSize: number,
): boolean {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    !Number.isFinite(cellSize) ||
    cellSize <= 0
  ) {
    return false;
  }

  const minimumBoardSize = cellSize * 4 + CELL_GAP * 3;
  return (
    availableWidth >= minimumBoardSize && availableHeight >= minimumBoardSize
  );
}

export function calculateBoardLayout(
  availableWidth: number,
  availableHeight: number,
  cellSize: number,
): BoardLayout {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    !Number.isFinite(cellSize) ||
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    cellSize <= 0
  ) {
    throw new Error('Invalid board area');
  }

  const pitch = cellSize + CELL_GAP;
  let columns = Math.max(2, Math.floor((availableWidth + CELL_GAP) / pitch));
  let rows = Math.max(2, Math.floor((availableHeight + CELL_GAP) / pitch));
  if (rows * columns > MAX_BOARD_CELLS) {
    const scale = Math.sqrt(MAX_BOARD_CELLS / (rows * columns));
    rows = Math.max(2, Math.floor(rows * scale));
    columns = Math.min(columns, Math.floor(MAX_BOARD_CELLS / rows));
  }
  const cellCount = rows * columns;
  const mineCount = Math.max(
    1,
    Math.min(cellCount - 1, Math.round(cellCount * HARD_MINE_DENSITY)),
  );

  return { rows, columns, mineCount };
}
