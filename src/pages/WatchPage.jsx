import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';

export default function WatchPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);

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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'black' }}>
      <video
        src={videoData.url}
        autoPlay
        loop={loop}
        controls
        muted={false}
        playsInline
        onLoadedMetadata={(e) => (e.target.volume = volume)}
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
        }}
      />

      {/* NutriLink Logo Overlay (Top Left) */}
      <img
        src="/nutrilink-logo.png"
        alt="NutriLink"
        style={{
          position: 'absolute',
          top: '0.1rem',
          left: '0.11rem',
          height: '110px',
          zIndex: 10,
          opacity: 0.95,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      />

      {/* Text + Buttons (Bottom) */}
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        left: '1rem',
        color: 'white',
        zIndex: 10,
        width: 'calc(100% - 2rem)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
      }}>
        <div style={{ maxWidth: '75%' }}>
          {videoData.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{videoData.filename}</h3>}
          {videoData.description && <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{videoData.description}</p>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <a
            href={videoData.url}
            download
            style={{
              backgroundColor: '#999',
              color: 'white',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textDecoration: 'none',
            }}
          >
            Download
          </a>
          <button
            onClick={() => setShowQR(true)}
            style={{
              backgroundColor: '#111',
              color: 'white',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              border: '1px solid white',
              cursor: 'pointer',
            }}
          >
            SHARE
          </button>
        </div>
      </div>

      {/* QR Modal */}
      {showQR && (
        <div
          onClick={() => setShowQR(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              padding: '1rem',
              borderRadius: '10px',
              textAlign: 'center',
              maxWidth: '90vw',
              wordBreak: 'break-word',
            }}
          >
            <QRCode value={window.location.href} size={180} />
            <p style={{
              marginTop: '1rem',
              fontSize: '0.85rem',
              color: '#333',
              wordBreak: 'break-all'
            }}>
              {window.location.href}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
