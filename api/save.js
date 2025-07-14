// /api/save.js
import { put } from '@vercel/blob';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { url, filename, description, volume, loop } = await req.json();
  const id = Math.random().toString(36).substr(2, 8);

  const payload = {
    id,
    url,
    filename,
    description,
    volume,
    loop
  };

  const blob = await put(`videos/${id}.json`, JSON.stringify(payload), {
    access: 'public',
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return new Response(JSON.stringify({ id, blobUrl: blob.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
