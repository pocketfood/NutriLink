import { useParams } from 'react-router-dom';
import { getVideo } from '../utils/videoStore';
import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { QRCodeCanvas } from 'qrcode.react';

export default function WatchPage() {
  const { id } = useParams();
  const videoData = getVideo(id);
  const fullUrl = `${window.location.origin}/v/${id}${window.location.search}`;
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialVolume = parseFloat(params.get('vol')) || 1;
    const shouldLoop = params.get('loop') === 'true';

    if (videoData?.url && videoRef.current && !playerRef.current) {
      playerRef.current = videojs(videoRef.current, {
        controls: true,
        autoplay: true,
        preload: 'auto',
        fluid: false,
        width: 720,
        height: 405,
        loop: shouldLoop,
        sources: [{
          src: videoData.url,
          type: 'video/mp4'
        }]
      });

      playerRef.current.ready(() => {
        playerRef.current.volume(initialVolume);
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [videoData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!videoData) {
    return <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>Invalid or expired link.</div>;
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      {/* Centered logo */}
      <div style={{ textAlign: 'center' }}>
        <img src="/nutrilink-logo.png" alt="NutriLink Logo" style={{ maxWidth: '180px', marginBottom: '1rem' }} />
      </div>

      {/* Filename */}
      {videoData.filename && (
        <h2 style={{ margin: '1rem 0', fontSize: '20px', color: '#222' }}>
          {videoData.filename}
        </h2>
      )}

      {/* Video container */}
      <div style={{
        margin: '1rem auto',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 0 12px rgba(0,0,0,0.1)',
        padding: '1rem',
        display: 'inline-block'
      }}>
        <div data-vjs-player>
          <video ref={videoRef} className="video-js nutrilink-player" />
        </div>
      </div>

      {/* Description */}
      {videoData.description && (
        <div style={{
          maxWidth: '700px',
          margin: '1rem auto 2rem',
          fontSize: '14px',
          color: '#555'
        }}>
          {videoData.description}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: '1rem' }}>
        <button
          onClick={handleCopy}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2f62cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            marginRight: '1rem',
            cursor: 'pointer'
          }}
        >
          {copied ? 'Link Copied!' : 'Copy Share Link'}
        </button>

        <a
          href={videoData.url}
          download
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2f62cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            textDecoration: 'none'
          }}
        >
          Download Video
        </a>
      </div>

      {/* QR Code */}
      <div style={{ marginTop: '2rem' }}>
        <p style={{ fontSize: '14px', color: '#444' }}>Scan to share:</p>
        <QRCodeCanvas value={fullUrl} size={128} />
        <p style={{ fontSize: '12px', color: '#777', marginTop: '0.5rem' }}>{fullUrl}</p>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '3rem', fontSize: '12px', color: '#999' }}>
        © 2025 NutriLink
      </div>

      <style>{`
        .nutrilink-player .vjs-control-bar {
          background: #2f62cc;
        }
        .nutrilink-player .vjs-button {
          color: #fff;
        }
        .nutrilink-player .vjs-play-progress,
        .nutrilink-player .vjs-volume-level {
          background-color: white;
        }
        .nutrilink-player .vjs-big-play-button {
          background: #2f62cc;
          border: none;
          color: white;
          font-size: 2rem;
          width: 2.5em;
          height: 2.5em;
          top: 45%;
          left: 45%;
          border-radius: 50%;
        }
      `}</style>
    </div>
  );
}
