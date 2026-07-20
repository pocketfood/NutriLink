import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const COLORS = ['#111827', '#e05252', '#2f7fe6', '#35a56a', '#9b59b6', '#f39c12'];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const RESIZE_CORNERS = ['nw', 'ne', 'sw', 'se'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createClientId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function createImageId() {
  return `image-${Math.random().toString(36).slice(2, 12)}`;
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

function normalizeLocalName(name) {
  const printable = Array.from(name || '')
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Guest';
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

function toImageMap(images) {
  return (Array.isArray(images) ? images : []).reduce((map, image) => {
    if (image?.id && image.url) map[image.id] = image;
    return map;
  }, {});
}

function safeFileName(name) {
  return (name || 'image').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80) || 'image';
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error('Unable to read image dimensions'));
    image.src = url;
  });
}

function getInitialImageSize(dimensions) {
  const aspect = dimensions.width / Math.max(1, dimensions.height);
  let width = 0.24;
  let height = width / aspect;
  if (height > 0.3) {
    height = 0.3;
    width = height * aspect;
  }
  return {
    width: clamp(width, 0.08, 0.5),
    height: clamp(height, 0.08, 0.5),
  };
}

function DrawPage() {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(() => (ROOM_PATTERN.test(routeRoomId || '') ? routeRoomId : ''));
  const [roomState, setRoomState] = useState(() => (
    routeRoomId ? (ROOM_PATTERN.test(routeRoomId) ? 'checking' : 'missing') : 'creating'
  ));
  const [connectionState, setConnectionState] = useState('connecting');
  const [participantCount, setParticipantCount] = useState(0);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(3);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState('idle');
  const [toolMode, setToolMode] = useState('draw');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientName, setClientName] = useState(getStoredName);
  const [nameDraft, setNameDraft] = useState(clientName);
  const [nameMessage, setNameMessage] = useState('');
  const [cursors, setCursors] = useState({});
  const [images, setImages] = useState({});
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [clientId] = useState(createClientId);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const clientNameRef = useRef(clientName);
  const strokesRef = useRef([]);
  const imagesRef = useRef({});
  const activeStrokeRef = useRef(null);
  const drawingRef = useRef(false);
  const imageInteractionRef = useRef(null);
  const cursorFrameRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const imageFrameRef = useRef(null);
  const pendingImageUpdateRef = useRef(null);

  const replaceImages = useCallback((nextImages) => {
    imagesRef.current = nextImages;
    setImages(nextImages);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = (stageRef.current || canvas).getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const brushScale = clamp(Math.min(rect.width, rect.height) / 720, 0.5, 1);

    strokesRef.current.forEach((stroke) => {
      if (!stroke.points?.length) return;
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.size * brushScale;
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
    const ratio = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = (stageRef.current || canvas).getBoundingClientRect();
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

  useEffect(() => {
    clientNameRef.current = clientName;
  }, [clientName]);

  const sendCursor = (point, active = true, mode = 'draw') => {
    pendingCursorRef.current = { type: 'cursor', point, active, mode };
    if (cursorFrameRef.current !== null) return;
    cursorFrameRef.current = window.requestAnimationFrame(() => {
      cursorFrameRef.current = null;
      const message = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (message) send(message);
    });
  };

  const sendImageUpdate = (image) => {
    pendingImageUpdateRef.current = {
      type: 'image:update',
      id: image.id,
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
    };
    if (imageFrameRef.current !== null) return;
    imageFrameRef.current = window.requestAnimationFrame(() => {
      imageFrameRef.current = null;
      const message = pendingImageUpdateRef.current;
      pendingImageUpdateRef.current = null;
      if (message) send(message);
    });
  };

  const sendImageUpdateNow = (image) => {
    if (!image) return;
    if (imageFrameRef.current !== null) {
      window.cancelAnimationFrame(imageFrameRef.current);
      imageFrameRef.current = null;
    }
    pendingImageUpdateRef.current = null;
    send({
      type: 'image:update',
      id: image.id,
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
    });
  };

  const getPoint = (event) => {
    const board = stageRef.current || canvasRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    let cancelled = false;

    if (routeRoomId) {
      setRoomId(routeRoomId);
      if (!ROOM_PATTERN.test(routeRoomId)) {
        setRoomState('missing');
        return () => { cancelled = true; };
      }

      setRoomState('checking');
      fetch(`/api/draw-room?id=${encodeURIComponent(routeRoomId)}`)
        .then((response) => {
          if (!response.ok) throw new Error('Room not found');
          return response.json();
        })
        .then(() => {
          if (!cancelled) setRoomState('ready');
        })
        .catch(() => {
          if (!cancelled) setRoomState('missing');
        });

      return () => { cancelled = true; };
    }

    setRoomId('');
    setRoomState('creating');
    fetch('/api/draw-room', { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to create room');
        return response.json();
      })
      .then(({ roomId: nextRoomId }) => {
        if (cancelled || !ROOM_PATTERN.test(nextRoomId || '')) return;
        navigate(`/draw/${nextRoomId}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setRoomState('missing');
      });

    return () => { cancelled = true; };
  }, [navigate, routeRoomId]);

  useEffect(() => {
    if (!roomId || roomState !== 'ready') return undefined;

    let cancelled = false;
    let retryTimer;
    const connect = () => {
      if (cancelled) return;
      setConnectionState('connecting');
      const socket = new WebSocket(getSocketUrl(roomId));
      socketRef.current = socket;
      socket.onopen = () => {
        setConnectionState('connected');
        send({ type: 'join', id: clientId, name: clientNameRef.current });
        send({ type: 'sync' });
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'snapshot') {
            strokesRef.current = Array.isArray(message.strokes) ? message.strokes : [];
            replaceImages(toImageMap(message.images));
            setCursors(toCursorMap(message.cursors));
            setParticipantCount(Number(message.participants) || 0);
            redraw();
          } else if (message.type === 'stroke' && message.stroke) {
            strokesRef.current.push(message.stroke);
            redraw();
          } else if (message.type === 'clear') {
            strokesRef.current = [];
            replaceImages({});
            setSelectedImageId(null);
            redraw();
          } else if (message.type === 'image:add' && message.image?.id) {
            replaceImages({ ...imagesRef.current, [message.image.id]: message.image });
          } else if (message.type === 'image:update' && message.image?.id) {
            replaceImages({ ...imagesRef.current, [message.image.id]: message.image });
          } else if (message.type === 'image:snapshot') {
            replaceImages(toImageMap(message.images));
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
        setParticipantCount(0);
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
  }, [clientId, redraw, replaceImages, roomId, roomState, send]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeCanvas);
    if (observer && stageRef.current) observer.observe(stageRef.current);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      observer?.disconnect();
    };
  }, [resizeCanvas]);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
      if (imageFrameRef.current !== null) window.cancelAnimationFrame(imageFrameRef.current);
    };
  }, []);

  const updateLocalImage = (id, changes) => {
    const current = imagesRef.current[id];
    if (!current) return;
    const nextImage = { ...current, ...changes };
    replaceImages({ ...imagesRef.current, [id]: nextImage });
    sendImageUpdate(nextImage);
  };

  const handlePointerDown = (event) => {
    if (toolMode !== 'draw') {
      setToolMode('draw');
      setSelectedImageId(null);
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'draw');
    drawingRef.current = true;
    activeStrokeRef.current = { points: [point], color, size: brushSize };
  };

  const handlePointerMove = (event) => {
    if (toolMode !== 'draw') return;
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'draw');
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
    const completedStroke = stroke.points.length === 1
      ? { ...stroke, points: [stroke.points[0], { ...stroke.points[0] }] }
      : stroke;
    strokesRef.current.push(completedStroke);
    send({ type: 'stroke', ...completedStroke });
    redraw();
  };

  const handlePointerLeave = () => {
    if (toolMode !== 'draw') return;
    finishStroke();
    sendCursor({ x: 0, y: 0 }, false, 'draw');
  };

  const handleCursorMove = (event, mode = 'move') => {
    if (connectionState !== 'connected') return;
    const point = getPoint(event);
    if (point) sendCursor(point, true, mode);
  };

  const handleCursorLeave = (mode = 'move') => {
    if (connectionState === 'connected') sendCursor({ x: 0, y: 0 }, false, mode);
  };

  const handleImagePointerDown = (event, image, mode = 'move') => {
    if (connectionState !== 'connected') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'move');
    setToolMode('select');
    setSelectedImageId(image.id);
    imageInteractionRef.current = {
      id: image.id,
      mode,
      startPoint: point,
      initial: { ...image },
      captureTarget: event.currentTarget,
    };
  };

  const handleImagePointerMove = (event) => {
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'move');
    const interaction = imageInteractionRef.current;
    if (!interaction) return;
    event.preventDefault();
    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    const initial = interaction.initial;

    if (interaction.mode === 'move') {
      updateLocalImage(interaction.id, {
        x: clamp(initial.x + deltaX, 0, 1 - initial.width),
        y: clamp(initial.y + deltaY, 0, 1 - initial.height),
      });
      return;
    }

    const minimumSize = 0.04;
    const corner = interaction.mode.replace('resize-', '');
    let left = initial.x;
    let top = initial.y;
    let right = initial.x + initial.width;
    let bottom = initial.y + initial.height;

    if (corner.includes('w')) left = clamp(point.x, 0, right - minimumSize);
    if (corner.includes('e')) right = clamp(point.x, left + minimumSize, 1);
    if (corner.includes('n')) top = clamp(point.y, 0, bottom - minimumSize);
    if (corner.includes('s')) bottom = clamp(point.y, top + minimumSize, 1);

    updateLocalImage(interaction.id, {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  };

  const saveName = () => {
    const nextName = normalizeLocalName(nameDraft);
    try {
      window.localStorage.setItem('nutrilink-draw-name', nextName);
    } catch {
      // The name still applies for the current room if storage is unavailable.
    }
    setNameDraft(nextName);
    setClientName(nextName);
    clientNameRef.current = nextName;
    send({ type: 'join', id: clientId, name: nextName });
    setNameMessage('Saved');
    window.setTimeout(() => setNameMessage(''), 1600);
  };

  const finishImageInteraction = (event) => {
    const interaction = imageInteractionRef.current;
    if (!interaction) return;
    sendImageUpdateNow(imagesRef.current[interaction.id]);
    interaction.captureTarget?.releasePointerCapture?.(event.pointerId);
    imageInteractionRef.current = null;
  };

  const uploadImageFiles = async (fileList, dropPoint = null) => {
    if (connectionState !== 'connected') {
      setUploadState('Connect first');
      window.setTimeout(() => setUploadState('idle'), 1800);
      return;
    }

    const files = Array.from(fileList || [])
      .filter((file) => IMAGE_TYPES.has(file.type) && file.size <= 5 * 1024 * 1024)
      .slice(0, 5);
    if (!files.length) {
      setUploadState('Images only, max 5 MB');
      window.setTimeout(() => setUploadState('idle'), 2200);
      return;
    }

    setUploadState('Uploading...');
    try {
      for (const [index, file] of files.entries()) {
        const blob = await upload(`draw/${roomId}/${safeFileName(file.name)}`, file, {
          access: 'public',
          contentType: file.type,
          handleUploadUrl: '/api/draw-image-upload',
          clientPayload: JSON.stringify({ roomId }),
        });
        const dimensions = await readImageDimensions(blob.url);
        const size = getInitialImageSize(dimensions);
        const x = clamp((dropPoint?.x ?? 0.5) - size.width / 2 + index * 0.03, 0, 1 - size.width);
        const y = clamp((dropPoint?.y ?? 0.5) - size.height / 2 + index * 0.03, 0, 1 - size.height);
        send({
          type: 'image:add',
          image: {
            id: createImageId(),
            url: blob.url,
            name: file.name,
            x,
            y,
            width: size.width,
            height: size.height,
          },
        });
      }
      setUploadState('Image added');
    } catch (error) {
      console.error('Draw image upload failed:', error);
      setUploadState('Upload failed');
    } finally {
      window.setTimeout(() => setUploadState('idle'), 2200);
    }
  };

  const handleFileInputChange = (event) => {
    uploadImageFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    uploadImageFiles(event.dataTransfer.files, getPoint(event));
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    replaceImages({});
    setSelectedImageId(null);
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

  if (roomState !== 'ready') {
    const roomMissing = roomState === 'missing';
    return (
      <div style={roomStatusPageStyle}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
          {roomMissing ? 'Drawing room not found' : roomState === 'creating' ? 'Creating drawing room...' : 'Checking drawing room...'}
        </h1>
        <p style={{ maxWidth: '30rem', color: '#60708a', textAlign: 'center' }}>
          {roomMissing
            ? 'This link was not created by NutriLink or the room has been removed.'
            : 'Please wait a moment.'}
        </p>
        {roomMissing && <Link to="/" style={roomStatusLinkStyle}>Return to NutriLink</Link>}
      </div>
    );
  }

  return (
    <div
      style={pageStyle}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <Link to="/" style={homeLinkStyle} aria-label="Return to NutriLink home">
        <img src="/nutrilink-logo.png" alt="NutriLink" style={homeLogoStyle} />
      </Link>

      <button
        type="button"
        aria-expanded={isSettingsOpen}
        aria-controls="draw-settings"
        onClick={() => setIsSettingsOpen((open) => !open)}
        style={settingsToggleStyle}
      >
        {isSettingsOpen ? 'Close' : 'Settings'}
      </button>

      <aside
        id="draw-settings"
        aria-hidden={!isSettingsOpen}
        style={{
          ...settingsDrawerStyle,
          transform: isSettingsOpen ? 'translateX(0)' : 'translateX(100%)',
          visibility: isSettingsOpen ? 'visible' : 'hidden',
          pointerEvents: isSettingsOpen ? 'auto' : 'none',
        }}
      >
        <div style={settingsHeaderStyle}>
          <div>
            <strong>Drawing settings</strong>
            <div style={settingsHintStyle}>{participantCount} {participantCount === 1 ? 'user' : 'users'} in room</div>
          </div>
          <button type="button" onClick={() => setIsSettingsOpen(false)} style={closeButtonStyle} aria-label="Close settings">×</button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
          style={settingsSectionStyle}
        >
          <label htmlFor="draw-name" style={settingsLabelStyle}>Your name</label>
          <div style={nameRowStyle}>
            <input
              id="draw-name"
              value={nameDraft}
              maxLength={24}
              onChange={(event) => setNameDraft(event.target.value)}
              style={nameInputStyle}
            />
            <button type="submit" style={toolButtonStyle}>{nameMessage || 'Save'}</button>
          </div>
        </form>

        <div style={settingsSectionStyle}>
          <div style={settingsLabelStyle}>Brush color</div>
          <div style={colorOptionsStyle}>
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
          </div>
        </div>

        <div style={settingsSectionStyle}>
          <label htmlFor="draw-brush-size" style={settingsLabelStyle}>
            Brush size <output style={brushSizeOutputStyle}>{brushSize}px</output>
          </label>
          <input
            id="draw-brush-size"
            type="range"
            min="1"
            max="12"
            step="1"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            style={brushSizeSliderStyle}
          />
        </div>

        <div style={settingsActionsStyle}>
          <button
            type="button"
            onClick={() => {
              const nextMode = toolMode === 'draw' ? 'select' : 'draw';
              setToolMode(nextMode);
              if (nextMode === 'draw') setSelectedImageId(null);
            }}
            style={toolButtonStyle}
          >
            {toolMode === 'draw' ? 'Move images' : 'Draw'}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={toolButtonStyle}>
            {uploadState === 'uploading' ? 'Uploading...' : 'Add image'}
          </button>
          <button type="button" onClick={clearCanvas} style={toolButtonStyle}>Clear</button>
          <button type="button" onClick={shareRoom} style={toolButtonStyle}>{copied ? 'Copied' : 'Share'}</button>
          <button type="button" onClick={toggleFullscreen} style={toolButtonStyle}>
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      </aside>

      <div
        ref={stageRef}
        style={canvasStageStyle}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            ...canvasStyle,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        <div
          aria-hidden="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerEnter={(event) => {
            if (toolMode === 'draw' && connectionState === 'connected') {
              const point = getPoint(event);
              if (point) sendCursor(point, true, 'draw');
            }
          }}
          onPointerLeave={handlePointerLeave}
          style={{
            ...drawSurfaceStyle,
            zIndex: toolMode === 'draw' ? 4 : 0,
            pointerEvents: toolMode === 'draw' ? 'auto' : 'none',
          }}
        />

        <div
          aria-hidden="true"
          onPointerMove={(event) => handleCursorMove(event, 'move')}
          onPointerEnter={(event) => handleCursorMove(event, 'move')}
          onPointerLeave={() => handleCursorLeave('move')}
          style={{
            ...cursorSurfaceStyle,
            zIndex: toolMode === 'draw' ? 0 : 1.5,
            pointerEvents: toolMode === 'draw' ? 'none' : 'auto',
          }}
        />

        {Object.values(images).map((image) => {
          const selected = image.id === selectedImageId;
          return (
            <div
              key={image.id}
              role="button"
              tabIndex={0}
              aria-label={`Move ${image.name || 'image'}`}
              onPointerDown={(event) => handleImagePointerDown(event, image)}
              onPointerEnter={handleImagePointerMove}
              onPointerMove={handleImagePointerMove}
              onPointerLeave={() => handleCursorLeave('move')}
              onPointerUp={finishImageInteraction}
              onPointerCancel={finishImageInteraction}
              style={{
                ...imageFrameStyle,
                zIndex: 2,
                pointerEvents: toolMode === 'select' ? 'auto' : 'none',
                left: `${image.x * 100}%`,
                top: `${image.y * 100}%`,
                width: `${image.width * 100}%`,
                height: `${image.height * 100}%`,
                cursor: selected ? 'move' : 'grab',
              }}
            >
              <img src={image.url} alt={image.name || 'Shared image'} draggable="false" style={imageStyle} />
              {selected && RESIZE_CORNERS.map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Resize image ${corner}`}
                  onPointerDown={(event) => handleImagePointerDown(event, image, `resize-${corner}`)}
                  style={{ ...resizeHandleStyle, ...resizeHandlePositions[corner] }}
                />
              ))}
            </div>
          );
        })}

        {Object.values(cursors).map((cursor) => (
          <div
            key={cursor.id}
            style={{
              ...cursorStyle,
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            }}
          >
            <span
              style={{
                ...cursorDotStyle,
                background: getCursorColor(cursor.id),
                borderRadius: cursor.mode === 'move' ? '3px' : '50%',
                transform: cursor.mode === 'move' ? 'rotate(45deg)' : 'none',
              }}
            />
            <span style={cursorLabelStyle}>
              {cursor.name || 'Guest'} · {cursor.mode === 'move' ? 'move' : 'brush'}
            </span>
          </div>
        ))}

        {isDragOver && <div style={dropOverlayStyle}>Drop image here</div>}
      </div>

      <div style={footerStyle}>
        {participantCount} {participantCount === 1 ? 'user' : 'users'}
        {` - ${toolMode === 'draw' ? 'draw mode' : 'move mode'}`}
        {connectionState !== 'connected' && ' - reconnecting...'}
        {uploadState !== 'idle' && ` - ${uploadState}`}
      </div>
    </div>
  );
}

