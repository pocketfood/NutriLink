import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaDownload, FaQrcode, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';

export default function WatchMultiPage() {
  const { id } = useParams();
  const blobIds = id.split(',');
  const [videoData, setVideoData] = useState([]);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRefs = useRef([]);
  const progressRefs = useRef([]);

  useEffect(() => {
    async function fetchAll() {
      const combined = [];

      for (const blobId of blobIds) {
        try {
          const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${blobId}.json`);
          if (!res.ok) throw new Error('Blob not found');
          const json = await res.json();
          if (json.videos) {
            combined.push(...json.videos);
          } else if (json.url) {
            combined.push({ url: json.url, filename: json.filename, description: json.description });
          }
        } catch (e) {
          console.warn(`Failed to load blob ${blobId}`, e);
        }
      }

      setVideoData(combined);
    }

    fetchAll();
  }, [id]);

  useEffect(() => {
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

  useEffect(() => {
    const tryPlayFirst = () => {
      const first = videoRefs.current[0];
      if (first) {
        first.muted = muted;
        const tryPlay = () => first.play().catch(() => {});
        if (first.readyState >= 2) tryPlay();
        else first.addEventListener('loadeddata', tryPlay, { once: true });
      }
    };

    const delay = setTimeout(tryPlayFirst, 500);
    return () => clearTimeout(delay);
  }, [videoData, muted]);

  const toggleMute = () => {
    setMuted((prev) => {
      const newMuted = !prev;
      videoRefs.current.forEach((v) => {
        if (v) v.muted = newMuted;
      });
      return newMuted;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      videoRefs.current.forEach((video, i) => {
        const bar = progressRefs.current[i];
        if (video && bar) {
          const percent = (video.currentTime / video.duration) * 100;
          bar.style.width = `${percent || 0}%`;
        }
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSeek = (e, index) => {
    const video = videoRefs.current[index];
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    if (video && video.duration) {
      video.currentTime = percent * video.duration;
    }
  };

  const handleVideoEnd = (index) => {
    const next = videoRefs.current[index + 1];
    if (next) {
      next.scrollIntoView({ behavior: 'smooth' });
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
            muted={muted}
            controls={false}
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => (e.target.volume = volume)}
            onEnded={() => handleVideoEnd(index)}
            onClick={() => {
              const v = videoRefs.current[index];
              if (v.paused) v.play();
              else v.pause();
            }}
            style={{
              width: '100vw',
              height: '100vh',
              objectFit: 'contain',
              backgroundColor: 'black',
              cursor: 'pointer',
            }}
          />

          {/* NutriLink Logo */}
          <img
            src="/nutrilink-logo.png"
            alt="NutriLink"
            style={{
              position: 'absolute',
              top: '0.1rem',
              left: '0.11rem',
              height: '150px',
              zIndex: 10,
              opacity: 0.95,
              pointerEvents: 'none',
            }}
          />

          {/* Sidebar Icons */}
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
            {muted ? (
              <FaVolumeMute
                size={24}
                onClick={toggleMute}
                style={{ cursor: 'pointer' }}
                title="Unmute"
              />
            ) : (
              <FaVolumeUp
                size={24}
                onClick={toggleMute}
                style={{ cursor: 'pointer' }}
                title="Mute"
              />
            )}
          </div>

          {/* Progress Bar w/ Seek */}
          <div
            onClick={(e) => handleSeek(e, index)}
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
              ref={(el) => (progressRefs.current[index] = el)}
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
            {vid.filename && (
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{vid.filename}</h3>
            )}
            {vid.description && (
              <p
                style={{
                  margin: '0.5rem 0 0',
                  fontSize: '0.9rem',
                  color: '#ccc',
                }}
              >
                {vid.description}
              </p>
            )}
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
