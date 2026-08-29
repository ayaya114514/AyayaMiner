import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { Bomb, Flag, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createGame,
  minesRemaining,
  revealCell,
  toggleFlag,
  type Cell,
  type GameState,
} from '@/src/engine';

const LONG_PRESS_MS = 430;

function preferredDimensions() {
  const portrait =
    typeof window !== 'undefined' &&
    window.matchMedia('(orientation: portrait) and (max-width: 720px)').matches;
  return portrait ? { rows: 30, columns: 16 } : { rows: 16, columns: 30 };
}

function freshGame() {
  const { rows, columns } = preferredDimensions();
  return createGame(rows, columns);
}

function formatCounter(value: number) {
  return Math.min(999, Math.max(0, value)).toString().padStart(3, '0');
}

function cellLabel(cell: Cell, index: number) {
  if (cell.exploded) return `第 ${index + 1} 格，触发的地雷`;
  if (cell.open && cell.mine) return `第 ${index + 1} 格，地雷`;
  if (cell.flagged) return `第 ${index + 1} 格，已标记`;
  if (cell.open && cell.adjacent === 0) return `第 ${index + 1} 格，安全空白`;
  if (cell.open) return `第 ${index + 1} 格，周围有 ${cell.adjacent} 个地雷`;
  return `第 ${index + 1} 格，未翻开`;
}

function statusText(game: GameState, elapsed: number) {
  if (game.status === 'won') return `矿区已清理 · ${elapsed} 秒`;
  if (game.status === 'lost') return '探测中断 · 点击重置再试';
  if (game.status === 'playing') {
    return `${game.openedCount} / ${game.cells.length - game.mineCount} 安全区已清理`;
  }
  return '点击任意方格开始计时';
}

export default function Home() {
  const [game, setGame] = useState(freshGame);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const longPress = useRef<{
    timer: number | null;
    suppressedIndex: number | null;
  }>({
    timer: null,
    suppressedIndex: null,
  });

  const stopLongPressTimer = useCallback(() => {
    if (longPress.current.timer !== null) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  }, []);

  useEffect(() => stopLongPressTimer, [stopLongPressTimer]);

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

  useEffect(() => {
    const updateReadyBoardOrientation = () => {
      if (game.status !== 'ready' || game.flaggedCount > 0) return;
      const dimensions = preferredDimensions();
      if (
        dimensions.rows !== game.rows ||
        dimensions.columns !== game.columns
      ) {
        setGame(createGame(dimensions.rows, dimensions.columns));
      }
    };
    window.addEventListener('resize', updateReadyBoardOrientation);
    return () =>
      window.removeEventListener('resize', updateReadyBoardOrientation);
  }, [game.columns, game.flaggedCount, game.rows, game.status]);

  const finalizeTime = useCallback(() => {
    if (startedAt.current !== null) {
      setElapsed(
        Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000)),
      );
    }
  }, []);

  const openCell = useCallback(
    (index: number) => {
      if (longPress.current.suppressedIndex === index) {
        longPress.current.suppressedIndex = null;
        return;
      }

      const wasReady = game.status === 'ready';
      const nextGame = revealCell(game, index);
      if (nextGame === game) return;

      if (wasReady && nextGame.status !== 'ready') {
        startedAt.current = Date.now();
        setElapsed(0);
      }
      if (nextGame.status === 'won' || nextGame.status === 'lost')
        finalizeTime();
      if (nextGame.status === 'lost') navigator.vibrate?.(35);
      if (nextGame.status === 'won') navigator.vibrate?.([20, 40, 20]);
      setGame(nextGame);
    },
    [finalizeTime, game],
  );

  const markCell = useCallback((index: number) => {
    setGame((current) => toggleFlag(current, index));
  }, []);

  const reset = useCallback(() => {
    stopLongPressTimer();
    startedAt.current = null;
    longPress.current.suppressedIndex = null;
    setElapsed(0);
    setGame(freshGame());
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
    '--board-ratio': `${game.columns} / ${game.rows}`,
  } as CSSProperties;
  const remaining = minesRemaining(game);
  const isComplete = game.status === 'won' || game.status === 'lost';

  return (
    <main className={`game-shell status-${game.status}`}>
      <div className="ambient-glow" aria-hidden="true" />
      <header className="game-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <p className="eyebrow">
              EXPERT FIELD · {game.columns} × {game.rows}
            </p>
            <h1>AyayaMiner</h1>
          </div>
        </div>

        <p className="mission-copy" aria-live="polite">
          {game.status === 'ready'
            ? '清理矿区，不留猜测。'
            : statusText(game, elapsed)}
        </p>

        <div className="status-cluster" aria-label="游戏状态">
          <div className="status-item" title="剩余标记数">
            <Flag aria-hidden="true" />
            <span>{formatCounter(remaining)}</span>
            <small>标记</small>
          </div>
          <div className="status-item" title="用时">
            <Timer aria-hidden="true" />
            <span>{formatCounter(elapsed)}</span>
            <small>秒</small>
          </div>
          <Button
            className="reset-button"
            variant="outline"
            size="icon-lg"
            onClick={reset}
            aria-label="重新开始"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="minefield-wrap" aria-label="专家扫雷棋盘">
        <div className="corner-label top-left">A-01</div>
        <div className="corner-label top-right">99 MINES</div>
        <div className="corner-label bottom-left">FIRST MOVE SAFE</div>
        <div
          className={`corner-label bottom-right field-status field-status-${game.status}`}
        >
          {game.status === 'ready'
            ? 'READY'
            : game.status === 'playing'
              ? 'MINING'
              : game.status === 'won'
                ? 'CLEAR'
                : 'BREACH'}
        </div>

        <div
          className="minefield"
          aria-label={`${game.columns} 列 ${game.rows} 行，99 个地雷`}
          style={boardStyle}
        >
          {game.cells.map((cell, index) => {
            const wrongFlag =
              game.status === 'lost' && cell.flagged && !cell.mine;
            const className = [
              'cell',
              cell.open ? 'cell-open' : '',
              cell.flagged ? 'cell-flagged' : '',
              cell.open && cell.mine ? 'cell-mine' : '',
              cell.exploded ? 'cell-exploded' : '',
              wrongFlag ? 'cell-wrong' : '',
              cell.open && !cell.mine && cell.adjacent > 0
                ? `cell-number cell-${cell.adjacent}`
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
                onClick={() => openCell(index)}
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
          <div
            className={`result-panel result-${game.status}`}
            role="alert"
            aria-live="assertive"
          >
            <p className="result-kicker">
              {game.status === 'won' ? 'FIELD CLEAR' : 'SIGNAL LOST'}
            </p>
            <h2>{game.status === 'won' ? '矿区已清理' : '你触发了地雷'}</h2>
            <p>
              {game.status === 'won'
                ? `${elapsed} 秒完成专家级勘探。`
                : `已清理 ${game.openedCount} 个安全区，重新校准后再试。`}
            </p>
            <Button className="result-button" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              再来一局
            </Button>
          </div>
        )}
      </section>

      <footer className="game-footer">
        <p>
          <span className="pulse-dot" />
          {statusText(game, elapsed)}
        </p>
        <p className="desktop-hint">左键排雷 · 右键标记 · 点击数字快速展开</p>
        <p className="mobile-hint">轻触排雷 · 长按标记</p>
      </footer>
    </main>
  );
}
