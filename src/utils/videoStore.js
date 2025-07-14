// src/utils/videoStore.js

export async function saveVideoToBlob(videoId, data, token) {
  try {
    const blobUrl = `https://api.vercel.com/v2/blobs/videos/${videoId}.json`;
    const response = await fetch(blobUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to upload video data to blob storage');
    }

    return await response.json();
  } catch (error) {
    console.error('Blob upload failed:', error);
    throw error;
  }
}

export async function getVideosFromBlob(id) {
  try {
    const response = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
    if (!response.ok) throw new Error('Blob fetch failed');
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch video blob:', err);
    return null;
  }
}
