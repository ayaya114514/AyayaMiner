import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Bomb, Flag, MousePointer2, RotateCcw } from 'lucide-react';
import {
  canFitBoardArea,
  calculateBoardLayout,
  COMPACT_CELL_SIZE,
  DESKTOP_CELL_SIZE,
  type BoardLayout,
} from '@/src/board-layout';
import {
  createGame,
  minesRemaining,
  revealCell,
  toggleFlag,
  type GameState,
} from '@/src/engine';

const LONG_PRESS_MS = 430;
const COMPACT_BOARD_QUERY = '(orientation: portrait) and (max-width: 720px)';
type InputMode = 'reveal' | 'flag';

function gameFromLayout(layout: BoardLayout) {
  return createGame(layout.rows, layout.columns, layout.mineCount);
}

function matchesLayout(game: GameState, layout: BoardLayout) {
  return (
    game.rows === layout.rows &&
    game.columns === layout.columns &&
    game.mineCount === layout.mineCount
  );
}

function initialGame() {
  const cellSize = window.matchMedia(COMPACT_BOARD_QUERY).matches
    ? COMPACT_CELL_SIZE
    : DESKTOP_CELL_SIZE;
  const layout = calculateBoardLayout(
    Math.max(1, window.innerWidth - 20),
    Math.max(1, window.innerHeight - 62),
    cellSize,
  );
  return gameFromLayout(layout);
}

function formatMines(value: number) {
  if (value < 0) return `-${Math.abs(value).toString().padStart(2, '0')}`;
  return value.toString().padStart(3, '0');
}

