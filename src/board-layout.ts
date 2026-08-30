export const CELL_GAP = 1;
export const DESKTOP_CELL_SIZE = 27;
export const COMPACT_CELL_SIZE = 22;
export const HARD_MINE_DENSITY = 0.25;

export type BoardLayout = {
  rows: number;
  columns: number;
  mineCount: number;
};

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
  const columns = Math.max(2, Math.floor((availableWidth + CELL_GAP) / pitch));
  const rows = Math.max(2, Math.floor((availableHeight + CELL_GAP) / pitch));
  const cellCount = rows * columns;
  const mineCount = Math.max(
    1,
    Math.min(cellCount - 1, Math.round(cellCount * HARD_MINE_DENSITY)),
  );

  return { rows, columns, mineCount };
}
