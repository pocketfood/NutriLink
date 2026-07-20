import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const COLORS = ['#111827', '#e05252', '#2f7fe6', '#35a56a', '#9b59b6', '#f39c12'];

function createRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

function createClientId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function getStoredName() {
  if (typeof window === 'undefined') return 'Guest';
  try {
    const existing = window.localStorage.getItem('nutrilink-draw-name');
    if (existing) return existing;
    const generated = `Guest ${Math.floor(Math.random() * 900) + 100}`;
    window.localStorage.setItem('nutrilink-draw-name', generated);
    return generated;
  } catch {
    return 'Guest';
  }
}

function getSocketUrl(roomId) {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/draw-ws?room=${encodeURIComponent(roomId)}`;
}

function getCursorColor(id) {
  const index = Array.from(id || '').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return COLORS[index % COLORS.length];
}

function toCursorMap(cursors) {
  return (Array.isArray(cursors) ? cursors : []).reduce((map, cursor) => {
    if (cursor?.id && cursor.active !== false) map[cursor.id] = cursor;
    return map;
  }, {});
}

function DrawPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(() => (ROOM_PATTERN.test(routeRoomId || '') ? routeRoomId : ''));
  const [connectionState, setConnectionState] = useState('connecting');
  const [participantCount, setParticipantCount] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursors, setCursors] = useState({});
  const [clientId] = useState(createClientId);
  const [clientName] = useState(getStoredName);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const drawingRef = useRef(false);
  const cursorFrameRef = useRef(null);
  const pendingCursorRef = useRef(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    strokesRef.current.forEach((stroke) => {
      if (!stroke.points?.length) return;
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.size;
      context.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * rect.width;
        const y = point.y * rect.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }, [redraw]);

  const send = useCallback((message) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendCursor = (point, active = true) => {
    pendingCursorRef.current = { type: 'cursor', point, active };
    if (cursorFrameRef.current !== null) return;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = null;
      const message = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (message) send(message);
    });
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    if (roomId) return;
    const nextRoomId = createRoomId();
    setRoomId(nextRoomId);
    navigate(`/draw/${nextRoomId}`, { replace: true });
  }, [navigate, roomId]);

  useEffect(() => {
    if (!roomId) return undefined;

    let cancelled = false;
    let retryTimer;
    const connect = () => {
      if (cancelled) return;
      setConnectionState('connecting');
      const socket = new WebSocket(getSocketUrl(roomId));
      socketRef.current = socket;
      socket.onopen = () => {
        setConnectionState('connected');
        send({ type: 'join', id: clientId, name: clientName });
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'snapshot') {
            strokesRef.current = Array.isArray(message.strokes) ? message.strokes : [];
            setCursors(toCursorMap(message.cursors));
            redraw();
          } else if (message.type === 'stroke' && message.stroke) {
            strokesRef.current.push(message.stroke);
            redraw();
          } else if (message.type === 'clear') {
            strokesRef.current = [];
            redraw();
          } else if (message.type === 'cursor' && message.cursor?.id) {
            setCursors((current) => {
              const next = { ...current };
              if (message.cursor.active === false) delete next[message.cursor.id];
              else next[message.cursor.id] = message.cursor;
              return next;
            });
          } else if (message.type === 'presence') {
            setParticipantCount(Number(message.count) || 0);
          }
        } catch {
          // Ignore malformed room messages.
        }
      };
      socket.onerror = () => setConnectionState('offline');
      socket.onclose = () => {
        if (cancelled) return;
        setCursors({});
        setConnectionState('offline');
        retryTimer = window.setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clientId, clientName, redraw, roomId, send]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
    };
  }, []);

  const handlePointerDown = (event) => {
    if (connectionState !== 'connected') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point);
    drawingRef.current = true;
    activeStrokeRef.current = { points: [point], color, size: 4 };
  };

  const handlePointerMove = (event) => {
    if (connectionState !== 'connected') return;
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point);
    if (!drawingRef.current || !activeStrokeRef.current) return;
    activeStrokeRef.current.points.push(point);
    strokesRef.current = [
      ...strokesRef.current.filter((stroke) => stroke !== activeStrokeRef.current),
      activeStrokeRef.current,
    ];
    redraw();
  };

  const finishStroke = () => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    drawingRef.current = false;
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    strokesRef.current = strokesRef.current.filter((item) => item !== stroke);
    if (stroke.points.length > 1) {
      strokesRef.current.push(stroke);
      send({ type: 'stroke', ...stroke });
    }
    redraw();
  };

  const handlePointerLeave = () => {
    finishStroke();
    sendCursor({ x: 0, y: 0 }, false);
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    redraw();
    send({ type: 'clear' });
  };

  const shareRoom = async () => {
    const shareUrl = `${window.location.origin}/draw/${roomId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this drawing room link:', shareUrl);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen can be blocked by the browser; the canvas still fills the page.
    }
  };

  return (
    <div style={pageStyle}>
      <Link to="/" style={homeLinkStyle}>NutriLink</Link>

      <div style={toolbarStyle}>
        {COLORS.map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`Choose ${option}`}
            aria-pressed={color === option}
            onClick={() => setColor(option)}
            style={{
              ...colorButtonStyle,
              background: option,
              boxShadow: color === option ? '0 0 0 3px #fff, 0 0 0 5px #2f62cc' : 'none',
            }}
          />
        ))}
        <button type="button" onClick={clearCanvas} style={toolButtonStyle}>Clear</button>
        <button type="button" onClick={shareRoom} style={toolButtonStyle}>{copied ? 'Copied' : 'Share'}</button>
        <button type="button" onClick={toggleFullscreen} style={toolButtonStyle}>
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      <div style={canvasStageStyle}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerEnter={(event) => {
            if (connectionState === 'connected') {
              const point = getPoint(event);
              if (point) sendCursor(point);
            }
          }}
          onPointerLeave={handlePointerLeave}
          style={canvasStyle}
        />

        {Object.values(cursors).map((cursor) => (
          <div
            key={cursor.id}
            style={{
              ...cursorStyle,
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            }}
          >
            <span style={{ ...cursorDotStyle, background: getCursorColor(cursor.id) }} />
            <span style={cursorLabelStyle}>{cursor.name || 'Guest'}</span>
          </div>
        ))}
      </div>

      <div style={footerStyle}>
        {participantCount} {participantCount === 1 ? 'user' : 'users'}
        {connectionState !== 'connected' && ' - reconnecting...'}
      </div>
    </div>
  );
}