const pageStyle = {
  position: 'fixed',
  inset: 0,
  width: '100vw',
  height: '100dvh',
  overflow: 'hidden',
  background: '#fff',
  fontFamily: 'Arial, sans-serif',
};

const homeLinkStyle = {
  position: 'fixed',
  top: '8px',
  left: '10px',
  zIndex: 5,
  display: 'block',
  width: '64px',
  height: '64px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.88)',
  textDecoration: 'none',
};

const homeLogoStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const settingsToggleStyle = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  zIndex: 31,
  border: 0,
  borderRadius: '7px',
  padding: '0.45rem 0.65rem',
  background: '#edf2fa',
  color: '#17233a',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 700,
  boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
};

const settingsDrawerStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: '290px',
  maxWidth: 'calc(100vw - 16px)',
  boxSizing: 'border-box',
  overflowY: 'auto',
  padding: '4.5rem 1rem 1.25rem',
  background: 'rgba(255,255,255,0.98)',
  borderLeft: '1px solid #dbe3ef',
  boxShadow: '-5px 0 22px rgba(0,0,0,0.14)',
  transition: 'transform 180ms ease, visibility 180ms ease',
};

const settingsHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '0.75rem',
  color: '#17233a',
};

const closeButtonStyle = {
  width: '26px',
  height: '26px',
  padding: 0,
  border: 0,
  borderRadius: '50%',
  background: '#edf2fa',
  color: '#17233a',
  cursor: 'pointer',
  fontSize: '1.1rem',
  lineHeight: 1,
};

