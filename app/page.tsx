import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { Bomb, Flag, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createGame,
  cycleCellMark,
  minesRemaining,
  revealCell,
  type Cell,
} from '@/src/engine';

const LONG_PRESS_MS = 430;

function formatCounter(value: number) {
  return Math.min(999, Math.max(0, value)).toString().padStart(3, '0');
}

function cellLabel(cell: Cell, index: number) {
  if (cell.exploded) return `第 ${index + 1} 格，触发的地雷`;
  if (cell.open && cell.mine) return `第 ${index + 1} 格，地雷`;
  if (cell.flagged) return `第 ${index + 1} 格，已标记`;
  if (cell.questioned) return `第 ${index + 1} 格，问号标记`;
  if (cell.open && cell.adjacent === 0) return `第 ${index + 1} 格，安全空白`;
  if (cell.open) return `第 ${index + 1} 格，周围有 ${cell.adjacent} 个地雷`;
  return `第 ${index + 1} 格，未翻开`;
}

export default function Home() {
  const [game, setGame] = useState(createGame);
  const [elapsed, setElapsed] = useState(0);
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
    setGame((current) => cycleCellMark(current, index));
  }, []);

  const reset = useCallback(() => {
    stopLongPressTimer();
    startedAt.current = null;
    longPress.current.suppressedIndex = null;
    setElapsed(0);
    setGame(createGame());
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
  const isComplete = game.status === 'won' || game.status === 'lost';

  return (
    <main className="game">
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

      <section className="board-area" aria-label="专家扫雷棋盘">
        <div
          className="board"
          aria-label="30 列 16 行，99 个地雷"
          style={boardStyle}
        >
          {game.cells.map((cell, index) => {
            const wrongFlag =
              game.status === 'lost' && cell.flagged && !cell.mine;
            const portraitOrder =
              (index % game.columns) * game.rows +
              Math.floor(index / game.columns);
            const className = [
              'cell',
              cell.open ? 'open' : '',
              cell.flagged ? 'flagged' : '',
              cell.questioned ? 'questioned' : '',
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
                aria-pressed={
                  cell.flagged ? true : cell.questioned ? 'mixed' : false
                }
                disabled={isComplete}
                style={{ '--portrait-order': portraitOrder } as CSSProperties}
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
                {cell.questioned && !cell.open && (
                  <span aria-hidden="true">?</span>
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
