import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const COLORS = ['#111827', '#e05252', '#2f7fe6', '#35a56a', '#9b59b6', '#f39c12'];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const RESIZE_CORNERS = ['nw', 'ne', 'sw', 'se'];
const MOBILE_MEDIA_QUERY = '(max-width: 700px), (pointer: coarse)';
const MOBILE_BOARD_WIDTH = 1920;
const MOBILE_BOARD_HEIGHT = 1080;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createClientId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function createImageId() {
  return `image-${Math.random().toString(36).slice(2, 12)}`;
}

function createTextId() {
  return `text-${Math.random().toString(36).slice(2, 12)}`;
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

function isMobileViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
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

function toTextMap(texts) {
  return (Array.isArray(texts) ? texts : []).reduce((map, textField) => {
    if (textField?.id) map[textField.id] = textField;
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
  const [brushSize, setBrushSize] = useState(4);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadState, setUploadState] = useState('idle');
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [toolMode, setToolMode] = useState(() => (isMobileViewport() ? 'pan' : 'draw'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientName, setClientName] = useState(getStoredName);
  const [nameDraft, setNameDraft] = useState(clientName);
  const [nameMessage, setNameMessage] = useState('');
  const [cursors, setCursors] = useState({});
  const [images, setImages] = useState({});
  const [texts, setTexts] = useState({});
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [imageContextMenu, setImageContextMenu] = useState(null);
  const [clientId] = useState(createClientId);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const clientNameRef = useRef(clientName);
  const strokesRef = useRef([]);
  const imagesRef = useRef({});
  const textsRef = useRef({});
  const activeStrokeRef = useRef(null);
  const drawingRef = useRef(false);
  const imageInteractionRef = useRef(null);
  const textInteractionRef = useRef(null);
  const cursorFrameRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const imageFrameRef = useRef(null);
  const pendingImageUpdateRef = useRef(null);
  const textFrameRef = useRef(null);
  const pendingTextUpdateRef = useRef(null);

  const replaceImages = useCallback((nextImages) => {
    imagesRef.current = nextImages;
    setImages(nextImages);
  }, []);

  const replaceTexts = useCallback((nextTexts) => {
    textsRef.current = nextTexts;
    setTexts(nextTexts);
  }, []);

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
      context.lineWidth = clamp(Number(stroke.size) || 4, 1, 24);
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
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateViewportMode = () => {
      setIsMobile(mediaQuery.matches);
      setToolMode((currentMode) => {
        if (mediaQuery.matches && currentMode === 'select') return 'pan';
        if (!mediaQuery.matches && currentMode === 'pan') return 'draw';
        return currentMode;
      });
    };
    updateViewportMode();
    mediaQuery.addEventListener?.('change', updateViewportMode);
    if (!mediaQuery.addEventListener) mediaQuery.addListener?.(updateViewportMode);
    return () => {
      mediaQuery.removeEventListener?.('change', updateViewportMode);
      if (!mediaQuery.removeEventListener) mediaQuery.removeListener?.(updateViewportMode);
    };
  }, []);

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
      layer: image.layer,
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
      layer: image.layer,
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
    });
  };

  const sendTextUpdate = (textField) => {
    pendingTextUpdateRef.current = {
      type: 'text:update',
      id: textField.id,
      text: textField.text,
      x: textField.x,
      y: textField.y,
      width: textField.width,
      height: textField.height,
      fontSize: textField.fontSize,
      color: textField.color,
    };
    if (textFrameRef.current !== null) return;
    textFrameRef.current = window.requestAnimationFrame(() => {
      textFrameRef.current = null;
      const message = pendingTextUpdateRef.current;
      pendingTextUpdateRef.current = null;
      if (message) send(message);
    });
  };

  const sendTextUpdateNow = (textField) => {
    if (!textField) return;
    if (textFrameRef.current !== null) {
      window.cancelAnimationFrame(textFrameRef.current);
      textFrameRef.current = null;
    }
    pendingTextUpdateRef.current = null;
    send({
      type: 'text:update',
      id: textField.id,
      text: textField.text,
      x: textField.x,
      y: textField.y,
      width: textField.width,
      height: textField.height,
      fontSize: textField.fontSize,
      color: textField.color,
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
      if ([WebSocket.CONNECTING, WebSocket.OPEN].includes(socketRef.current?.readyState)) return;
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
            replaceTexts(toTextMap(message.texts));
            setCursors(toCursorMap(message.cursors));
            setParticipantCount(Number(message.participants) || 0);
            redraw();
          } else if (message.type === 'stroke' && message.stroke) {
            strokesRef.current.push(message.stroke);
            redraw();
          } else if (message.type === 'stroke:snapshot') {
            strokesRef.current = Array.isArray(message.strokes) ? message.strokes : [];
            redraw();
          } else if (message.type === 'clear') {
            strokesRef.current = [];
            replaceImages({});
            replaceTexts({});
            setSelectedImageId(null);
            setSelectedTextId(null);
            setEditingTextId(null);
            setImageContextMenu(null);
            redraw();
          } else if (message.type === 'clear:drawings') {
            strokesRef.current = [];
            redraw();
          } else if (message.type === 'clear:images') {
            replaceImages({});
            setSelectedImageId(null);
            setImageContextMenu(null);
          } else if (message.type === 'clear:texts') {
            replaceTexts({});
            setSelectedTextId(null);
            setEditingTextId(null);
          } else if (message.type === 'image:add' && message.image?.id) {
            replaceImages({ ...imagesRef.current, [message.image.id]: message.image });
          } else if (message.type === 'image:update' && message.image?.id) {
            replaceImages({ ...imagesRef.current, [message.image.id]: message.image });
          } else if (message.type === 'image:snapshot') {
            replaceImages(toImageMap(message.images));
          } else if (message.type === 'text:add' && message.text?.id) {
            replaceTexts({ ...textsRef.current, [message.text.id]: message.text });
          } else if (message.type === 'text:update' && message.text?.id) {
            replaceTexts({ ...textsRef.current, [message.text.id]: message.text });
          } else if (message.type === 'text:delete' && message.id) {
            const nextTexts = { ...textsRef.current };
            delete nextTexts[message.id];
            replaceTexts(nextTexts);
            setSelectedTextId(null);
            setEditingTextId(null);
          } else if (message.type === 'text:snapshot') {
            replaceTexts(toTextMap(message.texts));
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
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        if (cancelled) return;
        setCursors({});
        setParticipantCount(0);
        setConnectionState('offline');
        retryTimer = window.setTimeout(connect, 2500);
      };
    };

    const resyncRoom = () => {
      if (cancelled) return;
      window.requestAnimationFrame(() => {
        resizeCanvas();
        window.requestAnimationFrame(resizeCanvas);
      });

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        send({ type: 'sync' });
      } else if (!socket || socket.readyState === WebSocket.CLOSED) {
        window.clearTimeout(retryTimer);
        connect();
      }
    };

    connect();
    const heartbeatTimer = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) send({ type: 'ping' });
      else if (!socket || socket.readyState === WebSocket.CLOSED) connect();
    }, 20_000);
    window.addEventListener('focus', resyncRoom);
    window.addEventListener('online', resyncRoom);
    document.addEventListener('visibilitychange', resyncRoom);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(heartbeatTimer);
      window.removeEventListener('focus', resyncRoom);
      window.removeEventListener('online', resyncRoom);
      document.removeEventListener('visibilitychange', resyncRoom);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clientId, redraw, replaceImages, replaceTexts, resizeCanvas, roomId, roomState, send]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.visualViewport?.addEventListener('resize', resizeCanvas);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeCanvas);
    if (observer && canvasRef.current) observer.observe(canvasRef.current);
    if (observer && stageRef.current) observer.observe(stageRef.current);
    const frame = window.requestAnimationFrame(resizeCanvas);
      return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.visualViewport?.removeEventListener('resize', resizeCanvas);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [isMobile, resizeCanvas]);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      if (cursorFrameRef.current !== null) window.cancelAnimationFrame(cursorFrameRef.current);
      if (imageFrameRef.current !== null) window.cancelAnimationFrame(imageFrameRef.current);
      if (textFrameRef.current !== null) window.cancelAnimationFrame(textFrameRef.current);
    };
  }, []);

  const updateLocalImage = (id, changes) => {
    const current = imagesRef.current[id];
    if (!current) return;
    const nextImage = { ...current, ...changes };
    replaceImages({ ...imagesRef.current, [id]: nextImage });
    sendImageUpdate(nextImage);
  };

  const updateLocalText = (id, changes) => {
    const current = textsRef.current[id];
    if (!current) return;
    const nextText = { ...current, ...changes };
    replaceTexts({ ...textsRef.current, [id]: nextText });
    sendTextUpdate(nextText);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    setImageContextMenu(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    resizeCanvas();
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
    if (event.button !== 0) return;
    event.stopPropagation();
    setImageContextMenu(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'move');
    setToolMode('select');
    setSelectedImageId(image.id);
    setSelectedTextId(null);
    setEditingTextId(null);
    imageInteractionRef.current = {
      id: image.id,
      mode,
      startPoint: point,
      initial: { ...image },
      captureTarget: event.currentTarget,
    };
  };

  const handleImageContextMenu = (event, image) => {
    event.preventDefault();
    event.stopPropagation();
    setToolMode('select');
    setSelectedImageId(image.id);
    setImageContextMenu({ id: image.id, x: event.clientX, y: event.clientY });
  };

  const setImageLayer = (id, layer) => {
    if (!imagesRef.current[id]) return;
    updateLocalImage(id, { layer: layer === 'background' ? 'background' : 'top' });
    setImageContextMenu(null);
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

  const handleTextPointerDown = (event, textField) => {
    if (connectionState !== 'connected' || event.button !== 0) return;
    if (event.target.closest?.('textarea')) return;
    event.stopPropagation();
    setImageContextMenu(null);
    setToolMode('select');
    setSelectedImageId(null);
    setSelectedTextId(textField.id);
    setEditingTextId(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'move');
    textInteractionRef.current = {
      id: textField.id,
      startPoint: point,
      initial: { ...textField },
      captureTarget: event.currentTarget,
    };
  };

  const handleTextPointerMove = (event) => {
    const point = getPoint(event);
    if (!point) return;
    sendCursor(point, true, 'move');
    const interaction = textInteractionRef.current;
    if (!interaction) return;
    event.preventDefault();
    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    const initial = interaction.initial;
    updateLocalText(interaction.id, {
      x: clamp(initial.x + deltaX, 0, 1 - initial.width),
      y: clamp(initial.y + deltaY, 0, 1 - initial.height),
    });
  };

  const finishTextInteraction = (event) => {
    const interaction = textInteractionRef.current;
    if (!interaction) return;
    sendTextUpdateNow(textsRef.current[interaction.id]);
    interaction.captureTarget?.releasePointerCapture?.(event.pointerId);
    textInteractionRef.current = null;
  };

  const beginTextEditing = (event, textField) => {
    event.preventDefault();
    event.stopPropagation();
    setToolMode('select');
    setSelectedImageId(null);
    setSelectedTextId(textField.id);
    setEditingTextId(textField.id);
  };

  const handleTextInput = (event, id) => {
    updateLocalText(id, { text: event.target.value });
  };

  const addText = () => {
    if (connectionState !== 'connected') {
      setUploadState('Connect first');
      window.setTimeout(() => setUploadState('idle'), 1800);
      return;
    }
    const textField = {
      id: createTextId(),
      text: 'Text',
      x: 0.38,
      y: 0.42,
      width: 0.24,
      height: 0.1,
      fontSize: 32,
      color: color,
    };
    replaceTexts({ ...textsRef.current, [textField.id]: textField });
    setSelectedImageId(null);
    setSelectedTextId(textField.id);
    setEditingTextId(textField.id);
    setToolMode('select');
    setImageContextMenu(null);
    send({ type: 'text:add', text: textField });
  };

  const deleteSelectedText = () => {
    if (!selectedTextId) return;
    const nextTexts = { ...textsRef.current };
    delete nextTexts[selectedTextId];
    replaceTexts(nextTexts);
    send({ type: 'text:delete', id: selectedTextId });
    setSelectedTextId(null);
    setEditingTextId(null);
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
            layer: 'top',
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

  const clearDrawings = () => {
    strokesRef.current = [];
    redraw();
    send({ type: 'clear:drawings' });
  };

  const clearImages = () => {
    replaceImages({});
    setSelectedImageId(null);
    setImageContextMenu(null);
    send({ type: 'clear:images' });
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

  const toggleDrawMode = () => {
    const nextMode = toolMode === 'draw' ? (isMobile ? 'pan' : 'select') : 'draw';
    setToolMode(nextMode);
    setImageContextMenu(null);
    if (nextMode === 'draw') {
      setSelectedImageId(null);
      setSelectedTextId(null);
      setEditingTextId(null);
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
      style={{
        ...pageStyle,
        overflow: isMobile ? 'auto' : 'hidden',
        touchAction: isMobile ? 'auto' : 'none',
      }}
      onPointerDown={() => setImageContextMenu(null)}
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

      {isMobile && (
        <button type="button" onClick={toggleDrawMode} style={mobileDrawToggleStyle}>
          {toolMode === 'draw' ? 'Pan canvas' : 'Draw'}
        </button>
      )}

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
            max="24"
            step="1"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            style={brushSizeSliderStyle}
          />
        </div>

        <div style={settingsActionsStyle}>
          <button
            type="button"
            onClick={toggleDrawMode}
            style={toolButtonStyle}
          >
            {toolMode === 'draw' ? (isMobile ? 'Pan canvas' : 'Move images') : 'Draw'}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={toolButtonStyle}>
            {uploadState === 'uploading' ? 'Uploading...' : 'Add image'}
          </button>
          <button type="button" onClick={addText} style={toolButtonStyle}>Add text</button>
          {selectedTextId && (
            <button type="button" onClick={deleteSelectedText} style={toolButtonStyle}>Delete text</button>
          )}
          <button type="button" onClick={clearDrawings} style={toolButtonStyle}>Clear all drawings</button>
          <button type="button" onClick={clearImages} style={toolButtonStyle}>Clear all images</button>
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
        style={{
          ...canvasStageStyle,
          ...(isMobile ? mobileCanvasStageStyle : null),
        }}
      >
        <canvas
          ref={canvasRef}
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
            ...canvasStyle,
            zIndex: 2,
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
            zIndex: 0,
            pointerEvents: toolMode === 'draw' ? 'none' : 'auto',
            touchAction: toolMode === 'pan' ? 'auto' : 'none',
            cursor: toolMode === 'pan' ? 'grab' : 'default',
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
              onContextMenu={(event) => handleImageContextMenu(event, image)}
              onPointerEnter={handleImagePointerMove}
              onPointerMove={handleImagePointerMove}
              onPointerLeave={() => handleCursorLeave('move')}
              onPointerUp={finishImageInteraction}
              onPointerCancel={finishImageInteraction}
              style={{
                ...imageFrameStyle,
                zIndex: image.layer === 'background' ? 1 : 3,
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

        {Object.values(texts).map((textField) => {
          const selected = textField.id === selectedTextId;
          const editing = textField.id === editingTextId;
          return (
            <div
              key={textField.id}
              role="textbox"
              tabIndex={0}
              aria-label={`Text field: ${textField.text || 'empty'}`}
              onPointerDown={(event) => handleTextPointerDown(event, textField)}
              onPointerMove={handleTextPointerMove}
              onPointerEnter={(event) => handleCursorMove(event, 'move')}
              onPointerLeave={() => handleCursorLeave('move')}
              onPointerUp={finishTextInteraction}
              onPointerCancel={finishTextInteraction}
              onDoubleClick={(event) => beginTextEditing(event, textField)}
              style={{
                ...textFieldFrameStyle,
                zIndex: selected ? 7 : 6,
                pointerEvents: toolMode === 'select' || (isMobile && toolMode === 'pan') ? 'auto' : 'none',
                left: `${textField.x * 100}%`,
                top: `${textField.y * 100}%`,
                width: `${textField.width * 100}%`,
                height: `${textField.height * 100}%`,
                color: textField.color,
                fontSize: `${textField.fontSize}px`,
                outline: selected ? '2px solid #2f62cc' : 'none',
              }}
            >
              {editing ? (
                <textarea
                  value={textField.text}
                  autoFocus
                  aria-label="Edit text"
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => handleTextInput(event, textField.id)}
                  onBlur={() => {
                    sendTextUpdateNow(textsRef.current[textField.id]);
                    setEditingTextId(null);
                  }}
                  style={textFieldInputStyle}
                />
              ) : (
                <div style={textFieldContentStyle}>{textField.text || 'Double-click to edit'}</div>
              )}
            </div>
          );
        })}

        {imageContextMenu && (
          <div
            style={{
              ...imageContextMenuStyle,
              left: `${Math.max(8, Math.min(imageContextMenu.x, window.innerWidth - 208))}px`,
              top: `${Math.max(8, Math.min(imageContextMenu.y, window.innerHeight - 92))}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" onClick={() => setImageLayer(imageContextMenu.id, 'background')} style={contextMenuButtonStyle}>
              Send to background
            </button>
            <button type="button" onClick={() => setImageLayer(imageContextMenu.id, 'top')} style={contextMenuButtonStyle}>
              Bring to top
            </button>
          </div>
        )}

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
        {` - ${toolMode === 'draw' ? 'draw mode' : toolMode === 'pan' ? 'pan mode' : 'move mode'}`}
        {connectionState !== 'connected' && ' - reconnecting...'}
        {uploadState !== 'idle' && ` - ${uploadState}`}
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

const mobileDrawToggleStyle = {
  ...settingsToggleStyle,
  right: '86px',
  background: '#2f62cc',
  color: '#fff',
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
  background: '#fff',
  touchAction: 'none',
};

const mobileCanvasStageStyle = {
  inset: 'auto',
  top: 0,
  left: 0,
  width: `${MOBILE_BOARD_WIDTH}px`,
  height: `${MOBILE_BOARD_HEIGHT}px`,
  touchAction: 'auto',
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

const cursorSurfaceStyle = {
  position: 'absolute',
  inset: 0,
  touchAction: 'none',
  cursor: 'default',
};

const imageContextMenuStyle = {
  position: 'fixed',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  minWidth: '200px',
  padding: '0.35rem',
  border: '1px solid #dbe3ef',
  borderRadius: '8px',
  background: '#fff',
  boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
};

const contextMenuButtonStyle = {
  border: 0,
  borderRadius: '5px',
  padding: '0.5rem 0.6rem',
  background: '#edf2fa',
  color: '#17233a',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 700,
  textAlign: 'left',
};

const imageFrameStyle = {
  position: 'absolute',
  zIndex: 3,
  boxSizing: 'border-box',
  userSelect: 'none',
  touchAction: 'none',
  overflow: 'visible',
};

const textFieldFrameStyle = {
  position: 'absolute',
  boxSizing: 'border-box',
  padding: '0.25rem',
  userSelect: 'none',
  touchAction: 'none',
  overflow: 'visible',
  cursor: 'move',
};

const textFieldContentStyle = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  whiteSpace: 'pre-wrap',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  pointerEvents: 'none',
};

const textFieldInputStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  padding: 0,
  border: '0',
  outline: 'none',
  resize: 'none',
  background: 'rgba(255,255,255,0.75)',
  color: 'inherit',
  font: 'inherit',
  lineHeight: 1.2,
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
