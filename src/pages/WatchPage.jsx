import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as QRCodeReact from 'qrcode.react';
const QRCode = QRCodeReact.default;

export default function WatchPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState(null);

  const volume = parseFloat(searchParams.get('vol')) || 1;
  const loop = searchParams.get('loop') === 'true';

  useEffect(() => {
    async function fetchVideo() {
      try {
        const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
        if (!res.ok) throw new Error('Video not found or expired');
        const data = await res.json();
        setVideoData(data);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchVideo();
  }, [id]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!videoData) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <p>Loading video...</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#fff', minHeight: '100vh', padding: '1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <img src="/nutrilink-logo.png" alt="NutriLink Logo" style={{ maxWidth: '200px' }} />
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <video
          src={videoData.url}
          controls
          autoPlay
          loop={loop}
          style={{ width: '100%', maxHeight: '500px', borderRadius: '8px' }}
          onLoadedMetadata={(e) => (e.target.volume = volume)}
        />

        {videoData.filename && (
          <h2 style={{ marginTop: '1rem', color: '#222' }}>{videoData.filename}</h2>
        )}

        {videoData.description && (
          <p style={{ marginTop: '0.5rem', color: '#555', fontSize: '14px' }}>{videoData.description}</p>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            style={{
              padding: '0.4rem 1rem',
              marginRight: '0.5rem',
              backgroundColor: '#2f62cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Copy Share Link
          </button>

          <a
            href={videoData.url}
            download
            style={{
              padding: '0.4rem 1rem',
              backgroundColor: '#999',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            Download Video
          </a>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <QRCode value={window.location.href} size={128} />
          <p style={{ marginTop: '0.5rem', color: '#777' }}>Scan to view on another device</p>
        </div>
      </div>
    </div>
  );
}
