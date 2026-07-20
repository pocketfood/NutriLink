import { get, put } from '@vercel/blob';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const rooms = new Map();
const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const STATE_PREFIX = 'draw-state';
const MAX_STROKES = 5000;
const MAX_IMAGES = 100;
const MAX_POINTS_PER_STROKE = 600;
const MAX_MESSAGE_BYTES = 256 * 1024;
const IMAGE_ID_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const PERSISTENCE_DEBOUNCE_MS = 500;

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload, except = null) {
  room.clients.forEach((_client, clientSocket) => {
    if (clientSocket !== except) send(clientSocket, payload);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBlobToken() {
  return process.env.VITE_BLOB_RW_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
}

function blobOptions() {
  const options = { access: 'public' };
  const token = getBlobToken();
  if (token) options.token = token;
  return options;
}

function statePath(roomId) {
  return `${STATE_PREFIX}/${roomId}.json`;
}

function normalizePoint(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: clamp(Number(point.x), 0, 1),
    y: clamp(Number(point.y), 0, 1),
  };
}

function normalizeStroke(message) {
  if (!Array.isArray(message.points) || message.points.length < 2) return null;
  if (message.points.length > MAX_POINTS_PER_STROKE) return null;

  const points = message.points.map(normalizePoint);
  if (points.some((point) => !point)) return null;

  const color = typeof message.color === 'string' && /^#[0-9a-f]{6}$/i.test(message.color)
    ? message.color
    : '#2f7fe6';
  const size = Number.isFinite(Number(message.size))
    ? clamp(Number(message.size), 1, 40)
    : 4;

  return { points, color, size };
}

async function readStreamText(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function restoreRoomState(payload) {
  const strokes = (Array.isArray(payload?.strokes) ? payload.strokes : [])
    .map((stroke) => normalizeStroke(stroke))
    .filter(Boolean)
    .slice(-MAX_STROKES);
  const images = new Map();
  (Array.isArray(payload?.images) ? payload.images : [])
    .map((image) => normalizeImage(image))
    .filter(Boolean)
    .slice(0, MAX_IMAGES)
    .forEach((image) => images.set(image.id, image));
  return { strokes, images };
}

async function loadRoomState(roomId) {
  const result = await get(statePath(roomId), blobOptions());
  if (!result) return { strokes: [], images: new Map() };
  const payload = JSON.parse(await readStreamText(result.stream));
  return restoreRoomState(payload);
}

function queueRoomPersistence(roomId, room) {
  if (!room.persistenceReady) return;
  room.pendingSnapshot = JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    strokes: room.strokes,
    images: Array.from(room.images.values()),
  });
  if (room.persistenceTimer) return;
  room.persistenceTimer = setTimeout(() => {
    room.persistenceTimer = null;
    const snapshot = room.pendingSnapshot;
    room.pendingSnapshot = null;
    if (!snapshot) return;
    room.persistenceQueue = room.persistenceQueue
      .catch(() => {})
      .then(() => put(statePath(roomId), snapshot, {
        ...blobOptions(),
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: 'application/json',
      }))
      .catch((error) => {
        console.error('Draw room persistence error:', error);
      });
  }, PERSISTENCE_DEBOUNCE_MS);
}

async function ensureRoomState(roomId, room) {
  if (room.persistenceLoaded) return;
  if (!getBlobToken()) {
    room.persistenceLoaded = true;
    return;
  }
  if (!room.persistenceLoad) {
    room.persistenceLoad = loadRoomState(roomId)
      .then(({ strokes, images }) => {
        room.strokes = strokes;
        room.images = images;
        room.persistenceReady = true;
      })
      .catch((error) => {
        room.persistenceReady = false;
        console.error('Draw room state load error:', error);
      })
      .finally(() => {
        room.persistenceLoaded = true;
      });
  }
  await room.persistenceLoad;
}

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      clients: new Map(),
      strokes: [],
      images: new Map(),
      persistenceLoaded: false,
      persistenceReady: false,
      persistenceLoad: null,
      persistenceQueue: Promise.resolve(),
      persistenceTimer: null,
      pendingSnapshot: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function createClientId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(name) {
  if (typeof name !== 'string') return 'Guest';
  const printable = Array.from(name)
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('');
  const normalized = printable.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 24) || 'Guest';
}