const settingsHintStyle = {
  marginTop: '0.25rem',
  color: '#60708a',
  fontSize: '0.7rem',
};

const settingsSectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  paddingBottom: '0.9rem',
  borderBottom: '1px solid #e5ebf3',
};

const settingsLabelStyle = {
  color: '#17233a',
  fontSize: '0.75rem',
  fontWeight: 700,
};

const brushSizeOutputStyle = {
  float: 'right',
  color: '#60708a',
  fontWeight: 400,
};

const brushSizeSliderStyle = {
  width: '100%',
  accentColor: '#2f62cc',
  cursor: 'pointer',
};

const nameRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
};

const nameInputStyle = {
  minWidth: 0,
  flex: 1,
  boxSizing: 'border-box',
  border: '1px solid #cbd6e5',
  borderRadius: '6px',
  padding: '0.4rem 0.5rem',
  color: '#17233a',
  fontSize: '0.8rem',
};

const colorOptionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.65rem',
  padding: '0.35rem 0.25rem',
};

const settingsActionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.45rem',
};

const colorButtonStyle = {
  flex: '0 0 auto',
  width: '18px',
  height: '18px',
  padding: 0,
  border: '0',
  borderRadius: '50%',
  cursor: 'pointer',
};

const toolButtonStyle = {
  flex: '0 0 auto',
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
  width: '100%',
  height: '100%',
  background: '#fff',
  touchAction: 'none',
};

