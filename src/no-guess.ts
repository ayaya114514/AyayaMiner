export type RandomSource = () => number;

export type MineLayout = {
  mines: Uint8Array;
  adjacent: Uint8Array;
};

type Constraint = {
  cells: number[];
  mines: number;
};

type SolverResult = {
  solved: boolean;
  contradiction: boolean;
  openedCount: number;
  open: Uint8Array;
  constraints: Constraint[];
};

const MAX_RESTARTS = 12;
const MAX_PERTURBATIONS = 192;
const MAX_STAGNANT_PERTURBATIONS = 18;

function buildNeighborMap(rows: number, columns: number): number[][] {
  return Array.from({ length: rows * columns }, (_, index) => {
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
  });
}

function calculateAdjacent(
  mines: Uint8Array,
  neighbors: number[][],
): Uint8Array {
  const adjacent = new Uint8Array(mines.length);
  for (let index = 0; index < mines.length; index += 1) {
    if (mines[index]) continue;
    let count = 0;
    for (const neighbor of neighbors[index]) count += mines[neighbor];
    adjacent[index] = count;
  }
  return adjacent;
}

function protectedIndexes(
  firstIndex: number,
  neighbors: number[][],
  mineCount: number,
): Set<number> {
  const opening = new Set([firstIndex, ...neighbors[firstIndex]]);
  if (neighbors.length - opening.size >= mineCount) return opening;
  return new Set([firstIndex]);
}

