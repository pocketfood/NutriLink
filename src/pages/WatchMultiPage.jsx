import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaDownload, FaQrcode, FaInfoCircle } from 'react-icons/fa';

export default function WatchMultiPage() {
  const { id } = useParams();
  const [videoData, setVideoData] = useState([]);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const videoRefs = useRef([]);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
        if (!res.ok) throw new Error('Video not found or expired');
        const data = await res.json();
        setVideoData(data.videos || []);
        setVolume(data.volume || 1);
        setLoop(data.loop || false);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchVideos();
  }, [id]);

  useEffect(() => {
    if (!videoRefs.current.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.6 }
    );

    videoRefs.current.forEach((video) => {
      if (video) observer.observe(video);
    });

    return () => {
      videoRefs.current.forEach((video) => {
        if (video) observer.unobserve(video);
      });
    };
  }, [videoData]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'white' }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!videoData.length) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'white' }}>
        <p>Loading videos...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        backgroundColor: 'black',
      }}
    >
      {videoData.map((vid, index) => (
        <div
          key={index}
          style={{
            position: 'relative',
            height: '100vh',
            width: '100vw',
            scrollSnapAlign: 'start',
            overflow: 'hidden',
            backgroundColor: 'black',
          }}
        >
          <video
            ref={(el) => (videoRefs.current[index] = el)}
            src={vid.url}
            loop={loop}
            muted={false}
            controls
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => (e.target.volume = volume)}
            style={{
              width: '100vw',
              height: '100vh',
              objectFit: 'contain',
              backgroundColor: 'black',
            }}
          />

          {/* NutriLink Logo (Top Left) */}
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
              pointerEvents: 'none',
            }}
          />

          {/* Sidebar Buttons (Right Side) */}
          <div
            style={{
              position: 'absolute',
              top: '5%',
              right: '1rem',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.4rem',
              alignItems: 'center',
              color: 'white',
            }}
          >
            <FaQrcode
              size={24}
              onClick={() => setShowQR(true)}
              style={{ cursor: 'pointer' }}
              title="Share"
            />
            <FaDownload
              size={24}
              onClick={() => window.open(vid.url, '_blank')}
              style={{ cursor: 'pointer' }}
              title="Download"
            />
            <FaInfoCircle
              size={24}
              style={{ cursor: 'default' }}
              title="Info"
            />
          </div>

          {/* Text Overlay (Bottom Left) */}
          <div style={{
            position: 'absolute',
            bottom: '5rem',
            left: '1rem',
            color: 'white',
            zIndex: 10,
            width: 'calc(100% - 5rem)',
          }}>
            {vid.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{vid.filename}</h3>}
            {vid.description && <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{vid.description}</p>}
          </div>
        </div>
      ))}

      {/* QR Modal */}
      {showQR && (
        <div
          onClick={() => setShowQR(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
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