const canvasStyle = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  touchAction: 'none',
  cursor: 'crosshair',
};

const drawSurfaceStyle = {
  position: 'absolute',
  inset: 0,
  touchAction: 'none',
  cursor: 'crosshair',
};

const cursorSurfaceStyle = {
  position: 'absolute',
  inset: 0,
  touchAction: 'none',
  cursor: 'default',
};

const imageFrameStyle = {
  position: 'absolute',
  zIndex: 3,
  boxSizing: 'border-box',
  userSelect: 'none',
  touchAction: 'none',
  overflow: 'visible',
};

const imageStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'fill',
  pointerEvents: 'none',
  userSelect: 'none',
};

const resizeHandleStyle = {
  position: 'absolute',
  width: '14px',
  height: '14px',
  padding: 0,
  border: '2px solid #fff',
  borderRadius: '50%',
  background: '#2f62cc',
  cursor: 'nwse-resize',
  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
};

const resizeHandlePositions = {
  nw: { left: '-7px', top: '-7px', cursor: 'nwse-resize' },
  ne: { right: '-7px', top: '-7px', cursor: 'nesw-resize' },
  sw: { left: '-7px', bottom: '-7px', cursor: 'nesw-resize' },
  se: { right: '-7px', bottom: '-7px', cursor: 'nwse-resize' },
};

const cursorStyle = {
  position: 'absolute',
  zIndex: 20,
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

const dropOverlayStyle = {
  position: 'absolute',
  inset: 0,
  zIndex: 19,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(47,98,204,0.12)',
  color: '#2f62cc',
  fontSize: '1.1rem',
  fontWeight: 700,
  pointerEvents: 'none',
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

const roomStatusPageStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  padding: '1.5rem',
  background: '#f6f9ff',
  color: '#17233a',
  fontFamily: 'Arial, sans-serif',
};

const roomStatusLinkStyle = {
  color: '#fff',
  background: '#2f62cc',
  borderRadius: '6px',
  padding: '0.55rem 0.8rem',
  textDecoration: 'none',
  fontWeight: 700,
};

export default DrawPage;
