// Vercel-specific config to run this as a Node.js serverless function
export const config = {
  runtime: 'nodejs',
};

import { put } from '@vercel/blob';
import { Buffer } from 'node:buffer';

const MAX_POSTER_BYTES = 2 * 1024 * 1024;

function parsePosterData(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Invalid poster image data');

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_POSTER_BYTES) {
    throw new Error('Poster image is too large');
  }

  return { buffer, contentType: match[1] };
}

async function uploadPoster(id, suffix, value) {
  const poster = parsePosterData(value);
  if (!poster) return null;

  const blob = await put(`videos/${id}${suffix}.poster`, poster.buffer, {
    access: 'public',
    contentType: poster.contentType,
    token: process.env.VITE_BLOB_RW_TOKEN,
  });

  return blob.url;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, ...rawData } = req.body || {};
    const data = { ...rawData };

    // Support either a single video URL or a list of videos
    const isMulti = Array.isArray(data.videos);
    const hasSingle = typeof data.url === 'string';

    if (!id || (!isMulti && !hasSingle)) {
      return res.status(400).json({ error: 'Missing video ID or URL(s)' });
    }

    if (isMulti) {
      data.videos = await Promise.all(data.videos.map(async (item, index) => {
        if (!item || typeof item !== 'object') return item;
        const nextItem = { ...item };
        const posterData = nextItem.posterData;
        delete nextItem.posterData;
        if (posterData) nextItem.poster = await uploadPoster(id, `-${index}`, posterData);
        return nextItem;
      }));
    } else if (data.posterData) {
      data.poster = await uploadPoster(id, '', data.posterData);
      delete data.posterData;
    }

    const blob = await put(`videos/${id}.json`, JSON.stringify(data), {
      access: 'public',
      token: process.env.VITE_BLOB_RW_TOKEN,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload error:', err);
    return res.status(500).json({ error: 'Failed to save video metadata' });
  }
}
