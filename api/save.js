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

    const blob = await put(`videos/${id}.json`, JSON.stringify(data), {
      access: 'public',
      token: process.env.VERCEL_BLOB_RW_TOKEN,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save video metadata' });
  }
}
