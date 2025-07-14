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

    if (!id || !data.url) {
      return res.status(400).json({ error: 'Missing video ID or URL' });
    }

    // Upload to Blob storage with your token from Vercel env vars
    const blob = await put(`videos/${id}.json`, JSON.stringify(data), {
      access: 'public',
      token: process.env.VITE_BLOB_RW_TOKEN, // ✅ Make sure this matches your Vercel dashboard
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload error:', err);
    return res.status(500).json({ error: 'Failed to save video metadata' });
  }
}
