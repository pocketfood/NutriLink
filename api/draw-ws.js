import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const rooms = new Map();
const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const MAX_STROKES = 5000;
const MAX_POINTS_PER_STROKE = 600;
const MAX_MESSAGE_BYTES = 256 * 1024;

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload, except = null) {
  room.clients.forEach((client) => {
    if (client !== except) send(client, payload);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = { clients: new Set(), strokes: [] };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastPresence(room) {
  broadcast(room, { type: 'presence', count: room.clients.size });
}

const server = createServer((_request, response) => {
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'WebSocket endpoint' }));
});

const socketServer = new WebSocketServer({ server });

socketServer.on('connection', (socket, request) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const roomId = requestUrl.searchParams.get('room') || '';

  if (!ROOM_PATTERN.test(roomId)) {
    socket.close(1008, 'Invalid room');
    return;
  }

  const room = getRoom(roomId);
  room.clients.add(socket);
  send(socket, { type: 'snapshot', strokes: room.strokes });
  broadcastPresence(room);

  socket.on('message', (raw) => {
    if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) return;

    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'stroke') {
      const stroke = normalizeStroke(message);
      if (!stroke) return;
      room.strokes.push(stroke);
      if (room.strokes.length > MAX_STROKES) room.strokes.splice(0, room.strokes.length - MAX_STROKES);
      broadcast(room, { type: 'stroke', stroke }, socket);
      return;
    }

    if (message.type === 'clear') {
      room.strokes = [];
      broadcast(room, { type: 'clear' });
    }
  });

  socket.on('close', () => {
    room.clients.delete(socket);
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
