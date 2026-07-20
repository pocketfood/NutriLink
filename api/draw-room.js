import { head, put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const ROOM_PREFIX = 'draw-rooms';

function getToken() {
  return process.env.VITE_BLOB_RW_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
}

function roomPath(roomId) {
  return `${ROOM_PREFIX}/${roomId}.json`;
}

function createRoomId() {
  return randomBytes(18).toString('base64url');
}

function blobOptions() {
  const options = { access: 'public' };
  const token = getToken();
  if (token) options.token = token;
  return options;
}

export async function roomExists(roomId) {
  if (!ROOM_PATTERN.test(roomId || '')) return false;
  try {
    await head(roomPath(roomId), blobOptions());
    return true;
  } catch (error) {
    if (error?.status === 404 || error?.statusCode === 404) return false;
    throw error;
  }
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const roomId = requestUrl.searchParams.get('id') || '';
    if (!ROOM_PATTERN.test(roomId)) return response.status(404).json({ error: 'Room not found' });

    try {
      if (!(await roomExists(roomId))) return response.status(404).json({ error: 'Room not found' });
      return response.status(200).json({ roomId });
    } catch (error) {
      console.error('Draw room lookup error:', error);
      return response.status(500).json({ error: 'Unable to validate room' });
    }
  }

  if (request.method === 'POST') {
    const roomId = createRoomId();
    try {
      const metadata = JSON.stringify({ roomId, createdAt: new Date().toISOString() });
      await put(roomPath(roomId), metadata, {
        ...blobOptions(),
        addRandomSuffix: false,
        contentType: 'application/json',
      });
      return response.status(201).json({ roomId });
    } catch (error) {
      console.error('Draw room creation error:', error);
      return response.status(500).json({ error: 'Unable to create room' });
    }
  }

  return response.status(405).json({ error: 'Method not allowed' });
}
