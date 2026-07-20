import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const COLORS = ['#2f7fe6', '#e05252', '#35a56a', '#9b59b6', '#f39c12', '#111827'];

function createRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

function getSocketUrl(roomId) {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/draw-ws?room=${encodeURIComponent(roomId)}`;
}

function getStoredName() {
  try {
    const existing = window.localStorage.getItem('nutrilink-draw-name');
    if (existing) return existing;
    const generated = `Artist ${Math.floor(Math.random() * 900) + 100}`;
    window.localStorage.setItem('nutrilink-draw-name', generated);
    return generated;
  } catch {
    return 'Anonymous artist';
  }
}

function DrawPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(() => (ROOM_PATTERN.test(routeRoomId || '') ? routeRoomId : ''));
  const [connectionState, setConnectionState] = useState('connecting');
  const [participantCount, setParticipantCount] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const drawingRef = useRef(false);

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
    canvas.getContext('2d')?.scale(ratio, ratio);
    redraw();
  }, [redraw]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const send = (message) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
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
        send({ type: 'join', name: getStoredName() });
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'snapshot') {
            strokesRef.current = Array.isArray(message.strokes) ? message.strokes : [];
            redraw();
          } else if (message.type === 'stroke' && message.stroke) {
            strokesRef.current.push(message.stroke);
            redraw();
          } else if (message.type === 'clear') {
            strokesRef.current = [];
            redraw();
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
  }, [redraw, roomId]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const handlePointerDown = (event) => {
    if (connectionState !== 'connected') return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    drawingRef.current = true;
    activeStrokeRef.current = { points: [point], color, size: Number(size) };
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    const point = getPoint(event);
    if (!point) return;
    activeStrokeRef.current.points.push(point);
    strokesRef.current = [...strokesRef.current.filter((stroke) => stroke !== activeStrokeRef.current), activeStrokeRef.current];
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

  return (
    <div style={{ minHeight: '100vh', background: '#071225', color: '#e9f1ff', fontFamily: 'Arial, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', background: '#0d1d38', borderBottom: '1px solid rgba(127,176,255,0.25)' }}>
        <div>
          <Link to="/" style={{ color: '#9bbcff', textDecoration: 'none', fontSize: '0.85rem' }}>← NutriLink</Link>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.35rem' }}>Draw with friends</h1>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.8rem', color: connectionState === 'connected' ? '#8be0a8' : '#ffc36b' }}>
          <div>{connectionState === 'connected' ? 'Connected' : connectionState === 'offline' ? 'Reconnecting…' : 'Connecting…'}</div>
          <div>{participantCount} {participantCount === 1 ? 'artist' : 'artists'} here</div>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <button type="button" onClick={shareRoom} style={buttonStyle}>{copied ? 'Link copied' : 'Share room'}</button>
          <label style={controlLabel}>Color <input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          <label style={controlLabel}>Size <input type="range" min="1" max="24" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
          <button type="button" onClick={clearCanvas} style={{ ...buttonStyle, background: '#642d45' }}>Clear</button>
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.3)' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={finishStroke}
            style={{ display: 'block', width: '100%', height: 'min(68vh, 680px)', touchAction: 'none', cursor: 'crosshair' }}
          />
        </div>
        <p style={{ color: '#9bbcff', fontSize: '0.85rem', margin: '0.8rem 0 0' }}>
          Share the room link so friends can draw on the same canvas.
        </p>
      </main>
    </div>
  );
}

const buttonStyle = {
  border: '0',
  borderRadius: '8px',
  padding: '0.55rem 0.85rem',
  background: '#2f62cc',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
};

const controlLabel = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  color: '#cfe2ff',
  fontSize: '0.9rem',
};

export default DrawPage;