function formatElapsed(seconds: number) {
  if (seconds < 1000) return seconds.toString().padStart(3, '0');
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function elapsedSince(startedAt: number) {
  return Math.floor((Date.now() - startedAt) / 1000);
}

type CellProps = {
  index: number;
  mine: boolean;
  adjacent: number;
  open: boolean;
  flagged: boolean;
  exploded: boolean;
  wrongFlag: boolean;
  tabStop: boolean;
  disabled: boolean;
};

function cellLabel(cell: CellProps) {
  const position = `第 ${cell.index + 1} 格`;
  if (cell.exploded) return `${position}，触发的地雷`;
  if (cell.open && cell.mine) return `${position}，地雷`;
  if (cell.flagged) return `${position}，已标记`;
  if (cell.open && cell.adjacent === 0) return `${position}，安全空白`;
  if (cell.open) return `${position}，周围有 ${cell.adjacent} 个地雷`;
  return `${position}，未翻开`;
}

// The engine copies every cell on each move, so cells take primitive props:
// only the cells that actually changed re-render. Input is delegated to the
// board, so no per-cell handlers break the memo either.
const CellButton = memo(function CellButton(props: CellProps) {
  const { index, mine, adjacent, open, flagged, exploded, wrongFlag } = props;
  const className = [
    'cell',
    open ? 'open' : '',
    flagged ? 'flagged' : '',
    open && mine ? 'mine' : '',
    exploded ? 'exploded' : '',
    wrongFlag ? 'wrong' : '',
    open && !mine && adjacent > 0 ? `number n${adjacent}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={className}
      type="button"
      data-index={index}
      tabIndex={props.tabStop ? 0 : -1}
      aria-label={cellLabel(props)}
      aria-pressed={flagged}
      disabled={props.disabled}
    >
      {flagged && !open && !wrongFlag && (
        <Flag aria-hidden="true" fill="currentColor" />
      )}
      {wrongFlag && <span aria-hidden="true">×</span>}
      {open && mine && <Bomb aria-hidden="true" />}
      {open && !mine && adjacent > 0 && adjacent}
    </button>
  );
});

// Ticks on its own so the board does not re-render four times a second.
function Clock({
  startedAt,
  running,
  value,
}: {
  startedAt: number | null;
  running: boolean;
  value: number;
}) {
  const [now, setNow] = useState(value);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const update = () => setNow(elapsedSince(startedAt));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [running, startedAt]);

  return <dd>{formatElapsed(running ? now : value)}</dd>;
}

function cellIndexOf(target: EventTarget) {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>('button.cell');
  if (!button || button.disabled) return null;
  const index = Number(button.dataset.index);
  return Number.isInteger(index) ? { button, index } : null;
}

export default function Home() {
  const [game, setGame] = useState(initialGame);
  const [elapsed, setElapsed] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('reveal');
  const [focusIndex, setFocusIndex] = useState(0);
  const [resultDismissed, setResultDismissed] = useState(false);
  const gameRoot = useRef<HTMLElement>(null);
  const boardArea = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const currentGame = useRef(game);
  const layout = useRef<BoardLayout>({
    rows: game.rows,
    columns: game.columns,
    mineCount: game.mineCount,
  });
  const startedAt = useRef<number | null>(null);
  const [clockStart, setClockStart] = useState<number | null>(null);
  const longPress = useRef<{
    timer: number | null;
    suppressedIndex: number | null;
  }>({ timer: null, suppressedIndex: null });

  useEffect(() => {
    currentGame.current = game;
  }, [game]);

  const stopLongPressTimer = useCallback(() => {
    if (longPress.current.timer !== null) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  }, []);

  useEffect(() => stopLongPressTimer, [stopLongPressTimer]);

  useEffect(() => {
    const element = boardArea.current;
    const root = gameRoot.current;
    if (!element || !root) return;

    let suspended = document.visibilityState !== 'visible';
    let syncFrame: number | null = null;

    const syncBoardToArea = () => {
      syncFrame = null;
      if (suspended || document.visibilityState !== 'visible') return;

      const cellSize =
        Number.parseFloat(
          window.getComputedStyle(element).getPropertyValue('--cell-size'),
        ) || DESKTOP_CELL_SIZE;
      if (
        !canFitBoardArea(
          window.innerWidth - 20,
          window.innerHeight - 62,
          cellSize,
        )
      ) {
        return;
      }

      root.style.setProperty('--app-height', `${window.innerHeight}px`);
      if (
        !canFitBoardArea(element.clientWidth, element.clientHeight, cellSize)
      ) {
        return;
      }

      // Remember the latest size for the next game, but never replace a board
      // that is in progress or finished: resizing must not lose the game.
      layout.current = calculateBoardLayout(
        element.clientWidth,
        element.clientHeight,
        cellSize,
      );
      const current = currentGame.current;
      if (
        current.status !== 'ready' ||
        matchesLayout(current, layout.current)
      ) {
        return;
      }

      stopLongPressTimer();
      longPress.current.suppressedIndex = null;
      setGame(gameFromLayout(layout.current));
    };

    const scheduleBoardSync = () => {
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = window.requestAnimationFrame(syncBoardToArea);
      });
    };

    const suspendBoardSync = () => {
      suspended = true;
      if (syncFrame !== null) {
        window.cancelAnimationFrame(syncFrame);
        syncFrame = null;
      }
      stopLongPressTimer();
      longPress.current.suppressedIndex = null;
    };

    const resumeBoardSync = () => {
      suspended = document.visibilityState !== 'visible';
      if (!suspended) scheduleBoardSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeBoardSync();
      else suspendBoardSync();
    };

    const resizeObserver = new ResizeObserver(scheduleBoardSync);
    resizeObserver.observe(element);
    window.addEventListener('resize', scheduleBoardSync);
    window.addEventListener('pagehide', suspendBoardSync);
    window.addEventListener('pageshow', resumeBoardSync);
    window.visualViewport?.addEventListener('resize', scheduleBoardSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleBoardSync();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleBoardSync);
      window.removeEventListener('pagehide', suspendBoardSync);
      window.removeEventListener('pageshow', resumeBoardSync);
      window.visualViewport?.removeEventListener('resize', scheduleBoardSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
    };
  }, [stopLongPressTimer]);

  const isComplete = game.status === 'won' || game.status === 'lost';
  const showResult = isComplete && !resultDismissed;

  useEffect(() => {
    if (!showResult) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setResultDismissed(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResult]);

  const openCell = useCallback(
    (index: number) => {
      const wasReady = game.status === 'ready';
      let nextGame: GameState;
      try {
        nextGame = revealCell(game, index);
      } catch (error) {
        // Board generation failed; stay ready so the next click retries.
        console.error(error);
        return;
      }
      if (nextGame === game) return;

      if (wasReady && nextGame.status !== 'ready') {
        startedAt.current = Date.now();
        setClockStart(startedAt.current);
        setElapsed(0);
      }
      if (
        (nextGame.status === 'won' || nextGame.status === 'lost') &&
        startedAt.current !== null
      ) {
        setElapsed(elapsedSince(startedAt.current));
      }
      if (nextGame.status === 'lost') navigator.vibrate?.(35);
      if (nextGame.status === 'won') navigator.vibrate?.([20, 40, 20]);
      setGame(nextGame);
    },
    [game],
  );

  const markCell = useCallback((index: number) => {
    setGame((current) => toggleFlag(current, index));
  }, []);

  const completeLongPress = useCallback(
    (index: number) => {
      stopLongPressTimer();
      markCell(index);
      longPress.current.suppressedIndex = index;
      navigator.vibrate?.(12);
    },
    [markCell, stopLongPressTimer],
  );

  const handleCellClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = cellIndexOf(event.target);
    if (!target) return;
    const { index } = target;
    if (longPress.current.suppressedIndex === index) {
      longPress.current.suppressedIndex = null;
      return;
    }
    // Numbers still chord in flag mode, so flagging never blocks progress.
    if (inputMode === 'flag' && !game.cells[index].open) markCell(index);
    else openCell(index);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const target = cellIndexOf(event.target);
    if (!target) return;
    event.preventDefault();
    const { index } = target;
    // Android fires contextmenu on a touch long press as well; let it finish
    // the pending long press instead of toggling the flag a second time.
    if (longPress.current.timer !== null) completeLongPress(index);
    else if (longPress.current.suppressedIndex !== index) markCell(index);
  };

  const reset = useCallback(() => {
    stopLongPressTimer();
    startedAt.current = null;
    setClockStart(null);
    longPress.current.suppressedIndex = null;
    setElapsed(0);
    setResultDismissed(false);
    setGame(gameFromLayout(layout.current));
  }, [stopLongPressTimer]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = cellIndexOf(event.target);
    if (!target) return;
    const { button, index } = target;
    // A long press that never produced a click must not swallow a later tap.
    longPress.current.suppressedIndex = null;
    if (event.pointerType === 'mouse') return;
    stopLongPressTimer();
    button.setPointerCapture(event.pointerId);
    longPress.current.timer = window.setTimeout(
      () => completeLongPress(index),
      LONG_PRESS_MS,
    );
  };

  const handleCellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cell = cellIndexOf(event.target);
    if (!cell) return;
    const { index } = cell;
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      markCell(index);
      return;
    }

    const row = Math.floor(index / game.columns);
    const column = index % game.columns;
    let nextRow = row;
    let nextColumn = column;
    if (event.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
    else if (event.key === 'ArrowDown')
      nextRow = Math.min(game.rows - 1, row + 1);
    else if (event.key === 'ArrowLeft') nextColumn = Math.max(0, column - 1);
    else if (event.key === 'ArrowRight')
      nextColumn = Math.min(game.columns - 1, column + 1);
    else if (event.key === 'Home') nextColumn = 0;
    else if (event.key === 'End') nextColumn = game.columns - 1;
    else return;

    event.preventDefault();
    const nextIndex = nextRow * game.columns + nextColumn;
    setFocusIndex(nextIndex);
    const target = board.current?.children[nextIndex];
    if (target instanceof HTMLElement) target.focus();
  };

  const boardStyle = {
    '--columns': game.columns,
  } as CSSProperties;
  const tabStop = Math.min(focusIndex, game.cells.length - 1);

  return (
    <main ref={gameRoot} className="game">
      <header>
        <h1>AyayaMiner</h1>
        <div className="controls" aria-label="游戏状态">
          <dl>
            <div>
              <dt>雷</dt>
              <dd>{formatMines(minesRemaining(game))}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <Clock
                startedAt={clockStart}
                running={game.status === 'playing'}
                value={elapsed}
              />
            </div>
          </dl>
          <button
            className={`tool mode-toggle ${inputMode === 'flag' ? 'active' : ''}`}
            type="button"
            onClick={() =>
              setInputMode((current) =>
                current === 'reveal' ? 'flag' : 'reveal',
              )
            }
            aria-label={`当前为${inputMode === 'reveal' ? '翻开' : '插旗'}模式，点击切换为${inputMode === 'reveal' ? '插旗' : '翻开'}模式`}
            aria-pressed={inputMode === 'flag'}
          >
            {inputMode === 'reveal' ? (
              <MousePointer2 aria-hidden="true" />
            ) : (
              <Flag aria-hidden="true" fill="currentColor" />
            )}
            {inputMode === 'reveal' ? '翻开' : '插旗'}
          </button>
          <button
            className="tool reset"
            type="button"
            onClick={reset}
            aria-label="重新开始"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      <section
        ref={boardArea}
        className="board-area"
        aria-label={`扫雷棋盘，${game.columns} 列 ${game.rows} 行，${game.mineCount} 个地雷`}
      >
        <div className="board-scroll">
          <div
            ref={board}
            // Only delegates the cells' input; the buttons stay the controls.
            role="presentation"
            className="board"
            data-input-mode={inputMode}
            style={boardStyle}
            onClick={handleCellClick}
            onContextMenu={handleContextMenu}
            onKeyDown={handleCellKeyDown}
            onPointerDown={handlePointerDown}
            onPointerUp={stopLongPressTimer}
            onPointerCancel={stopLongPressTimer}
          >
            {game.cells.map((cell, index) => (
              <CellButton
                key={index}
                index={index}
                mine={cell.mine}
                adjacent={cell.adjacent}
                open={cell.open}
                flagged={cell.flagged}
                exploded={cell.exploded}
                wrongFlag={game.status === 'lost' && cell.flagged && !cell.mine}
                tabStop={index === tabStop}
                disabled={isComplete}
              />
            ))}
          </div>
        </div>

        {showResult && (
          <div className="result-layer">
            {/* Tapping outside the panel hides it so the final board is visible. */}
            <button
              className="result-backdrop"
              type="button"
              tabIndex={-1}
              aria-label="查看棋盘"
              onClick={() => setResultDismissed(true)}
            />
            <div className="result" role="alert">
              <h2>{game.status === 'won' ? '完成' : '触雷'}</h2>
              <p>
                {game.status === 'won'
                  ? formatDuration(elapsed)
                  : `${game.openedCount} / ${game.cells.length - game.mineCount}`}
              </p>
              <button className="tool again" type="button" onClick={reset}>
                重新开始
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
