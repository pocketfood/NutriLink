import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FaDownload, FaQrcode, FaVolumeMute, FaVolumeUp, FaInfoCircle, FaPlay, FaPause, FaRedo } from 'react-icons/fa';
import WaveSurfer from 'wavesurfer.js';
import Hls from 'hls.js';

export default function WatchPage() {
  const { id } = useParams();
  const [videoData, setVideoData] = useState(null);
  const [error, setError] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showChrome, setShowChrome] = useState(true);
  const [waveError, setWaveError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const hlsRef = useRef(null);
  const waveHoverRef = useRef(null);
  const waveTimeRef = useRef(null);
  const waveDurationRef = useRef(null);
  const seekTimeRef = useRef(null);
  const seekDurationRef = useRef(null);
  const hideTimerRef = useRef(null);
  const playingRef = useRef(false);

  const isAudioUrl = (value) => {
    if (!value) return false;
    return /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i.test(value);
  };

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

  const isAudioContent = videoData && (videoData.type === 'audio' || isAudioUrl(videoData.url));
  const mediaSrc = videoData?.url ? getMediaProxyUrl(videoData.url) : null;
  const audioSrc = isAudioContent ? mediaSrc : null;

  useEffect(() => {
    async function fetchVideo() {
      try {
        const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
        if (!res.ok) throw new Error('Video not found or expired');
        const data = await res.json();
        setVideoData(data);
        setLoopEnabled(Boolean(data.loop));
        if (typeof data.volume === 'number') setVolume(data.volume);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchVideo();
  }, [id]);

  useEffect(() => {
    if (!videoData || !videoRef.current) return;

    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isAudioContent) {
      if (audioSrc) video.src = audioSrc;
    } else if (videoData.url.endsWith('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => {
            xhr.open('GET', getMediaProxyUrl(url), true);
          },
          fetchSetup: (context, init) => new Request(getMediaProxyUrl(context.url), init),
        });
        hls.loadSource(videoData.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) setError('Error loading video stream');
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoData.url;
      } else {
        setError('HLS is not supported in this browser');
      }
    } else {
      if (mediaSrc) video.src = mediaSrc;
    }

    video.volume = volume;
    video.muted = muted;

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoData, isAudioContent, audioSrc, mediaSrc]);

  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const bar = progressRef.current;
      if (!video) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      if (bar) {
        const percent = duration ? (currentTime / duration) * 100 : 0;
        bar.style.width = `${percent}%`;
      }
      if (seekTimeRef.current) seekTimeRef.current.textContent = formatTime(currentTime);
      if (seekDurationRef.current) seekDurationRef.current.textContent = formatTime(duration);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    if (!isAudioContent || !audioSrc) {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      setWaveError(null);
      return;
    }

    const container = waveformRef.current;
    const media = videoRef.current;
    if (!container || !media) return;

    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    setWaveError(null);
    if (waveTimeRef.current) waveTimeRef.current.textContent = formatTime(0);
    if (waveDurationRef.current) waveDurationRef.current.textContent = formatTime(0);

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

    const unsubscribeReady = wavesurfer.on('ready', () => setWaveError(null));
    const unsubscribeError = wavesurfer.on('error', () => {
      setWaveError('Waveform unavailable for this audio source.');
    });
    const unsubscribeInteraction = wavesurfer.on('interaction', () => {
      wavesurfer.play().catch(() => {});
    });
    const unsubscribeDecode = wavesurfer.on('decode', (duration) => {
      if (waveDurationRef.current) waveDurationRef.current.textContent = formatTime(duration);
    });
    const unsubscribeTimeupdate = wavesurfer.on('timeupdate', (currentTime) => {
      if (waveTimeRef.current) waveTimeRef.current.textContent = formatTime(currentTime);
    });

    wavesurfer.load(audioSrc);
    wavesurferRef.current = wavesurfer;

    return () => {
      unsubscribeReady();
      unsubscribeError();
      unsubscribeInteraction();
      unsubscribeDecode();
      unsubscribeTimeupdate();
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
  }, [isAudioContent, audioSrc]);

  useEffect(() => {
    if (!isAudioContent) return;
    setShowChrome(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, [isAudioContent]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const scheduleHideChrome = () => {
    if (isAudioContent) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playingRef.current) setShowChrome(false);
    }, 1600);
  };

  const revealChrome = () => {
    setShowChrome(true);
    if (playingRef.current && !isAudioContent) scheduleHideChrome();
  };

  const handlePlay = () => {
    playingRef.current = true;
    setIsPlaying(true);
    setShowChrome(true);
    if (!isAudioContent) scheduleHideChrome();
  };

  const handlePause = () => {
    playingRef.current = false;
    setIsPlaying(false);
    setShowChrome(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const toggleLoop = () => {
    setLoopEnabled((prev) => !prev);
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

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleWavePointerMove = (event) => {
    const hover = waveHoverRef.current;
    if (!hover) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    hover.style.width = `${x}px`;
  };

  const handleWavePointerEnter = () => {
    if (waveHoverRef.current) waveHoverRef.current.style.opacity = '1';
  };

  const handleWavePointerLeave = () => {
    if (!waveHoverRef.current) return;
    waveHoverRef.current.style.opacity = '0';
    waveHoverRef.current.style.width = '0px';
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

  const toggleActiveStyle = {
    backgroundColor: 'rgba(77,162,255,0.35)',
    border: '1px solid rgba(127,176,255,0.6)',
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

  const infoCardStyle = {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    width: 'calc(100% - 2rem)',
    maxWidth: '340px',
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
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '2px', color: '#7fb0ff' }}>404</div>
          <div style={{ fontSize: '1.05rem', marginTop: '0.4rem', color: '#cfe2ff' }}>
            This video took a snack break and never came back.
          </div>
          <p style={{ marginTop: '0.8rem', fontSize: '0.95rem', color: '#e9f1ff' }}>{error}</p>
          <Link
            to="/"
            style={{
              display: 'inline-block',
              marginTop: '1.1rem',
              backgroundColor: '#1f4ea8',
              color: '#fff',
              padding: '0.6rem 1.2rem',
              borderRadius: '999px',
              textDecoration: 'none',
              fontSize: '0.95rem',
            }}
          >
            Back home
          </Link>
        </div>
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

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', backgroundColor: 'black' }}
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
      <video
        ref={videoRef}
        autoPlay
        controls={false}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        onPlay={handlePlay}
        onPause={handlePause}
        onClick={() => {
          const video = videoRef.current;
          if (video) {
            video.paused ? video.play() : video.pause();
          }
        }}
        style={{
          width: '100%',
          height: '100vh',
          objectFit: 'contain',
          cursor: 'pointer',
          opacity: isAudioContent ? 0 : 1,
          pointerEvents: isAudioContent ? 'none' : 'auto',
          transition: 'opacity 0.35s ease',
        }}
      />

      {isAudioContent && (
        <div style={audioWaveWrapStyle}>
          <div
            style={audioWaveStyle}
            onPointerMove={handleWavePointerMove}
            onPointerEnter={handleWavePointerEnter}
            onPointerLeave={handleWavePointerLeave}
          >
            <div ref={waveformRef} style={audioWaveCanvasStyle} />
            <div ref={waveHoverRef} style={audioWaveHoverStyle} />
            <div ref={waveTimeRef} style={audioWaveTimeStyle}>0:00</div>
            <div ref={waveDurationRef} style={audioWaveDurationStyle}>0:00</div>
            {waveError && <div style={audioWaveMessageStyle}>{waveError}</div>}
          </div>
        </div>
      )}

      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '0.1rem',
          left: '0.11rem',
          zIndex: 10,
          opacity: showChrome ? 1 : 0,
          pointerEvents: showChrome ? 'auto' : 'none',
          transition: 'opacity 0.35s ease',
        }}
      >
        <img
          src="/nutrilink-logo.png"
          alt="NutriLink"
          style={{ height: '150px', opacity: 0.95, pointerEvents: 'auto' }}
        />
      </Link>

      {showInfo && (
        <div
          style={infoCardStyle}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{videoData.filename || 'Untitled'}</div>
          {videoData.description && (
            <div style={{ marginTop: '0.35rem', color: '#cfe2ff' }}>{videoData.description}</div>
          )}
          <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#d6e5ff' }}>
            <div style={{ marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 600 }}>Author:</span> {videoData.author || 'Anonymous'}
            </div>
            <div style={{ marginBottom: '0.35rem' }}>
              <span style={{ fontWeight: 600 }}>Link:</span>{' '}
              {videoData.url ? (
                <a href={videoData.url} target="_blank" rel="noreferrer" style={infoLinkStyle}>
                  {videoData.url}
                </a>
              ) : (
                'Unavailable'
              )}
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>Loop:</span> {videoData.loop ? 'Yes' : 'No'}
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
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={volumeSliderStyle}
              aria-label="Volume"
            />
          </div>
          <div style={controlsGroupStyle}>
            <div
              onClick={toggleLoop}
              style={{ ...iconButtonStyle, ...(loopEnabled ? toggleActiveStyle : null) }}
              title={loopEnabled ? 'Disable Loop' : 'Enable Loop'}
            >
              <FaRedo size={16} color="#fff" />
            </div>
            <div
              onClick={() => {
                setShowInfo((prev) => !prev);
                revealChrome();
              }}
              style={iconButtonStyle}
              title="Info"
            >
              <FaInfoCircle size={18} />
            </div>
            <div onClick={() => setShowQR(true)} style={iconButtonStyle} title="Share">
              <FaQrcode size={18} />
            </div>
            <div onClick={() => window.open(videoData.url, '_blank')} style={iconButtonStyle} title="Download">
              <FaDownload size={18} />
            </div>
          </div>
        </div>
        <div style={seekRowStyle}>
          <button
            type="button"
            onClick={togglePlayback}
            style={seekButtonStyle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <FaPause size={16} color="#fff" /> : <FaPlay size={16} color="#fff" />}
          </button>
          <div ref={seekTimeRef} style={seekTimeStyle}>0:00</div>
          <div onClick={handleSeek} style={progressWrapperStyle}>
            <div style={progressTrackStyle}>
              <div ref={progressRef} style={progressFillStyle} />
            </div>
          </div>
          <div ref={seekDurationRef} style={seekDurationStyle}>0:00</div>
        </div>
      </div>

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
        {videoData.filename && <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{videoData.filename}</h3>}
        {videoData.description && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{videoData.description}</p>
        )}
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
