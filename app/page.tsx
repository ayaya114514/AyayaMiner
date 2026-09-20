import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { Bomb, Flag, MousePointer2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  type Cell,
} from '@/src/engine';

const LONG_PRESS_MS = 430;
const COMPACT_BOARD_QUERY = '(orientation: portrait) and (max-width: 720px)';
type InputMode = 'reveal' | 'flag';

function gameFromLayout(layout: BoardLayout) {
  return createGame(layout.rows, layout.columns, layout.mineCount);
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

function formatCounter(value: number) {
  return Math.max(0, value).toString().padStart(3, '0');
}

function cellLabel(cell: Cell, index: number) {
  if (cell.exploded) return `第 ${index + 1} 格，触发的地雷`;
  if (cell.open && cell.mine) return `第 ${index + 1} 格，地雷`;
  if (cell.flagged) return `第 ${index + 1} 格，已标记`;
  if (cell.open && cell.adjacent === 0) return `第 ${index + 1} 格，安全空白`;
  if (cell.open) return `第 ${index + 1} 格，周围有 ${cell.adjacent} 个地雷`;
  return `第 ${index + 1} 格，未翻开`;
}

export default function Home() {
  const [game, setGame] = useState(initialGame);
  const [elapsed, setElapsed] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('reveal');
  const gameRoot = useRef<HTMLElement>(null);
  const boardArea = useRef<HTMLElement>(null);
  const layout = useRef<BoardLayout>({
    rows: game.rows,
    columns: game.columns,
    mineCount: game.mineCount,
  });
  const startedAt = useRef<number | null>(null);
  const longPress = useRef<{
    timer: number | null;
    suppressedIndex: number | null;
  }>({ timer: null, suppressedIndex: null });

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
      const nextLayout = calculateBoardLayout(
        element.clientWidth,
        element.clientHeight,
        cellSize,
      );
      const currentLayout = layout.current;
      if (
        nextLayout.rows === currentLayout.rows &&
        nextLayout.columns === currentLayout.columns &&
        nextLayout.mineCount === currentLayout.mineCount
      ) {
        return;
      }

      layout.current = nextLayout;
      stopLongPressTimer();
      startedAt.current = null;
      longPress.current.suppressedIndex = null;
      setElapsed(0);
      setGame(gameFromLayout(nextLayout));
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

  useEffect(() => {
    if (game.status !== 'playing' || startedAt.current === null) return;

    const updateTimer = () => {
      if (startedAt.current === null) return;
      setElapsed(
        Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000)),
      );
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(interval);
  }, [game.status]);

  const finishTimer = useCallback(() => {
    if (startedAt.current !== null) {
      setElapsed(
        Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000)),
      );
    }
  }, []);

  const openCell = useCallback(
    (index: number) => {
      const wasReady = game.status === 'ready';
      const nextGame = revealCell(game, index);
      if (nextGame === game) return;

      if (wasReady && nextGame.status !== 'ready') {
        startedAt.current = Date.now();
        setElapsed(0);
      }
      if (nextGame.status === 'won' || nextGame.status === 'lost') {
        finishTimer();
      }
      if (nextGame.status === 'lost') navigator.vibrate?.(35);
      if (nextGame.status === 'won') navigator.vibrate?.([20, 40, 20]);
      setGame(nextGame);
    },
    [finishTimer, game],
  );

  const markCell = useCallback((index: number) => {
    setGame((current) => toggleFlag(current, index));
  }, []);

  const handleCellClick = (index: number) => {
    if (longPress.current.suppressedIndex === index) {
      longPress.current.suppressedIndex = null;
      return;
    }
    if (inputMode === 'flag') markCell(index);
    else openCell(index);
  };

  const reset = useCallback(() => {
    stopLongPressTimer();
    startedAt.current = null;
    longPress.current.suppressedIndex = null;
    setElapsed(0);
    setGame(gameFromLayout(layout.current));
  }, [stopLongPressTimer]);

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.pointerType === 'mouse') return;
    stopLongPressTimer();
    event.currentTarget.setPointerCapture(event.pointerId);
    longPress.current.timer = window.setTimeout(() => {
      markCell(index);
      longPress.current.suppressedIndex = index;
      longPress.current.timer = null;
      navigator.vibrate?.(12);
    }, LONG_PRESS_MS);
  };

  const boardStyle = {
    '--columns': game.columns,
  } as CSSProperties;
  const isComplete = game.status === 'won' || game.status === 'lost';

  return (
    <main ref={gameRoot} className="game">
      <header>
        <h1>AyayaMiner</h1>
        <div className="controls" aria-label="游戏状态">
          <dl>
            <div>
              <dt>雷</dt>
              <dd>{formatCounter(minesRemaining(game))}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{formatCounter(elapsed)}</dd>
            </div>
          </dl>
          <Button
            className={`mode-toggle ${inputMode === 'flag' ? 'active' : ''}`}
            variant="outline"
            size="sm"
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
          </Button>
          <Button
            className="reset"
            variant="outline"
            size="icon"
            onClick={reset}
            aria-label="重新开始"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section ref={boardArea} className="board-area" aria-label="扫雷棋盘">
        <div
          className="board"
          data-input-mode={inputMode}
          aria-label={`${game.columns} 列 ${game.rows} 行，${game.mineCount} 个地雷`}
          style={boardStyle}
        >
          {game.cells.map((cell, index) => {
            const wrongFlag =
              game.status === 'lost' && cell.flagged && !cell.mine;
            const className = [
              'cell',
              cell.open ? 'open' : '',
              cell.flagged ? 'flagged' : '',
              cell.open && cell.mine ? 'mine' : '',
              cell.exploded ? 'exploded' : '',
              wrongFlag ? 'wrong' : '',
              cell.open && !cell.mine && cell.adjacent > 0
                ? `number n${cell.adjacent}`
                : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                className={className}
                key={index}
                type="button"
                aria-label={cellLabel(cell, index)}
                aria-pressed={cell.flagged}
                disabled={isComplete}
                onClick={() => handleCellClick(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  markCell(index);
                }}
                onKeyDown={(event) => {
                  if (event.key.toLowerCase() === 'f') {
                    event.preventDefault();
                    markCell(index);
                  }
                }}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerUp={stopLongPressTimer}
                onPointerCancel={stopLongPressTimer}
              >
                {cell.flagged && !cell.open && !wrongFlag && (
                  <Flag aria-hidden="true" fill="currentColor" />
                )}
                {wrongFlag && <span aria-hidden="true">×</span>}
                {cell.open && cell.mine && <Bomb aria-hidden="true" />}
                {cell.open && !cell.mine && cell.adjacent > 0 && cell.adjacent}
              </button>
            );
          })}
        </div>

        {isComplete && (
          <div className="result" role="alert" aria-live="assertive">
            <h2>{game.status === 'won' ? '完成' : '触雷'}</h2>
            <p>
              {game.status === 'won'
                ? `${elapsed} 秒`
                : `${game.openedCount} / ${game.cells.length - game.mineCount}`}
            </p>
            <Button className="again" variant="outline" onClick={reset}>
              重新开始
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
