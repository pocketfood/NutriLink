import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaPlay,
  FaPause,
  FaForward,
  FaBackward,
  FaPlus,
  FaRedo,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import Multitrack from 'wavesurfer-multitrack';

const TRACK_COLORS = [
  { wave: 'rgba(127,176,255,0.7)', progress: '#4da2ff' },
  { wave: 'rgba(95,150,255,0.7)', progress: '#3b86ff' },
  { wave: 'rgba(150,196,255,0.7)', progress: '#6aa6ff' },
];

export default function MultiTrackPage() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const multitrackRef = useRef(null);
  const lastTimeRef = useRef(0);
  const lastPlayingRef = useRef(false);
  const nextIdRef = useRef(0);

  const [tracks, setTracks] = useState([]);
  const [trackMix, setTrackMix] = useState({});
  const [urlInput, setUrlInput] = useState('');
  const [zoom, setZoom] = useState(20);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [error, setError] = useState(null);
  const loopEnabledRef = useRef(false);
  const loopArmedRef = useRef(false);

  const getMediaProxyUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('/api/proxy?url=')) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (!/^https?:/i.test(url)) return url;
    if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) return url;
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  const parseUrls = (value) =>
    value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const buildTrack = (url, index) => {
    const palette = TRACK_COLORS[index % TRACK_COLORS.length];
    return {
      id: nextIdRef.current++,
      sourceUrl: url,
      url: getMediaProxyUrl(url),
      startPosition: 0,
      volume: 1,
      options: {
        waveColor: palette.wave,
        progressColor: palette.progress,
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        height: 72,
      },
    };
  };

  const addTracks = () => {
    const urls = parseUrls(urlInput);
    if (!urls.length) return;
    setError(null);
    setTracks((prev) => {
      const startIndex = prev.length;
      const nextTracks = urls.map((url, idx) => buildTrack(url, startIndex + idx));
      return [...prev, ...nextTracks];
    });
    setTrackMix((prev) => {
      const next = { ...prev };
      const startIndex = tracks.length;
      urls.forEach((_, idx) => {
        next[startIndex + idx] = { muted: false, volume: 1 };
      });
      return next;
    });
    setUrlInput('');
  };

  const resetTracks = () => {
    if (multitrackRef.current) {
      multitrackRef.current.destroy();
      multitrackRef.current = null;
    }
    lastTimeRef.current = 0;
    lastPlayingRef.current = false;
    loopArmedRef.current = false;
    setTracks([]);
    setTrackMix({});
    setIsReady(false);
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    if (multitrackRef.current) {
      lastTimeRef.current = multitrackRef.current.getCurrentTime();
      lastPlayingRef.current = multitrackRef.current.isPlaying();
      multitrackRef.current.destroy();
      multitrackRef.current = null;
    }

    if (!tracks.length) {
      setIsReady(false);
      setIsPlaying(false);
      return;
    }

    const multitrack = Multitrack.create(tracks, {
      container: containerRef.current,
      minPxPerSec: zoom,
      rightButtonDrag: true,
      cursorWidth: 2,
      cursorColor: '#7fb0ff',
      trackBackground: '#0b1324',
      trackBorderColor: 'rgba(127,176,255,0.25)',
    });

    multitrackRef.current = multitrack;
    setIsReady(false);

    const unsubscribeCanPlay = multitrack.on('canplay', () => {
      setIsReady(true);
      tracks.forEach((_, index) => {
        const mix = trackMix[index];
        if (!mix) return;
        multitrack.setTrackVolume(index, mix.muted ? 0 : mix.volume ?? 1);
      });
    });

    if (lastTimeRef.current) multitrack.setTime(lastTimeRef.current);
    multitrack.zoom(zoom);
    if (lastPlayingRef.current) {
      multitrack.play();
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }

    return () => {
      unsubscribeCanPlay();
      multitrack.destroy();
      multitrackRef.current = null;
    };
  }, [tracks]);

  useEffect(() => {
    if (multitrackRef.current) {
      multitrackRef.current.zoom(zoom);
    }
  }, [zoom]);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const multitrack = multitrackRef.current;
      if (multitrack && loopEnabledRef.current && multitrack.isPlaying()) {
        const maxDuration = multitrack.maxDuration || 0;
        if (maxDuration > 0) {
          const currentTime = multitrack.getCurrentTime();
          if (!loopArmedRef.current && currentTime >= maxDuration - 0.05) {
            loopArmedRef.current = true;
            multitrack.setTime(0);
            multitrack.play();
          }
          if (loopArmedRef.current && currentTime < 0.25) {
            loopArmedRef.current = false;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const togglePlay = () => {
    const multitrack = multitrackRef.current;
    if (!multitrack) return;
    if (multitrack.isPlaying()) {
      multitrack.pause();
      setIsPlaying(false);
    } else {
      multitrack.play();
      setIsPlaying(true);
    }
  };

  const toggleLoop = () => {
    setLoopEnabled((prev) => !prev);
    loopArmedRef.current = false;
  };

  const seekBy = (seconds) => {
    const multitrack = multitrackRef.current;
    if (!multitrack) return;
    const nextTime = Math.max(0, multitrack.getCurrentTime() + seconds);
    multitrack.setTime(nextTime);
  };

  const toggleTrackMute = (index) => {
    const current = trackMix[index] || { muted: false, volume: 1 };
    const nextMuted = !current.muted;
    setTrackMix((prev) => ({
      ...prev,
      [index]: { ...current, muted: nextMuted },
    }));
    if (multitrackRef.current) {
      multitrackRef.current.setTrackVolume(index, nextMuted ? 0 : current.volume ?? 1);
    }
  };

  const updateTrackVolume = (index, value) => {
    setTrackMix((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || { muted: false, volume: 1 }), volume: value, muted: false },
    }));
    if (multitrackRef.current) {
      multitrackRef.current.setTrackVolume(index, value);
    }
  };

  const pageStyle = {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #1f4ea8 0%, #0b1a2f 55%, #050b16 100%)',
    color: '#e9f1ff',
    padding: '1.5rem',
  };

  const cardStyle = {
    backgroundColor: 'rgba(6,16,32,0.85)',
    border: '1px solid rgba(127,176,255,0.35)',
    borderRadius: '16px',
    padding: '1rem 1.25rem',
    boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
  };

  const buttonStyle = {
    borderRadius: '999px',
    border: '1px solid rgba(127,176,255,0.45)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    padding: '0.45rem 0.9rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    cursor: 'pointer',
  };

  const controlButtonStyle = {
    width: '36px',
    height: '36px',
    borderRadius: '999px',
    border: '1px solid rgba(127,176,255,0.45)',
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };

  const controlButtonDisabledStyle = {
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  };

  const toggleActiveStyle = {
    backgroundColor: 'rgba(77,162,255,0.35)',
    border: '1px solid rgba(127,176,255,0.6)',
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <img
          src="/nutrilink-logo.png"
          alt="NutriLink"
          style={{ height: '90px', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Multi-Track Studio</h1>
          <p style={{ margin: 0, color: '#cfe2ff' }}>Paste audio links, stack tracks, and mix like a DAW.</p>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
          Add audio URLs (comma or newline separated)
        </label>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://...mp3"
          rows={3}
          style={{
            width: '100%',
            backgroundColor: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(127,176,255,0.25)',
            borderRadius: '12px',
            color: '#e9f1ff',
            padding: '0.75rem',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={addTracks} style={buttonStyle}>
            <FaPlus size={14} color="#fff" /> Add Tracks
          </button>
          <button type="button" onClick={resetTracks} style={buttonStyle}>
            Reset Session
          </button>
          {error && <span style={{ color: '#ffb4b4' }}>{error}</span>}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={togglePlay}
            style={{ ...controlButtonStyle, ...(!isReady ? controlButtonDisabledStyle : null) }}
            aria-disabled={!isReady}
          >
            {isPlaying ? <FaPause size={18} color="#fff" /> : <FaPlay size={18} color="#fff" />}
          </button>
          <button type="button" onClick={() => seekBy(-10)} style={controlButtonStyle}>
            <FaBackward size={14} color="#fff" />
          </button>
          <button type="button" onClick={() => seekBy(10)} style={controlButtonStyle}>
            <FaForward size={14} color="#fff" />
          </button>
          <button
            type="button"
            onClick={toggleLoop}
            style={{ ...controlButtonStyle, ...(loopEnabled ? toggleActiveStyle : null) }}
            title={loopEnabled ? 'Disable Loop' : 'Enable Loop'}
          >
            <FaRedo size={14} color="#fff" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#cfe2ff' }}>Zoom</span>
            <input
              type="range"
              min="10"
              max="100"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ accentColor: '#7fb0ff' }}
            />
            <span style={{ fontSize: '0.8rem', color: '#cfe2ff' }}>{zoom}px/s</span>
          </div>
        </div>
        <div
          ref={containerRef}
          style={{
            marginTop: '1rem',
            minHeight: '240px',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        />
        {!tracks.length && (
          <div style={{ marginTop: '1rem', color: '#cfe2ff', fontSize: '0.9rem' }}>
            Add at least one audio URL to start building your multitrack session.
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Tracks</h2>
        {tracks.length === 0 && <p style={{ color: '#cfe2ff' }}>No tracks yet.</p>}
        {tracks.map((track, index) => {
          const mix = trackMix[index] || { muted: false, volume: 1 };
          return (
            <div
              key={track.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0',
                borderBottom: '1px solid rgba(127,176,255,0.15)',
              }}
            >
              <div style={{ minWidth: '70px', fontWeight: 600 }}>Track {index + 1}</div>
              <div style={{ flex: 1, minWidth: '200px', color: '#cfe2ff', overflow: 'hidden' }}>
                <span
                  style={{
                    display: 'inline-block',
                    maxWidth: '100%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={track.sourceUrl || track.url}
                >
                  {track.sourceUrl || track.url}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleTrackMute(index)}
                style={controlButtonStyle}
                title={mix.muted ? 'Unmute Track' : 'Mute Track'}
              >
                {mix.muted ? <FaVolumeMute size={14} color="#fff" /> : <FaVolumeUp size={14} color="#fff" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={mix.muted ? 0 : mix.volume}
                onChange={(e) => updateTrackVolume(index, Number(e.target.value))}
                style={{ accentColor: '#7fb0ff', width: '120px' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