function shuffled<T>(values: T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function randomLayout(
  cellCount: number,
  mineCount: number,
  protectedCells: Set<number>,
  neighbors: number[][],
  random: RandomSource,
): MineLayout {
  const candidates = shuffled(
    Array.from({ length: cellCount }, (_, index) => index).filter(
      (index) => !protectedCells.has(index),
    ),
    random,
  );
  const mines = new Uint8Array(cellCount);
  for (const index of candidates.slice(0, mineCount)) mines[index] = 1;
  return { mines, adjacent: calculateAdjacent(mines, neighbors) };
}

function isSubset(subset: number[], superset: number[]): boolean {
  let subsetIndex = 0;
  let supersetIndex = 0;
  while (subsetIndex < subset.length && supersetIndex < superset.length) {
    if (subset[subsetIndex] === superset[supersetIndex]) {
      subsetIndex += 1;
      supersetIndex += 1;
    } else if (subset[subsetIndex] > superset[supersetIndex]) {
      supersetIndex += 1;
    } else {
      return false;
    }
  }
  return subsetIndex === subset.length;
}

function difference(superset: number[], subset: number[]): number[] {
  const subsetSet = new Set(subset);
  return superset.filter((index) => !subsetSet.has(index));
}

function solveLayout(
  layout: MineLayout,
  mineCount: number,
  firstIndex: number,
  neighbors: number[][],
): SolverResult {
  const open = new Uint8Array(layout.mines.length);
  const knownMines = new Uint8Array(layout.mines.length);
  let openedCount = 0;
  let knownMineCount = 0;
  let latestConstraints: Constraint[] = [];

  const reveal = (startIndexes: number[]): boolean => {
    const queue = [...startIndexes];
    const queued = new Set(queue);
    while (queue.length > 0) {
      const index = queue.shift()!;
      if (open[index] || knownMines[index]) continue;
      if (layout.mines[index]) return false;
      open[index] = 1;
      openedCount += 1;
      if (layout.adjacent[index] !== 0) continue;
      for (const neighbor of neighbors[index]) {
        if (!open[neighbor] && !knownMines[neighbor] && !queued.has(neighbor)) {
          queue.push(neighbor);
          queued.add(neighbor);
        }
      }
    }
    return true;
  };

  if (!reveal([firstIndex])) {
    return {
      solved: false,
      contradiction: true,
      openedCount,
      open,
      constraints: [],
    };
  }

  while (openedCount < layout.mines.length - mineCount) {
    const constraintMap = new Map<string, Constraint>();
    let contradiction = false;

    for (let index = 0; index < open.length; index += 1) {
      if (!open[index]) continue;
      const unknown: number[] = [];
      let adjacentKnownMines = 0;
      for (const neighbor of neighbors[index]) {
        if (knownMines[neighbor]) adjacentKnownMines += 1;
        else if (!open[neighbor]) unknown.push(neighbor);
      }
      if (unknown.length === 0) {
        if (adjacentKnownMines !== layout.adjacent[index]) {
          contradiction = true;
          break;
        }
        continue;
      }

      unknown.sort((a, b) => a - b);
      const remainingMines = layout.adjacent[index] - adjacentKnownMines;
      if (remainingMines < 0 || remainingMines > unknown.length) {
        contradiction = true;
        break;
      }
      const key = unknown.join(',');
      const existing = constraintMap.get(key);
      if (existing && existing.mines !== remainingMines) {
        contradiction = true;
        break;
      }
      constraintMap.set(key, { cells: unknown, mines: remainingMines });
    }

    latestConstraints = [...constraintMap.values()];
    if (contradiction) {
      return {
        solved: false,
        contradiction: true,
        openedCount,
        open,
        constraints: latestConstraints,
      };
    }

    const safeMoves = new Set<number>();
    const mineMoves = new Set<number>();
    for (const constraint of latestConstraints) {
      if (constraint.mines === 0) {
        for (const index of constraint.cells) safeMoves.add(index);
      } else if (constraint.mines === constraint.cells.length) {
        for (const index of constraint.cells) mineMoves.add(index);
      }
    }

    for (let left = 0; left < latestConstraints.length; left += 1) {
      const subset = latestConstraints[left];
      for (let right = 0; right < latestConstraints.length; right += 1) {
        if (left === right) continue;
        const superset = latestConstraints[right];
        if (
          subset.cells.length >= superset.cells.length ||
          !isSubset(subset.cells, superset.cells)
        ) {
          continue;
        }
        const remainingCells = difference(superset.cells, subset.cells);
        const remainingMines = superset.mines - subset.mines;
        if (remainingMines === 0) {
          for (const index of remainingCells) safeMoves.add(index);
        } else if (remainingMines === remainingCells.length) {
          for (const index of remainingCells) mineMoves.add(index);
        }
      }
    }

    const unknown: number[] = [];
    for (let index = 0; index < open.length; index += 1) {
      if (!open[index] && !knownMines[index]) unknown.push(index);
    }
    const remainingGlobalMines = mineCount - knownMineCount;
    if (remainingGlobalMines === 0) {
      for (const index of unknown) safeMoves.add(index);
    } else if (remainingGlobalMines === unknown.length) {
      for (const index of unknown) mineMoves.add(index);
    }

    let madeProgress = false;
    for (const index of mineMoves) {
      if (safeMoves.has(index) || !layout.mines[index]) {
        contradiction = true;
        break;
      }
      if (!knownMines[index]) {
        knownMines[index] = 1;
        knownMineCount += 1;
        madeProgress = true;
      }
    }
    if (contradiction) {
      return {
        solved: false,
        contradiction: true,
        openedCount,
        open,
        constraints: latestConstraints,
      };
    }

    const safeIndexes = [...safeMoves].filter(
      (index) => !open[index] && !knownMines[index],
    );
    if (safeIndexes.some((index) => layout.mines[index])) {
      return {
        solved: false,
        contradiction: true,
        openedCount,
        open,
        constraints: latestConstraints,
      };
    }
    if (safeIndexes.length > 0) {
      if (!reveal(safeIndexes)) {
        return {
          solved: false,
          contradiction: true,
          openedCount,
          open,
          constraints: latestConstraints,
        };
      }
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  return {
    solved: openedCount === layout.mines.length - mineCount,
    contradiction: false,
    openedCount,
    open,
    constraints: latestConstraints,
  };
}

function perturbLayout(
  layout: MineLayout,
  solver: SolverResult,
  protectedCells: Set<number>,
  neighbors: number[][],
  random: RandomSource,
): boolean {
  const choices = solver.constraints
    .map((constraint) => ({
      constraint,
      mines: constraint.cells.filter((index) => layout.mines[index]),
      random: random(),
    }))
    .filter(
      ({ constraint, mines }) =>
        mines.length > 0 && mines.length < constraint.cells.length,
    )
    .sort(
      (left, right) =>
        left.mines.length - right.mines.length ||
        right.constraint.cells.length - left.constraint.cells.length ||
        left.random - right.random,
    );

  for (const { constraint, mines } of choices) {
    const constraintCells = new Set(constraint.cells);
    const targets = Array.from(
      { length: layout.mines.length },
      (_, index) => index,
    )
      .filter(
        (index) =>
          !layout.mines[index] &&
          !constraintCells.has(index) &&
          !protectedCells.has(index),
      )
      .map((index) => {
        const bordersOpenCell = neighbors[index].some(
          (neighbor) => solver.open[neighbor],
        );
        return {
          index,
          rank: solver.open[index] ? 2 : bordersOpenCell ? 1 : 0,
          random: random(),
        };
      })
      .sort(
        (left, right) => left.rank - right.rank || left.random - right.random,
      )
      .slice(0, mines.length);

    if (targets.length !== mines.length) continue;
    for (const index of mines) layout.mines[index] = 0;
    for (const target of targets) layout.mines[target.index] = 1;
    layout.adjacent = calculateAdjacent(layout.mines, neighbors);
    return true;
  }

  return false;
}

export function isSolvableWithoutGuessing(
  layout: MineLayout,
  rows: number,
  columns: number,
  mineCount: number,
  firstIndex: number,
): boolean {
  if (layout.mines.length !== rows * columns) return false;
  const neighbors = buildNeighborMap(rows, columns);
  return solveLayout(layout, mineCount, firstIndex, neighbors).solved;
}

export function generateNoGuessLayout(
  rows: number,
  columns: number,
  mineCount: number,
  firstIndex: number,
  random: RandomSource = Math.random,
): MineLayout {
  const cellCount = rows * columns;
  if (
    rows < 1 ||
    columns < 1 ||
    mineCount < 1 ||
    mineCount >= cellCount ||
    firstIndex < 0 ||
    firstIndex >= cellCount
  ) {
    throw new Error('Invalid no-guess board dimensions');
  }

  const neighbors = buildNeighborMap(rows, columns);
  const protectedCells = protectedIndexes(firstIndex, neighbors, mineCount);

  for (let restart = 0; restart < MAX_RESTARTS; restart += 1) {
    const layout = randomLayout(
      cellCount,
      mineCount,
      protectedCells,
      neighbors,
      random,
    );
    let bestProgress = -1;
    let stagnantPerturbations = 0;

    for (
      let perturbation = 0;
      perturbation <= MAX_PERTURBATIONS;
      perturbation += 1
    ) {
      const solver = solveLayout(layout, mineCount, firstIndex, neighbors);
      if (solver.solved) return layout;
      if (solver.contradiction) break;

      if (solver.openedCount > bestProgress) {
        bestProgress = solver.openedCount;
        stagnantPerturbations = 0;
      } else {
        stagnantPerturbations += 1;
      }
      if (stagnantPerturbations > MAX_STAGNANT_PERTURBATIONS) break;
      if (!perturbLayout(layout, solver, protectedCells, neighbors, random)) {
        break;
      }
    }
  }

  throw new Error('Unable to generate a no-guess board');
}
