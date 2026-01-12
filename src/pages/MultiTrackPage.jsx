import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import Hls from 'hls.js';

const TRACK_COLORS = [
  { wave: 'rgba(127,176,255,0.7)', progress: '#4da2ff' },
  { wave: 'rgba(95,150,255,0.7)', progress: '#3b86ff' },
  { wave: 'rgba(150,196,255,0.7)', progress: '#6aa6ff' },
];

export default function MultiTrackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const multitrackRef = useRef(null);
  const videoRef = useRef(null);
  const videoHlsRef = useRef(null);
  const lastTimeRef = useRef(0);
  const lastPlayingRef = useRef(false);
  const nextIdRef = useRef(0);
  const trackPositionsRef = useRef({});

  const [tracks, setTracks] = useState([]);
  const [trackMix, setTrackMix] = useState({});
  const [urlInput, setUrlInput] = useState('');
  const [zoom, setZoom] = useState(20);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('Anonymous');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoError, setVideoError] = useState(null);
  const [shareUrl, setShareUrl] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const loopEnabledRef = useRef(false);
  const loopArmedRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const playIntentRef = useRef(false);
  const sessionIdRef = useRef(null);

  const getMediaProxyUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('/api/proxy?url=')) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    if (!/^https?:/i.test(url)) return url;
    if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) return url;
    try {
      const hostname = new URL(url).hostname;
      if (
        hostname === 'public.blob.vercel-storage.com' ||
        hostname.endsWith('.public.blob.vercel-storage.com')
      ) {
        return url;
      }
    } catch {
      return url;
    }
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  const parseUrls = (value) =>
    value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const buildTrack = (url, index, overrides = {}) => {
    const palette = TRACK_COLORS[index % TRACK_COLORS.length];
    const trackId = nextIdRef.current++;
    const startPosition = typeof overrides.startPosition === 'number' ? overrides.startPosition : 0;
    trackPositionsRef.current[trackId] = startPosition;
    return {
      id: trackId,
      sourceUrl: url,
      url: getMediaProxyUrl(url),
      startPosition,
      volume: typeof overrides.volume === 'number' ? overrides.volume : 1,
      draggable: true,
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
    if (videoHlsRef.current) {
      videoHlsRef.current.destroy();
      videoHlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    lastTimeRef.current = 0;
    lastPlayingRef.current = false;
    loopArmedRef.current = false;
    wasPlayingRef.current = false;
    playIntentRef.current = false;
    sessionIdRef.current = null;
    trackPositionsRef.current = {};
    setTracks([]);
    setTrackMix({});
    setIsReady(false);
    setIsPlaying(false);
    setTitle('');
    setAuthor('Anonymous');
    setDescription('');
    setVideoUrl('');
    setVideoMuted(true);
    setVideoVolume(1);
    setVideoError(null);
    setShareUrl('');
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

    const arrangedTracks = tracks.map((track) => {
      const startPosition = trackPositionsRef.current[track.id];
      return {
        ...track,
        startPosition: typeof startPosition === 'number' ? startPosition : track.startPosition ?? 0,
      };
    });

    const multitrack = Multitrack.create(arrangedTracks, {
      container: containerRef.current,
      minPxPerSec: zoom,
      rightButtonDrag: false,
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
    const unsubscribeStartPosition = multitrack.on('start-position-change', ({ id, startPosition }) => {
      trackPositionsRef.current[id] = startPosition;
    });

    if (lastTimeRef.current) multitrack.setTime(lastTimeRef.current);
    multitrack.zoom(zoom);
    if (lastPlayingRef.current) {
      multitrack.play();
      setIsPlaying(true);
      const video = videoRef.current;
      if (video && videoUrl.trim()) {
        video.currentTime = multitrack.getCurrentTime();
        video.play().catch(() => {});
      }
    } else {
      setIsPlaying(false);
    }

    return () => {
      unsubscribeCanPlay();
      unsubscribeStartPosition();
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
    const video = videoRef.current;
    if (!video) return;

    if (videoHlsRef.current) {
      videoHlsRef.current.destroy();
      videoHlsRef.current = null;
    }

    const src = videoUrl.trim();
    if (!src) {
      video.removeAttribute('src');
      video.load();
      setVideoError(null);
      return;
    }

    const proxied = getMediaProxyUrl(src);
    setVideoError(null);

    if (proxied.endsWith('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => {
            xhr.open('GET', getMediaProxyUrl(url), true);
          },
          fetchSetup: (context, init) => new Request(getMediaProxyUrl(context.url), init),
        });
        hls.loadSource(proxied);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) setVideoError('Video preview failed to load.');
        });
        videoHlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = proxied;
      } else {
        setVideoError('HLS preview is not supported in this browser.');
      }
    } else {
      video.src = proxied;
    }

    return () => {
      if (videoHlsRef.current) {
        videoHlsRef.current.destroy();
        videoHlsRef.current = null;
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = videoMuted;
    video.volume = videoVolume;
  }, [videoMuted, videoVolume]);

  useEffect(() => {
    const loadSession = async () => {
      if (!id) return;
      sessionIdRef.current = id;
      setIsLoadingSession(true);
      setSaveError(null);
      try {
        const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${id}.json`);
        if (!res.ok) throw new Error('Session not found or expired');
        const data = await res.json();
        const savedTracks = Array.isArray(data.tracks)
          ? data.tracks
          : Array.isArray(data.videos)
            ? data.videos.map((track) => ({ url: track.url }))
            : [];
        if (!savedTracks.length) throw new Error('No tracks found in this session');
        const loadedTitle = typeof data.title === 'string'
          ? data.title
          : typeof data.filename === 'string'
            ? data.filename
            : '';
        const loadedAuthor = typeof data.author === 'string' && data.author.trim()
          ? data.author
          : 'Anonymous';
        const loadedDescription = typeof data.description === 'string' ? data.description : '';
        const loadedVideoUrl = typeof data.videoUrl === 'string' ? data.videoUrl : '';
        nextIdRef.current = 0;
        trackPositionsRef.current = {};
        const nextTracks = savedTracks.map((track, index) =>
          buildTrack(track.url, index, track)
        );
        const nextMix = {};
        savedTracks.forEach((track, index) => {
          nextMix[index] = {
            muted: !!track.muted,
            volume: typeof track.volume === 'number' ? track.volume : 1,
          };
        });
        setTracks(nextTracks);
        setTrackMix(nextMix);
        setTitle(loadedTitle);
        setAuthor(loadedAuthor);
        setDescription(loadedDescription);
        setVideoUrl(loadedVideoUrl);
        if (typeof data.zoom === 'number') setZoom(data.zoom);
        setLoopEnabled(!!data.loopEnabled);
        if (typeof window !== 'undefined') {
          setShareUrl(`${window.location.origin}/v/${id}`);
        }
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoadingSession(false);
      }
    };

    loadSession();
  }, [id]);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const multitrack = multitrackRef.current;
      if (multitrack) {
        const maxDuration = multitrack.maxDuration || 0;
        const currentTime = multitrack.getCurrentTime();
        const isPlayingNow = multitrack.isPlaying();
        const wasPlaying = wasPlayingRef.current;
        const video = videoRef.current;
        const hasPreview = Boolean(videoUrl.trim());

        if (loopEnabledRef.current && maxDuration > 0) {
          const loopLead = 0.06;
          const nearLoopPoint = currentTime >= maxDuration - loopLead;
          const nearEnd = currentTime >= maxDuration - 0.15;

          if (isPlayingNow && nearLoopPoint && !loopArmedRef.current) {
            loopArmedRef.current = true;
            multitrack.setTime(0);
            multitrack.play();
            if (video && hasPreview) {
              video.currentTime = 0;
              video.play().catch(() => {});
            }
            setIsPlaying(true);
          } else if (!isPlayingNow && playIntentRef.current && nearEnd) {
            multitrack.setTime(0);
            if (video && hasPreview) {
              video.currentTime = 0;
              video.play().catch(() => {});
            }
            multitrack.play();
            setIsPlaying(true);
          }

          if (currentTime < 0.05) {
            loopArmedRef.current = false;
          }
        }

        if (hasPreview && video) {
          if (Math.abs(video.currentTime - currentTime) > 0.2) {
            video.currentTime = currentTime;
          }
          if (isPlayingNow && video.paused) {
            video.play().catch(() => {});
          }
          if (!isPlayingNow && !video.paused) {
            video.pause();
          }
        }

        if (wasPlaying && !isPlayingNow && !loopEnabledRef.current) {
          setIsPlaying(false);
          playIntentRef.current = false;
        }

        if (!wasPlaying && isPlayingNow) {
          setIsPlaying(true);
        }

        wasPlayingRef.current = isPlayingNow;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [videoUrl]);

  const togglePlay = () => {
    const multitrack = multitrackRef.current;
    if (!multitrack) return;
    const video = videoRef.current;
    const hasPreview = Boolean(videoUrl.trim());
    if (multitrack.isPlaying()) {
      playIntentRef.current = false;
      multitrack.pause();
      if (video && hasPreview) {
        video.pause();
      }
      setIsPlaying(false);
    } else {
      playIntentRef.current = true;
      multitrack.play();
      if (video && hasPreview) {
        video.currentTime = multitrack.getCurrentTime();
        video.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  };

  const toggleLoop = () => {
    setLoopEnabled((prev) => !prev);
    loopArmedRef.current = false;
  };

  const saveSession = async () => {
    if (!tracks.length) {
      setSaveError('Add at least one track before saving.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const newId = sessionIdRef.current || Math.random().toString(36).substring(2, 8);
      const sessionTitle = title.trim() || 'Untitled Session';
      const sessionAuthor = author.trim() || 'Anonymous';
      const sessionDescription = description.trim();
      const sessionVideoUrl = videoUrl.trim();
      const savedTracks = tracks.map((track, index) => {
        const mix = trackMix[index] || {};
        const startPosition = trackPositionsRef.current[track.id];
        return {
          url: track.sourceUrl || track.url,
          startPosition: typeof startPosition === 'number' ? startPosition : track.startPosition ?? 0,
          volume: typeof mix.volume === 'number'
            ? mix.volume
            : typeof track.volume === 'number'
              ? track.volume
              : 1,
          muted: !!mix.muted,
        };
      });
      const payload = {
        id: newId,
        type: 'studio',
        videoUrl: sessionVideoUrl || undefined,
        tracks: savedTracks,
        videos: savedTracks.map((track) => ({ url: track.url })),
        filename: sessionTitle,
        title: sessionTitle,
        author: sessionAuthor,
        description: sessionDescription,
        loop: loopEnabled,
        zoom,
        loopEnabled,
      };

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save session');
      sessionIdRef.current = newId;
      setTitle(sessionTitle);
      setAuthor(sessionAuthor);
      setDescription(sessionDescription);
      setVideoUrl(sessionVideoUrl);
      if (typeof window !== 'undefined') {
        setShareUrl(`${window.location.origin}/v/${newId}`);
      }
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (err) {
      setSaveError('Failed to copy link.');
    }
  };

  const seekBy = (seconds) => {
    const multitrack = multitrackRef.current;
    if (!multitrack) return;
    const nextTime = Math.max(0, multitrack.getCurrentTime() + seconds);
    multitrack.setTime(nextTime);
    const video = videoRef.current;
    if (video && videoUrl.trim()) {
      video.currentTime = nextTime;
    }
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

  const fieldStyle = {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(127,176,255,0.25)',
    borderRadius: '12px',
    color: '#e9f1ff',
    padding: '0.6rem 0.75rem',
  };

  const videoPreviewWrapStyle = {
    marginTop: '1rem',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(127,176,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.45)',
  };

  const videoPreviewStyle = {
    width: '100%',
    maxHeight: '320px',
    objectFit: 'contain',
    backgroundColor: 'black',
    display: 'block',
  };

  const videoErrorStyle = {
    padding: '0.6rem 0.8rem',
    color: '#ffb4b4',
    fontSize: '0.85rem',
  };

  const videoVolumeSliderStyle = {
    width: '110px',
    accentColor: '#7fb0ff',
  };

  const displayTitle = title.trim() || 'Untitled Session';
  const displayAuthor = author.trim() || 'Anonymous';
  const displayDescription = description.trim();
  const hasVideoPreview = Boolean(videoUrl.trim());

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
          <div style={{ marginTop: '0.5rem', color: '#cfe2ff' }}>
            <div style={{ fontWeight: 600 }}>{displayTitle}</div>
            <div style={{ fontSize: '0.9rem' }}>By {displayAuthor}</div>
            {displayDescription && <div style={{ marginTop: '0.35rem' }}>{displayDescription}</div>}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Session title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Session"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Anonymous"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a short description for this session"
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Video URL (optional)</label>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://...mp4"
              style={fieldStyle}
            />
          </div>
        </div>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
          Add audio URLs (comma or newline separated)
        </label>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://...mp3"
          rows={3}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={addTracks} style={buttonStyle}>
            <FaPlus size={14} color="#fff" /> Add Tracks
          </button>
          <button type="button" onClick={resetTracks} style={buttonStyle}>
            Reset Session
          </button>
          <button
            type="button"
            onClick={saveSession}
            style={{ ...buttonStyle, ...(isSaving ? controlButtonDisabledStyle : null) }}
            aria-disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Session'}
          </button>
          {error && <span style={{ color: '#ffb4b4' }}>{error}</span>}
        </div>
        {shareUrl && (
          <div style={{ marginTop: '0.9rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              Shareable link
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input type="text" readOnly value={shareUrl} style={{ ...fieldStyle, flex: 1 }} />
              <button type="button" onClick={copyShareUrl} style={buttonStyle}>
                Copy
              </button>
            </div>
          </div>
        )}
        {saveError && <div style={{ marginTop: '0.6rem', color: '#ffb4b4' }}>{saveError}</div>}
      </div>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        {hasVideoPreview && (
          <div style={videoPreviewWrapStyle}>
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              muted={videoMuted}
              onClick={togglePlay}
              style={videoPreviewStyle}
            />
            {videoError && <div style={videoErrorStyle}>{videoError}</div>}
          </div>
        )}
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
          {hasVideoPreview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setVideoMuted((prev) => !prev)}
                style={controlButtonStyle}
                title={videoMuted ? 'Unmute Video' : 'Mute Video'}
              >
                {videoMuted ? <FaVolumeMute size={14} color="#fff" /> : <FaVolumeUp size={14} color="#fff" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={videoMuted ? 0 : videoVolume}
                onChange={(e) => {
                  const nextVolume = Number(e.target.value);
                  setVideoVolume(nextVolume);
                  if (videoMuted) setVideoMuted(false);
                }}
                style={videoVolumeSliderStyle}
                aria-label="Video volume"
              />
            </div>
          )}
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
        {isLoadingSession && (
          <div style={{ marginTop: '1rem', color: '#cfe2ff', fontSize: '0.9rem' }}>
            Loading session...
          </div>
        )}
        {!tracks.length && !isLoadingSession && (
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
