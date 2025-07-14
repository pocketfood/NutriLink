import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';

export default function WatchPage() {
  const { id } = useParams();
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  const blobBaseUrl = 'https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${blobBaseUrl}/videos/${id}.json`);
        if (!res.ok) throw new Error('Video not found');
        const data = await res.json();
        setVideoData(data);
      } catch (err) {
        setError('Invalid or expired video link.');
      }
    };
    fetchData();
  }, [id]);

  const handleShare = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    alert('Link copied to clipboard!');
  };

  const handleDownload = () => {
    if (videoData?.url) {
      const a = document.createElement('a');
      a.href = videoData.url;
      a.download = videoData.filename || 'video';
      a.click();
    }
  };

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Arial' }}>
        <h2>{error}</h2>
      </div>
    );
  }

  if (!videoData) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Arial' }}>
        <h2>Loading video...</h2>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh', fontFamily: 'Arial, sans-serif', padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <img src="/nutrilink-logo.png" alt="NutriLink Logo" style={{ maxWidth: '180px' }} />
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', background: '#f9f9f9', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '18px' }}>{videoData.filename}</h2>
        <p style={{ fontSize: '14px', color: '#555' }}>{videoData.description}</p>

        <video
          ref={videoRef}
          controls
          loop={videoData.loop}
          style={{ width: '100%', margin: '1rem 0', borderRadius: '6px', background: '#000' }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              videoRef.current.volume = videoData.volume || 1;
            }
          }}
        >
          <source src={videoData.url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={handleShare}
            style={{ padding: '0.5rem 1rem', background: '#2f62cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Share Link
          </button>

          <button
            onClick={handleDownload}
            style={{ padding: '0.5rem 1rem', background: '#777', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Download Video
          </button>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '12px', color: '#888' }}>
        © 2025 NutriLink. All rights reserved.
      </div>
    </div>
  );
}
