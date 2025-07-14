// Vercel-specific config to run this as a Node.js serverless function
export const config = {
  runtime: 'nodejs',
};

import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, ...data } = req.body;

    // Support either a single video URL or a list of videos
    const isMulti = Array.isArray(data.videos);
    const hasSingle = typeof data.url === 'string';

    if (!id || (!isMulti && !hasSingle)) {
      return res.status(400).json({ error: 'Missing video ID or URL(s)' });
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
