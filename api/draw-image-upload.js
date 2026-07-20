import { handleUpload } from '@vercel/blob/client';

export const config = {
  runtime: 'nodejs',
};

const ROOM_PATTERN = /^[a-z0-9_-]{4,64}$/i;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function readJsonBody(request) {
  if (typeof request.json === 'function') return request.json();

  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
    const rawBody = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : String(request.body);
    return JSON.parse(rawBody || '{}');
  }

  let raw = '';
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || '{}');
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(request);
    const token = process.env.VITE_BLOB_RW_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    const options = {
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payload;
        try {
          payload = JSON.parse(clientPayload || '{}');
        } catch {
          throw new Error('Invalid drawing room');
        }

        if (!ROOM_PATTERN.test(payload.roomId || '')) throw new Error('Invalid drawing room');

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          cacheControlMaxAge: 60 * 60 * 24,
          tokenPayload: JSON.stringify({ roomId: payload.roomId }),
        };
      },
      onUploadCompleted: async () => {},
    };

    if (token) options.token = token;
    const jsonResponse = await handleUpload(options);
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Draw image upload error:', error);
    return response.status(400).json({ error: error.message || 'Image upload failed' });
  }
}
