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
import Hls from 'hls.js';

export default function WatchMultiPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoData, setVideoData] = useState([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showChrome, setShowChrome] = useState(true);
  const [error, setError] = useState(null);

  const videoRefs = useRef([]);
  const progressRefs = useRef([]);
  const hideTimerRef = useRef(null);
  const playingIndexRef = useRef(null);

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
    videoRefs.current.forEach((video, index) => {
      const vid = videoData[index];
      if (!video || !vid || !vid.url) return;

      if (vid.url.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(vid.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.error(`HLS error on video ${index}:`, data);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = vid.url;
        } else {
          console.error('HLS not supported on this browser');
        }
      } else {
        video.src = vid.url;
      }

      video.loop = !!vid.loop;
    });
  }, [videoData]);

  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (!video) return;
      video.volume = volume;
      video.muted = muted;
    });
  }, [volume, muted, videoData]);

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

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const scheduleHideChrome = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playingIndexRef.current !== null) setShowChrome(false);
    }, 1600);
  };

  const revealChrome = () => {
    setShowChrome(true);
    if (playingIndexRef.current !== null) scheduleHideChrome();
  };

  const handlePlay = (index) => {
    playingIndexRef.current = index;
    setShowChrome(true);
    scheduleHideChrome();
  };

  const handlePause = (index) => {
    if (playingIndexRef.current === index) {
      playingIndexRef.current = null;
    }
    setShowChrome(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

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

  const controlsBarStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    padding: '0.75rem 1rem calc(0.9rem + env(safe-area-inset-bottom))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))',
    borderRadius: '16px 16px 0 0',
    boxSizing: 'border-box',
    opacity: showChrome ? 1 : 0,
    pointerEvents: showChrome ? 'auto' : 'none',
    transition: 'opacity 0.35s ease',
    zIndex: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  };

  const controlsRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
    rowGap: '0.5rem',
  };

  const controlsGroupStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const iconButtonStyle = {
    width: '34px',
    height: '34px',
    borderRadius: '999px',
    backgroundColor: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    cursor: 'pointer',
  };

  const volumeSliderStyle = {
    width: 'clamp(72px, 30vw, 120px)',
    accentColor: '#ffffff',
  };

  const progressWrapperStyle = {
    cursor: 'pointer',
    padding: '0.2rem 0',
  };

  const progressTrackStyle = {
    height: '6px',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '999px',
    overflow: 'hidden',
  };

  const progressFillStyle = {
    height: '100%',
    width: '0%',
    backgroundColor: '#ffffff',
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
        width: '100%',
        overflowX: 'hidden',
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        backgroundColor: 'black',
      }}
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
      {videoData.map((vid, index) => (
        <div
          key={index}
          style={{
            position: 'relative',
            height: '100vh',
            width: '100%',
            scrollSnapAlign: 'start',
            overflow: 'hidden',
            backgroundColor: 'black',
          }}
        >
          <video
            ref={(el) => (videoRefs.current[index] = el)}
            muted={muted}
            controls={false}
            playsInline
            preload="auto"
            onPlay={() => handlePlay(index)}
            onPause={() => handlePause(index)}
            onClick={() => {
              const v = videoRefs.current[index];
              if (v.paused) v.play();
              else v.pause();
            }}
            style={{
              width: '100%',
              height: '100vh',
              objectFit: 'contain',
              backgroundColor: 'black',
              cursor: 'pointer',
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
              opacity: showChrome ? 0.95 : 0,
              pointerEvents: showChrome ? 'auto' : 'none',
              transition: 'opacity 0.35s ease',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/')}
          />

          {showInfo && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(6rem + env(safe-area-inset-bottom))',
                left: '1rem',
                color: 'white',
                zIndex: 10,
                width: 'calc(100% - 5rem)',
                opacity: showChrome ? 1 : 0,
                pointerEvents: showChrome ? 'auto' : 'none',
                transition: 'opacity 0.35s ease',
              }}
            >
              {vid.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{vid.filename}</h3>}
              {vid.description && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{vid.description}</p>
              )}
            </div>
          )}

          <div style={controlsBarStyle}>
            <div style={controlsRowStyle}>
              <div style={controlsGroupStyle}>
                <div onClick={toggleMute} style={iconButtonStyle} title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <FaVolumeMute size={18} /> : <FaVolumeUp size={18} />}
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  style={volumeSliderStyle}
                  aria-label="Volume"
                />
              </div>
              <div style={controlsGroupStyle}>
                <div onClick={() => setShowInfo((prev) => !prev)} style={iconButtonStyle} title="Toggle Info">
                  <FaInfoCircle size={18} />
                </div>
                <div onClick={() => setShowQR(true)} style={iconButtonStyle} title="Share">
                  <FaQrcode size={18} />
                </div>
                <div onClick={() => window.open(vid.url, '_blank')} style={iconButtonStyle} title="Download">
                  <FaDownload size={18} />
                </div>
              </div>
            </div>
            <div onClick={(e) => handleSeek(e, index)} style={progressWrapperStyle}>
              <div style={progressTrackStyle}>
                <div ref={(el) => (progressRefs.current[index] = el)} style={progressFillStyle} />
              </div>
            </div>
          </div>
        </div>
      ))}

      <div
        style={{
          height: '100vh',
          width: '100%',
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
            width: '100%',
            height: '100%',
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
