import { useParams } from 'react-router-dom';
import { getVideo } from '../utils/videoStore';
import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { QRCodeCanvas } from 'qrcode.react';

export default function WatchPage() {
  const { id } = useParams();
  const url = getVideo(id);
  const fullUrl = `${window.location.origin}/v/${id}`;
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (url && videoRef.current && !playerRef.current) {
      playerRef.current = videojs(videoRef.current, {
        controls: true,
        autoplay: true,
        preload: 'auto',
        fluid: false,
        width: 720,
        height: 405,
        sources: [{
          src: url,
          type: 'video/mp4'
        }]
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [url]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!url) {
    return <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>Invalid or expired link.</div>;
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#ffffff', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      {/* Centered logo */}
      <div style={{ textAlign: 'center' }}>
        <img src="/nutrilink-logo.png" alt="NutriLink Logo" style={{ maxWidth: '180px', marginBottom: '1rem' }} />
      </div>

      {/* Video container */}
      <div style={{
        margin: '2rem auto',
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

      {/* Action buttons */}
      <div style={{ marginTop: '1.5rem' }}>
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
          href={url}
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

      {/* QR Code block */}
      <div style={{ marginTop: '2rem' }}>
        <p style={{ fontSize: '14px', color: '#444' }}>Scan to share:</p>
        <QRCodeCanvas value={fullUrl} size={128} />
        <p style={{ fontSize: '12px', color: '#777', marginTop: '0.5rem' }}>{fullUrl}</p>
      </div>

      {/* Footer */}
      <div style={{ marginTop: '3rem', fontSize: '12px', color: '#999' }}>
        © 2025 NutriLink
      </div>

      {/* Custom Video.js skin */}
      <style>
        {`
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
        `}
      </style>
    </div>
  );
}
