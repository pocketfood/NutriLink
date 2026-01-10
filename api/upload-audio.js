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
    const { id, dataUrl } = req.body || {};
    if (!id || !dataUrl) {
      return res.status(400).json({ error: 'Missing audio data or ID' });
    }

    const match = /^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      return res.status(400).json({ error: 'Invalid audio payload' });
    }

    const contentType = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');
    const extension = contentType.includes('wav') ? 'wav' : 'audio';

    const blob = await put(`mixes/${id}.${extension}`, buffer, {
      access: 'public',
      contentType,
      token: process.env.VITE_BLOB_RW_TOKEN,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Audio upload error:', err);
    return res.status(500).json({ error: 'Failed to upload audio mix' });
  }
}