const pageStyle = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  background: '#fff',
  fontFamily: 'Arial, sans-serif',
};

const homeLinkStyle = {
  position: 'fixed',
  top: '12px',
  left: '14px',
  zIndex: 5,
  color: '#2f62cc',
  background: 'rgba(255,255,255,0.9)',
  borderRadius: '6px',
  padding: '0.3rem 0.45rem',
  fontSize: '0.75rem',
  textDecoration: 'none',
};

const toolbarStyle = {
  position: 'fixed',
  top: '12px',
  left: '50%',
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
  padding: '0.55rem 0.7rem',
  transform: 'translateX(-50%)',
  background: 'rgba(255,255,255,0.92)',
  borderRadius: '10px',
  boxShadow: '0 3px 16px rgba(0,0,0,0.16)',
};

const colorButtonStyle = {
  width: '18px',
  height: '18px',
  padding: 0,
  border: '0',
  borderRadius: '50%',
  cursor: 'pointer',
};

const toolButtonStyle = {
  border: '0',
  borderRadius: '6px',
  padding: '0.4rem 0.55rem',
  background: '#edf2fa',
  color: '#17233a',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const canvasStageStyle = {
  position: 'absolute',
  inset: 0,
  background: '#fff',
};

const canvasStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  touchAction: 'none',
  cursor: 'crosshair',
};

const cursorStyle = {
  position: 'absolute',
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
};

const cursorDotStyle = {
  width: '12px',
  height: '12px',
  border: '2px solid #fff',
  borderRadius: '50%',
  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
};

const cursorLabelStyle = {
  padding: '0.15rem 0.3rem',
  borderRadius: '4px',
  background: 'rgba(17,24,39,0.8)',
  color: '#fff',
  fontSize: '0.65rem',
  whiteSpace: 'nowrap',
};

const footerStyle = {
  position: 'fixed',
  right: 0,
  bottom: '7px',
  left: 0,
  zIndex: 5,
  color: '#5c6472',
  fontSize: '0.68rem',
  textAlign: 'center',
  pointerEvents: 'none',
};

export default DrawPage;