function uniqueClientId(room, requestedId) {
  const base = typeof requestedId === 'string' && /^[a-z0-9_-]{4,64}$/i.test(requestedId)
    ? requestedId
    : createClientId();
  let id = base;
  let suffix = 1;
  const ids = new Set(Array.from(room.clients.values(), (client) => client.id));
  while (ids.has(id)) {
    id = `${base.slice(0, 56)}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeCursor(message, client) {
  const point = message?.point;
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    id: client.id,
    name: client.name,
    x: clamp(Number(point.x), 0, 1),
    y: clamp(Number(point.y), 0, 1),
    active: message.active !== false,
  };
}

function isPublicBlobUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'public.blob.vercel-storage.com' ||
      url.hostname.endsWith('.public.blob.vercel-storage.com')
    );
  } catch {
    return false;
  }
}

function normalizeImage(message) {
  const value = message?.image || message;
  if (!value || !IMAGE_ID_PATTERN.test(value.id) || !isPublicBlobUrl(value.url)) return null;

  const width = clamp(Number(value.width), 0.04, 0.9);
  const height = clamp(Number(value.height), 0.04, 0.9);
  const x = clamp(Number(value.x), 0, 1 - width);
  const y = clamp(Number(value.y), 0, 1 - height);
  if (![x, y, width, height].every(Number.isFinite)) return null;

  return {
    id: value.id,
    url: value.url,
    name: normalizeName(value.name || 'Image'),
    x,
    y,
    width,
    height,
  };
}

function broadcastPresence(room) {
  broadcast(room, { type: 'presence', count: room.clients.size });
}

const server = createServer((_request, response) => {
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'WebSocket endpoint' }));
});

const socketServer = new WebSocketServer({ server });

socketServer.on('connection', async (socket, request) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const roomId = requestUrl.searchParams.get('room') || '';

  if (!ROOM_PATTERN.test(roomId)) {
    socket.close(1008, 'Invalid room');
    return;
  }

  const room = getRoom(roomId);
  const client = { id: createClientId(), name: 'Guest', cursor: null };
  room.clients.set(socket, client);
  const roomStateReady = ensureRoomState(roomId, room);
  roomStateReady.then(() => {
    if (socket.readyState !== WebSocket.OPEN) return;
    send(socket, {
      type: 'snapshot',
      strokes: room.strokes,
      images: Array.from(room.images.values()),
      cursors: Array.from(room.clients.values(), ({ cursor }) => cursor).filter(Boolean),
    });
    broadcastPresence(room);
  });

  socket.on('message', async (raw) => {
    await roomStateReady;
    if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) return;

    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'join') {
      if (message.id !== client.id) client.id = uniqueClientId(room, message.id);
      client.name = normalizeName(message.name);
      if (client.cursor) {
        client.cursor = { ...client.cursor, id: client.id, name: client.name };
        broadcast(room, { type: 'cursor', cursor: client.cursor });
      }
      send(socket, { type: 'joined', id: client.id });
      return;
    }

    if (message.type === 'cursor') {
      const cursor = normalizeCursor(message, client);
      if (!cursor) return;
      client.cursor = cursor.active ? cursor : null;
      broadcast(room, { type: 'cursor', cursor }, socket);
      return;
    }

    if (message.type === 'image:add') {
      if (room.images.size >= MAX_IMAGES) return;
      const image = normalizeImage(message);
      if (!image || room.images.has(image.id)) return;
      room.images.set(image.id, image);
      queueRoomPersistence(roomId, room);
      broadcast(room, { type: 'image:add', image });
      return;
    }

    if (message.type === 'image:update') {
      const existing = room.images.get(message.id);
      if (!existing) return;
      const image = normalizeImage({ image: { ...existing, ...message } });
      if (!image || image.id !== existing.id || image.url !== existing.url) return;
      room.images.set(image.id, image);
      queueRoomPersistence(roomId, room);
      broadcast(room, { type: 'image:update', image });
      return;
    }

    if (message.type === 'stroke') {
      const stroke = normalizeStroke(message);
      if (!stroke) return;
      room.strokes.push(stroke);
      if (room.strokes.length > MAX_STROKES) room.strokes.splice(0, room.strokes.length - MAX_STROKES);
      queueRoomPersistence(roomId, room);
      broadcast(room, { type: 'stroke', stroke }, socket);
      return;
    }

    if (message.type === 'clear') {
      room.strokes = [];
      room.images.clear();
      queueRoomPersistence(roomId, room);
      broadcast(room, { type: 'clear' });
    }
  });

  socket.on('close', () => {
    const closedClient = room.clients.get(socket);
    room.clients.delete(socket);
    if (closedClient?.cursor) {
      broadcast(room, {
        type: 'cursor',
        cursor: { ...closedClient.cursor, active: false },
      });
    }
    if (room.clients.size === 0) {
      rooms.delete(roomId);
      return;
    }
    broadcastPresence(room);
  });

  socket.on('error', () => {
    room.clients.delete(socket);
  });
});

export default server;
