import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  FaDownload,
  FaQrcode,
  FaVolumeMute,
  FaVolumeUp,
  FaInfoCircle,
  FaPlay,
  FaPause,
} from 'react-icons/fa';
import Hls from 'hls.js';
import WaveSurfer from 'wavesurfer.js';

export default function WatchMultiPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [videoData, setVideoData] = useState([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const [error, setError] = useState(null);
  const [waveErrors, setWaveErrors] = useState({});
  const [playingStates, setPlayingStates] = useState({});

  const videoRefs = useRef([]);
  const progressRefs = useRef([]);
  const waveformRefs = useRef([]);
  const wavesurferRefs = useRef([]);
  const hlsRefs = useRef([]);
  const waveHoverRefs = useRef([]);
  const waveTimeRefs = useRef([]);
  const waveDurationRefs = useRef([]);
  const seekTimeRefs = useRef([]);
  const seekDurationRefs = useRef([]);
  const hideTimerRef = useRef(null);
  const playingIndexRef = useRef(null);
  const playingIsAudioRef = useRef(false);

  useEffect(() => {
    async function fetchAllVideos() {
      const ids = id.split(',').map((value) => value.trim()).filter(Boolean);
      try {
        const blobs = await Promise.all(
          ids.map(async (blobId) => {
            try {
              const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${blobId}.json`);
              if (res.status === 404) return [];
              if (!res.ok) throw new Error(`Failed to load ${blobId}`);
              const json = await res.json();
              const list = Array.isArray(json.videos) ? json.videos : [];
              const type = json.type;
              return list.filter(Boolean).map((vid) => ({ ...vid, type }));
            } catch (err) {
              console.warn('Skipping video blob:', blobId, err);
              return [];
            }
          })
        );

        const flatList = blobs.flat().filter((vid) => vid && vid.url);
        setVideoData(flatList);

        if (flatList.length > 0) {
          const first = flatList[0];
          setVolume(typeof first.volume === 'number' ? first.volume : 1);
          setError(null);
        } else {
          setError(ids.length ? 'No videos available.' : 'No videos specified.');
        }
      } catch (err) {
        setError(err.message);
      }
    }

    fetchAllVideos();
  }, [id]);

  useEffect(() => {
    setPlayingStates({});
  }, [videoData]);

  useEffect(() => {
    hlsRefs.current.forEach((hls) => {
      if (hls) hls.destroy();
    });
    hlsRefs.current = [];

    videoRefs.current.forEach((video, index) => {
      const vid = videoData[index];
      if (!video || !vid || !vid.url) return;

      const mediaSrc = getMediaProxyUrl(vid.url);

      if (isAudioItem(vid)) {
        if (mediaSrc) video.src = mediaSrc;
      } else if (vid.url.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            xhrSetup: (xhr, url) => {
              xhr.open('GET', getMediaProxyUrl(url), true);
            },
            fetchSetup: (context, init) => new Request(getMediaProxyUrl(context.url), init),
          });
          hls.loadSource(vid.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.error(`HLS error on video ${index}:`, data);
            }
          });
          hlsRefs.current[index] = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = vid.url;
        } else {
          console.error('HLS not supported on this browser');
        }
      } else {
        if (mediaSrc) video.src = mediaSrc;
      }

      video.loop = !!vid.loop;
    });
    return () => {
      hlsRefs.current.forEach((hls) => {
        if (hls) hls.destroy();
      });
      hlsRefs.current = [];
    };
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
        if (!video) return;
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        if (bar) {
          const percent = duration ? (currentTime / duration) * 100 : 0;
          bar.style.width = `${percent || 0}%`;
        }
        if (seekTimeRefs.current[i]) {
          seekTimeRefs.current[i].textContent = formatTime(currentTime);
        }
        if (seekDurationRefs.current[i]) {
          seekDurationRefs.current[i].textContent = formatTime(duration);
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

  const getMediaProxyUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('/api/proxy?url=')) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (!/^https?:/i.test(url)) return url;
    if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) return url;
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  const formatTime = (seconds = 0) => {
    const minutes = Math.floor(seconds / 60);
    const secondsRemainder = Math.round(seconds) % 60;
    return `${minutes}:${`0${secondsRemainder}`.slice(-2)}`;
  };

  const createWaveformGradients = (container) => {
    const height = container?.clientHeight || 96;
    const canvas = document.createElement('canvas');
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { waveColor: '#7fb0ff', progressColor: '#4da2ff' };
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height * 1.35);
    gradient.addColorStop(0, '#7fb0ff');
    gradient.addColorStop((height * 0.7) / height, '#7fb0ff');
    gradient.addColorStop((height * 0.7 + 1) / height, '#ffffff');
    gradient.addColorStop((height * 0.7 + 2) / height, '#ffffff');
    gradient.addColorStop((height * 0.7 + 3) / height, '#4a6fd6');
    gradient.addColorStop(1, '#4a6fd6');

    const progressGradient = ctx.createLinearGradient(0, 0, 0, height * 1.35);
    progressGradient.addColorStop(0, '#4da2ff');
    progressGradient.addColorStop((height * 0.7) / height, '#2f7fe6');
    progressGradient.addColorStop((height * 0.7 + 1) / height, '#ffffff');
    progressGradient.addColorStop((height * 0.7 + 2) / height, '#ffffff');
    progressGradient.addColorStop((height * 0.7 + 3) / height, '#9bbcff');
    progressGradient.addColorStop(1, '#9bbcff');

    return { waveColor: gradient, progressColor: progressGradient };
  };

  const isAudioUrl = (value) => {
    if (!value) return false;
    return /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i.test(value);
  };

  const isAudioItem = (vid) => {
    if (!vid) return false;
    return vid.type === 'audio' || isAudioUrl(vid.url);
  };

  useEffect(() => {
    wavesurferRefs.current.forEach((wavesurfer) => {
      if (wavesurfer) wavesurfer.destroy();
    });
    wavesurferRefs.current = [];
    setWaveErrors({});
    const cleanups = [];

    videoData.forEach((vid, index) => {
      if (!isAudioItem(vid)) return;
      const container = waveformRefs.current[index];
      const media = videoRefs.current[index];
      if (!container || !media) return;

      if (waveTimeRefs.current[index]) waveTimeRefs.current[index].textContent = formatTime(0);
      if (waveDurationRefs.current[index]) waveDurationRefs.current[index].textContent = formatTime(0);

      const gradients = createWaveformGradients(container);
      const wavesurfer = WaveSurfer.create({
        container,
        height: 96,
        waveColor: gradients.waveColor,
        progressColor: gradients.progressColor,
        cursorColor: 'rgba(255,255,255,0.75)',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        barMinHeight: 2,
        barHeight: 0.9,
        normalize: true,
        interact: true,
        dragToSeek: true,
        backend: 'MediaElement',
        media,
      });

      const unsubscribeReady = wavesurfer.on('ready', () => {
        setWaveErrors((prev) => {
          if (!prev[index]) return prev;
          const next = { ...prev };
          delete next[index];
          return next;
        });
      });
      const unsubscribeError = wavesurfer.on('error', () => {
        setWaveErrors((prev) => ({
          ...prev,
          [index]: 'Waveform unavailable for this audio source.',
        }));
      });
      const unsubscribeInteraction = wavesurfer.on('interaction', () => {
        wavesurfer.play().catch(() => {});
      });
      const unsubscribeDecode = wavesurfer.on('decode', (duration) => {
        if (waveDurationRefs.current[index]) {
          waveDurationRefs.current[index].textContent = formatTime(duration);
        }
      });
      const unsubscribeTimeupdate = wavesurfer.on('timeupdate', (currentTime) => {
        if (waveTimeRefs.current[index]) {
          waveTimeRefs.current[index].textContent = formatTime(currentTime);
        }
      });
      cleanups.push(() => {
        unsubscribeReady();
        unsubscribeError();
        unsubscribeInteraction();
        unsubscribeDecode();
        unsubscribeTimeupdate();
      });

      const audioSrc = getMediaProxyUrl(vid.url);
      if (audioSrc) wavesurfer.load(audioSrc);
      wavesurferRefs.current[index] = wavesurfer;
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      wavesurferRefs.current.forEach((wavesurfer) => {
        if (wavesurfer) wavesurfer.destroy();
      });
      wavesurferRefs.current = [];
    };
  }, [videoData]);

  const scheduleHideChrome = () => {
    if (playingIsAudioRef.current) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playingIndexRef.current !== null) setShowChrome(false);
    }, 1600);
  };

  const revealChrome = () => {
    setShowChrome(true);
    if (playingIndexRef.current !== null && !playingIsAudioRef.current) scheduleHideChrome();
  };

  const handlePlay = (index) => {
    const isAudio = isAudioItem(videoData[index]);
    playingIndexRef.current = index;
    playingIsAudioRef.current = isAudio;
    setPlayingStates((prev) => ({ ...prev, [index]: true }));
    setShowChrome(true);
    if (isAudio) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    scheduleHideChrome();
  };

  const handlePause = (index) => {
    if (playingIndexRef.current === index) {
      playingIndexRef.current = null;
      playingIsAudioRef.current = false;
    }
    setPlayingStates((prev) => ({ ...prev, [index]: false }));
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

  const handleWavePointerMove = (event, index) => {
    const hover = waveHoverRefs.current[index];
    if (!hover) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    hover.style.width = `${x}px`;
  };

  const handleWavePointerEnter = (index) => {
    if (waveHoverRefs.current[index]) waveHoverRefs.current[index].style.opacity = '1';
  };

  const handleWavePointerLeave = (index) => {
    const hover = waveHoverRefs.current[index];
    if (!hover) return;
    hover.style.opacity = '0';
    hover.style.width = '0px';
  };

  const togglePlayback = (index) => {
    const video = videoRefs.current[index];
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
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
    flex: 1,
    minWidth: 0,
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
    transition: 'width 0.1s linear',
  };

  const seekRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    width: '100%',
  };

  const seekButtonStyle = {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    backgroundColor: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    cursor: 'pointer',
  };

  const seekTimeStyle = {
    minWidth: '3.4rem',
    fontSize: '0.8rem',
    color: '#cfe2ff',
    fontVariantNumeric: 'tabular-nums',
  };

  const seekDurationStyle = {
    minWidth: '3.4rem',
    fontSize: '0.8rem',
    color: '#cfe2ff',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  };

  const audioWaveWrapStyle = {
    position: 'absolute',
    left: '1rem',
    right: '1rem',
    top: '40%',
    transform: 'translateY(-50%)',
    zIndex: 4,
    pointerEvents: 'auto',
  };

  const audioWaveStyle = {
    width: '100%',
    height: '96px',
    borderRadius: '14px',
    border: '1px solid rgba(127,176,255,0.45)',
    background: 'linear-gradient(135deg, rgba(6,16,32,0.75), rgba(9,27,56,0.6))',
    boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
    padding: '0.4rem 0.6rem',
    boxSizing: 'border-box',
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
  };

  const audioWaveCanvasStyle = {
    width: '100%',
    height: '100%',
  };

  const audioWaveHoverStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    width: '0px',
    mixBlendMode: 'overlay',
    background: 'rgba(255,255,255,0.5)',
    opacity: 0,
    transition: 'opacity 0.2s ease',
    pointerEvents: 'none',
    zIndex: 2,
  };

  const audioWaveTimeStyle = {
    position: 'absolute',
    left: '0.4rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '11px',
    background: 'rgba(0,0,0,0.75)',
    padding: '2px',
    color: '#ddd',
    pointerEvents: 'none',
    zIndex: 3,
  };

  const audioWaveDurationStyle = {
    position: 'absolute',
    right: '0.4rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '11px',
    background: 'rgba(0,0,0,0.75)',
    padding: '2px',
    color: '#ddd',
    pointerEvents: 'none',
    zIndex: 3,
  };

  const audioWaveMessageStyle = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: '0.85rem',
    color: '#cfe2ff',
    padding: '0.5rem',
    pointerEvents: 'none',
    zIndex: 4,
  };

  const infoCardStyle = {
    position: 'absolute',
    left: '1rem',
    bottom: 'calc(7.5rem + env(safe-area-inset-bottom))',
    width: 'calc(100% - 2rem)',
    maxWidth: '360px',
    backgroundColor: 'rgba(6,16,32,0.85)',
    color: '#e9f1ff',
    padding: '0.9rem 1rem',
    borderRadius: '12px',
    border: '1px solid rgba(127,176,255,0.35)',
    fontSize: '0.9rem',
    zIndex: 20,
  };

  const infoLinkStyle = {
    color: '#7fb0ff',
    wordBreak: 'break-all',
  };

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at top, #1f4ea8 0%, #0b1a2f 55%, #050b16 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          color: '#e9f1ff',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(6,16,32,0.85)',
            border: '2px dashed #2f66d6',
            borderRadius: '18px',
            padding: '2rem',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '2px', color: '#7fb0ff' }}>404-ish</div>
          <div style={{ fontSize: '1.05rem', marginTop: '0.4rem', color: '#cfe2ff' }}>
            Some clips vanished into the couch cushions.
          </div>
          <p style={{ marginTop: '0.8rem', fontSize: '0.95rem', color: '#e9f1ff' }}>{error}</p>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: '1.1rem',
              backgroundColor: '#1f4ea8',
              color: '#fff',
              padding: '0.6rem 1.2rem',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            Back home
          </button>
        </div>
      </div>
    );
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
      {videoData.map((vid, index) => {
        const isAudio = isAudioItem(vid);
        const isPlaying = !!playingStates[index];
        return (
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
              crossOrigin="anonymous"
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
                opacity: isAudio ? 0 : 1,
                pointerEvents: isAudio ? 'none' : 'auto',
                transition: 'opacity 0.35s ease',
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

            {isAudio && (
              <div style={audioWaveWrapStyle}>
                <div
                  style={audioWaveStyle}
                  onPointerMove={(event) => handleWavePointerMove(event, index)}
                  onPointerEnter={() => handleWavePointerEnter(index)}
                  onPointerLeave={() => handleWavePointerLeave(index)}
                >
                  <div ref={(el) => (waveformRefs.current[index] = el)} style={audioWaveCanvasStyle} />
                  <div ref={(el) => (waveHoverRefs.current[index] = el)} style={audioWaveHoverStyle} />
                  <div ref={(el) => (waveTimeRefs.current[index] = el)} style={audioWaveTimeStyle}>0:00</div>
                  <div ref={(el) => (waveDurationRefs.current[index] = el)} style={audioWaveDurationStyle}>0:00</div>
                  {waveErrors[index] && <div style={audioWaveMessageStyle}>{waveErrors[index]}</div>}
                </div>
              </div>
            )}

            {!showInfo && (
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

            {showInfo && (
              <div style={infoCardStyle}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{vid.filename || 'Untitled'}</div>
                {vid.description && (
                  <div style={{ marginTop: '0.35rem', color: '#cfe2ff' }}>{vid.description}</div>
                )}
                <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#d6e5ff' }}>
                  <div style={{ marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600 }}>Author:</span> {vid.author || 'Anonymous'}
                  </div>
                  <div style={{ marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600 }}>Link:</span>{' '}
                    {vid.url ? (
                      <a href={vid.url} target="_blank" rel="noreferrer" style={infoLinkStyle}>
                        {vid.url}
                      </a>
                    ) : (
                      'Unavailable'
                    )}
                  </div>
                </div>
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
                  <div
                    onClick={() => {
                      setShowInfo((prev) => !prev);
                      revealChrome();
                    }}
                    style={iconButtonStyle}
                    title="Toggle Info"
                  >
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
              <div style={seekRowStyle}>
                <button
                  type="button"
                  onClick={() => togglePlayback(index)}
                  style={seekButtonStyle}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} />}
                </button>
                <div ref={(el) => (seekTimeRefs.current[index] = el)} style={seekTimeStyle}>0:00</div>
                <div onClick={(e) => handleSeek(e, index)} style={progressWrapperStyle}>
                  <div style={progressTrackStyle}>
                    <div ref={(el) => (progressRefs.current[index] = el)} style={progressFillStyle} />
                  </div>
                </div>
                <div ref={(el) => (seekDurationRefs.current[index] = el)} style={seekDurationStyle}>0:00</div>
              </div>
            </div>
          </div>
        );
      })}

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
