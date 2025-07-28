import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaDownload, FaQrcode, FaVolumeMute, FaVolumeUp, FaInfoCircle } from 'react-icons/fa';

export default function WatchPage() {
  const { id } = useParams();
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const videoRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    async function fetchVideo() {
      try {
        const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
        if (!res.ok) throw new Error('Video not found or expired');
        const data = await res.json();
        setVideoData(data);
        if (typeof data.volume === 'number') setVolume(data.volume);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchVideo();
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const bar = progressRef.current;
      if (video && bar && video.duration) {
        const percent = (video.currentTime / video.duration) * 100;
        bar.style.width = `${percent}%`;
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) video.muted = !muted;
    setMuted(!muted);
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    if (video && video.duration) {
      video.currentTime = percent * video.duration;
    }
  };

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'white' }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!videoData) {
    return (
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'white' }}>
        <p>Loading video...</p>
      </div>
    );
  }

  const loop = videoData.loop === true;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'black' }}>
      <video
        ref={videoRef}
        src={videoData.url}
        autoPlay
        loop={loop}
        muted={muted}
        controls={false}
        playsInline
        preload="auto"
        onClick={() => {
          const video = videoRef.current;
          if (video) {
            video.paused ? video.play() : video.pause();
          }
        }}
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain',
          cursor: 'pointer',
        }}
      />

      {/* Clickable NutriLink Logo */}
      <Link to="/" style={{ position: 'absolute', top: '0.1rem', left: '0.11rem', zIndex: 10 }}>
        <img
          src="/nutrilink-logo.png"
          alt="NutriLink"
          style={{
            height: '150px',
            opacity: 0.95,
            pointerEvents: 'auto',
          }}
        />
      </Link>

      {/* Sidebar Buttons */}
      <div
        style={{
          position: 'absolute',
          top: '3%',
          right: '2rem',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.6rem',
          alignItems: 'center',
          color: 'white',
        }}
      >
        <FaQrcode size={24} onClick={() => setShowQR(true)} style={{ cursor: 'pointer' }} title="Share" />
        <FaDownload size={24} onClick={() => window.open(videoData.url, '_blank')} style={{ cursor: 'pointer' }} title="Download" />
        {muted ? (
          <FaVolumeMute size={24} onClick={toggleMute} style={{ cursor: 'pointer' }} title="Unmute" />
        ) : (
          <FaVolumeUp size={24} onClick={toggleMute} style={{ cursor: 'pointer' }} title="Mute" />
        )}
        <FaInfoCircle size={24} onClick={() => setShowInfo(!showInfo)} style={{ cursor: 'pointer' }} title="Info" />
      </div>

      {/* Volume Slider (bottom left) */}
      <div style={{
        position: 'absolute',
        bottom: '4.2rem',
        left: '1rem',
        zIndex: 10,
        color: '#fff',
        fontSize: '12px'
      }}>
        <label>Volume</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{ marginLeft: '0.5rem' }}
        />
        <span style={{ marginLeft: '0.5rem' }}>{(volume * 100).toFixed(0)}%</span>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div
          style={{
            position: 'absolute',
            top: '3rem',
            right: '6rem',
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '1rem',
            borderRadius: '10px',
            fontSize: '14px',
            maxWidth: '250px',
            zIndex: 20,
          }}
        >
          <strong>{videoData.filename || 'Untitled'}</strong>
          <p style={{ marginTop: '0.5rem' }}>{videoData.description || 'No description available.'}</p>
          <p><b>Loop:</b> {loop ? 'Yes' : 'No'}</p>
        </div>
      )}

      {/* Progress Bar */}
      <div
        onClick={handleSeek}
        style={{
          position: 'absolute',
          bottom: 10,
          left: 0,
          width: '100%',
          height: '55px',
          backgroundColor: '#333',
          zIndex: 10,
          cursor: 'pointer',
        }}
      >
        <div
          ref={progressRef}
          style={{
            height: '100%',
            width: '0%',
            backgroundColor: '#162557',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Text Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '5rem',
          left: '1rem',
          color: 'white',
          zIndex: 10,
          width: 'calc(100% - 5rem)',
        }}
      >
        {videoData.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{videoData.filename}</h3>}
        {videoData.description && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{videoData.description}</p>
        )}
      </div>

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
            <p
              style={{
                marginTop: '1rem',
                fontSize: '0.85rem',
                color: '#333',
                wordBreak: 'break-all',
              }}
            >
              {window.location.href}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
