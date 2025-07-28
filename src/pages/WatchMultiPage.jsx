import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  FaDownload,
  FaQrcode,
  FaVolumeMute,
  FaVolumeUp,
  FaInfoCircle,
} from 'react-icons/fa';

export default function WatchMultiPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoData, setVideoData] = useState([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [error, setError] = useState(null);

  const videoRefs = useRef([]);
  const progressRefs = useRef([]);

  useEffect(() => {
    async function fetchAllVideos() {
      try {
        const ids = id.split(',');
        const blobs = await Promise.all(
          ids.map(async (blobId) => {
            const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${blobId}.json`);
            if (!res.ok) throw new Error('Some video blobs could not be loaded');
            const json = await res.json();
            return json.videos || [];
          })
        );
        const flatList = blobs.flat();
        setVideoData(flatList);
        if (flatList.length > 0) {
          const first = flatList[0];
          setVolume(typeof first.volume === 'number' ? first.volume : 1);
        }
      } catch (err) {
        setError(err.message);
      }
    }

    fetchAllVideos();
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

  const toggleMute = () => {
    setMuted((prev) => {
      const newMuted = !prev;
      videoRefs.current.forEach((v) => {
        if (v) v.muted = newMuted;
      });
      return newMuted;
    });
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    videoRefs.current.forEach((v) => {
      if (v) v.volume = newVolume;
    });
  };

  if (error) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '2rem' }}>{error}</div>;
  }

  if (!videoData.length) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '2rem' }}>Loading...</div>;
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
            muted={muted}
            controls={false}
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => (e.target.volume = volume)}
            style={{
              width: '100vw',
              height: '100vh',
              objectFit: 'contain',
              backgroundColor: 'black',
              cursor: 'pointer',
            }}
            onClick={() => {
              const v = videoRefs.current[index];
              if (v.paused) v.play();
              else v.pause();
            }}
          />

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
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/')}
          />

          <div
            style={{
              position: 'absolute',
              top: '3%',
              right: '2rem',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.4rem',
              alignItems: 'center',
              color: 'white',
            }}
          >
            <FaQrcode size={22} onClick={() => setShowQR(true)} style={{ cursor: 'pointer' }} title="Share" />
            <FaDownload
              size={22}
              onClick={() => window.open(vid.url, '_blank')}
              style={{ cursor: 'pointer' }}
              title="Download"
            />
            <FaInfoCircle size={22} onClick={() => setShowInfo((prev) => !prev)} style={{ cursor: 'pointer' }} title="Toggle Info" />
            {muted ? (
              <FaVolumeMute size={22} onClick={toggleMute} style={{ cursor: 'pointer' }} title="Unmute" />
            ) : (
              <FaVolumeUp size={22} onClick={toggleMute} style={{ cursor: 'pointer' }} title="Mute" />
            )}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              style={{ width: '80px', transform: 'rotate(270deg)' }}
              title="Volume"
            />
          </div>

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
              style={{ height: '100%', width: '0%', backgroundColor: '#162557' }}
            />
          </div>

          {showInfo && (
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
              {vid.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{vid.filename}</h3>}
              {vid.description && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{vid.description}</p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Thanks screen */}
      <div
        style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: 'black',
          scrollSnapAlign: 'start',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <h1>Thanks for watching!</h1>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#162557',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          Back to Home
        </button>
      </div>

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
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#333', wordBreak: 'break-all' }}>
              {window.location.href}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
