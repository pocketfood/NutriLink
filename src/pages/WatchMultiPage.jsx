import { useCallback, useEffect, useState, useRef } from 'react';
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
  FaRedo,
  FaStepForward,
} from 'react-icons/fa';
import Hls from 'hls.js';
import WaveSurfer from 'wavesurfer.js';
import MediaLoadingOverlay from '../components/MediaLoadingOverlay';
import { nextMediaLoadState } from '../utils/mediaLoading';
import { isXPostUrl, resolveXVideo } from '../utils/xPost';

function formatClockTime(seconds = 0) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secondsRemainder = safeSeconds % 60;
  return `${minutes}:${`0${secondsRemainder}`.slice(-2)}`;
}

function formatTimeLeft(duration = 0, currentTime = 0) {
  if (!Number.isFinite(duration) || duration <= 0) return '0:00 left';
  return `${formatClockTime(duration - currentTime)} left`;
}

function getTwitterSourceUrl(vid) {
  if (!vid || (vid.type !== 'twitter' && !isXPostUrl(vid.sourceUrl) && !isXPostUrl(vid.url))) return null;
  return vid.sourceUrl || (isXPostUrl(vid.url) ? vid.url : null);
}

function isTwitterItem(vid) {
  return Boolean(getTwitterSourceUrl(vid));
}

function getPlayableMediaUrl(vid) {
  const mediaUrl = vid?.videoUrl || vid?.url;
  return isTwitterItem(vid) && isXPostUrl(mediaUrl) ? null : mediaUrl;
}

function isAudioUrl(value) {
  if (!value) return false;
  return /\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i.test(value);
}

function isVideoUrl(value) {
  if (!value) return false;
  return /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(value);
}

function isAudioItem(vid) {
  if (!vid) return false;
  const mediaUrl = getPlayableMediaUrl(vid);
  if (isAudioUrl(mediaUrl)) return true;
  if (isVideoUrl(mediaUrl)) return false;
  return vid.type === 'audio';
}

export default function WatchMultiPage({ idOverride } = {}) {
  const params = useParams();
  const rawId = idOverride ?? params.id ?? params['*'] ?? '';
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
  const [loopStates, setLoopStates] = useState({});
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [mediaLoadStates, setMediaLoadStates] = useState({});

  const feedRef = useRef(null);
  const videoRefs = useRef([]);
  const itemRefs = useRef([]);
  const elasticShellRefs = useRef([]);
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
  const elasticFrameRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const scrollIdleTimerRef = useRef(null);
  const twitterRefreshAttemptedRefs = useRef({});

  const applyResolvedTwitterVideo = useCallback((index, resolved) => {
    setVideoData((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const currentDescription = item.userDescription ?? item.description ?? '';
        const userDescription =
          currentDescription && currentDescription !== resolved.description ? currentDescription : '';

        return {
          ...item,
          type: 'twitter',
          source: resolved.source,
          sourceUrl: resolved.sourceUrl || item.sourceUrl,
          tweetId: resolved.tweetId,
          url: resolved.videoUrl,
          videoUrl: resolved.videoUrl,
          poster: resolved.poster,
          width: resolved.width,
          height: resolved.height,
          durationMs: resolved.durationMs,
          username: resolved.username,
          name: resolved.name,
          profileImage: resolved.profileImage,
          description: userDescription,
          userDescription,
          sourceDescription: resolved.description || item.sourceDescription || '',
          tweetText: resolved.description || item.tweetText || '',
          possiblySensitive: resolved.possiblySensitive,
        };
      })
    );
  }, []);

  useEffect(() => {
    async function fetchAllVideos() {
      if (!rawId) {
        setVideoData([]);
        setError('No videos specified.');
        return;
      }
      const ids = rawId
        .split(/[,/]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (!ids.length) {
        setVideoData([]);
        setError('No videos specified.');
        return;
      }
      try {
        const blobs = await Promise.all(
          ids.map(async (blobId) => {
            try {
              const res = await fetch(`https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos/${blobId}.json`);
              if (res.status === 404) return [];
              if (!res.ok) throw new Error(`Failed to load ${blobId}`);
              const json = await res.json();
              const list = Array.isArray(json.videos)
                ? json.videos
                : json && json.url
                  ? [json]
                  : [];
              const type = json.type;
              return list.filter(Boolean).map((vid) => ({ ...vid, type: vid.type ?? type }));
            } catch (err) {
              console.warn('Skipping video blob:', blobId, err);
              return [];
            }
          })
        );

        const flatList = blobs.flat().filter((vid) => vid && vid.url);
        twitterRefreshAttemptedRefs.current = {};
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
  }, [rawId]);

  useEffect(() => {
    setPlayingStates({});
    setLoopStates({});
    setMediaLoadStates({});
  }, [videoData]);

  useEffect(() => {
    hlsRefs.current.forEach((hls) => {
      if (hls) hls.destroy();
    });
    hlsRefs.current = [];

    videoRefs.current.forEach((video, index) => {
      const vid = videoData[index];
      const mediaUrl = getPlayableMediaUrl(vid);
      if (!video || !vid || !mediaUrl) {
        if (video) {
          video.removeAttribute('src');
          video.load();
        }
        return;
      }

      const mediaSrc = getMediaProxyUrl(mediaUrl);

      if (isAudioItem(vid)) {
        if (mediaSrc) video.src = mediaSrc;
      } else if (mediaUrl.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            xhrSetup: (xhr, url) => {
              xhr.open('GET', getMediaProxyUrl(url), true);
            },
            fetchSetup: (context, init) => new Request(getMediaProxyUrl(context.url), init),
          });
          hls.loadSource(mediaUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.error(`HLS error on video ${index}:`, data);
              syncMediaLoadState(index, { isLoading: false, label: 'Stream error' });
            }
          });
          hls.on(Hls.Events.MANIFEST_LOADING, () => {
            syncMediaLoadState(index, { isLoading: true, label: 'Starting stream' });
          });
          hls.on(Hls.Events.FRAG_LOADING, () => {
            syncMediaLoadState(index, { isLoading: true, label: 'Buffering' });
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            syncMediaLoadState(index, { isLoading: false, label: 'Streaming' });
          });
          hlsRefs.current[index] = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = mediaUrl;
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
    let cancelled = false;

    videoData.forEach((vid, index) => {
      const sourceUrl = getTwitterSourceUrl(vid);
      if (!sourceUrl || getPlayableMediaUrl(vid)) return;

      syncMediaLoadState(index, { isLoading: true, label: 'Resolving X video' });
      resolveXVideo(sourceUrl)
        .then((resolved) => {
          if (cancelled) return;
          twitterRefreshAttemptedRefs.current[index] = false;
          applyResolvedTwitterVideo(index, resolved);
        })
        .catch(() => {
          if (cancelled) return;
          syncMediaLoadState(index, { isLoading: false, label: 'Load error' });
          setError('An X/Twitter video could not be resolved. The post may be unavailable or may not include a playable video.');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [videoData, applyResolvedTwitterVideo]);

  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (!video) return;
      video.volume = volume;
      video.muted = muted;
    });
  }, [volume, muted, videoData]);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      const vid = videoData[index];
      const defaultLoop = !!vid?.loop;
      const loopValue = loopStates[index];
      video.loop = loopValue ?? defaultLoop;
    });
  }, [loopStates, videoData]);

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
          seekDurationRefs.current[i].textContent = formatTimeLeft(duration, currentTime);
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

  const syncMediaLoadState = (index, options = {}) => {
    const media = videoRefs.current[index];
    setMediaLoadStates((prev) => {
      const current = prev[index] || {
        isLoading: false,
        loadedPercent: null,
        label: 'Loading',
      };
      const next = nextMediaLoadState(media, {
        isLoading: options.isLoading ?? current.isLoading,
        label: options.label ?? current.label,
        loadedPercent: current.loadedPercent,
      });

      if (
        current.isLoading === next.isLoading &&
        current.label === next.label &&
        current.loadedPercent === next.loadedPercent
      ) {
        return prev;
      }

      return { ...prev, [index]: next };
    });
  };

  useEffect(() => {
    const scroller = feedRef.current;
    if (!scroller) return undefined;
    const audioItems = videoData.map((vid) => {
      if (!vid) return false;
      const mediaUrl = getPlayableMediaUrl(vid);
      if (/\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/i.test(mediaUrl || '')) return true;
      if (/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(mediaUrl || '')) return false;
      return vid.type === 'audio';
    });

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const resetElasticity = () => {
      elasticShellRefs.current.forEach((shell) => {
        if (shell) shell.style.transform = 'translate3d(0, 0, 0) scale(1) rotateX(0deg)';
      });
    };

    const updateElasticity = () => {
      elasticFrameRef.current = null;
      const viewportHeight = scroller.clientHeight || window.innerHeight || 1;
      const scrollTop = scroller.scrollTop;
      const velocity = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      elasticShellRefs.current.forEach((shell, index) => {
        if (!shell || audioItems[index]) return;

        const item = itemRefs.current[index];
        if (!item) return;

        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const distanceFromCenter = Math.abs((midpoint - viewportHeight / 2) / viewportHeight);
        const influence = clamp(1 - distanceFromCenter * 1.35, 0, 1);
        const pull = clamp(-velocity * 0.075 * influence, -22, 22);
        const stretch = 1 + clamp(Math.abs(velocity) / viewportHeight, 0, 0.12) * 0.24 * influence;
        const tilt = clamp(-velocity * 0.012 * influence, -1.4, 1.4);

        shell.style.transform = `translate3d(0, ${pull.toFixed(2)}px, 0) scale(${stretch.toFixed(4)}) rotateX(${tilt.toFixed(2)}deg)`;
      });

      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(resetElasticity, 110);
    };

    const scheduleElasticity = () => {
      if (elasticFrameRef.current) return;
      elasticFrameRef.current = requestAnimationFrame(updateElasticity);
    };

    lastScrollTopRef.current = scroller.scrollTop;
    scroller.addEventListener('scroll', scheduleElasticity, { passive: true });
    window.addEventListener('resize', scheduleElasticity);
    scheduleElasticity();

    return () => {
      scroller.removeEventListener('scroll', scheduleElasticity);
      window.removeEventListener('resize', scheduleElasticity);
      if (elasticFrameRef.current) cancelAnimationFrame(elasticFrameRef.current);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      resetElasticity();
    };
  }, [videoData]);

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

      const audioSrc = getMediaProxyUrl(getPlayableMediaUrl(vid));
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

  const handleVideoError = (index) => {
    syncMediaLoadState(index, { isLoading: false, label: 'Load error' });

    const sourceUrl = getTwitterSourceUrl(videoData[index]);
    if (!sourceUrl || twitterRefreshAttemptedRefs.current[index]) return;

    twitterRefreshAttemptedRefs.current[index] = true;
    syncMediaLoadState(index, { isLoading: true, label: 'Refreshing X video' });

    resolveXVideo(sourceUrl)
      .then((resolved) => {
        applyResolvedTwitterVideo(index, resolved);
        setError(null);
      })
      .catch(() => {
        syncMediaLoadState(index, { isLoading: false, label: 'Load error' });
        setError('An X/Twitter video could not be refreshed. The original post may be unavailable or may no longer expose a playable video.');
      });
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

  const findNextAudioIndex = (startIndex) => {
    for (let i = startIndex + 1; i < videoData.length; i += 1) {
      if (isAudioItem(videoData[i])) return i;
    }
    return null;
  };

  const handleEnded = (index) => {
    setPlayingStates((prev) => ({ ...prev, [index]: false }));
    if (playingIndexRef.current === index) {
      playingIndexRef.current = null;
      playingIsAudioRef.current = false;
    }
    if (!autoPlayNext) return;
    const vid = videoData[index];
    const loopValue = loopStates[index] ?? !!vid?.loop;
    if (loopValue) return;
    goToNextItem(index);
  };

  const goToNextItem = (index) => {
    const nextIndex = isAudioItem(videoData[index]) ? findNextAudioIndex(index) : index + 1;
    if (nextIndex === null || nextIndex >= videoData.length) {
      if (feedRef.current) {
        feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
      }
      return;
    }

    const nextItem = itemRefs.current[nextIndex];
    if (nextItem) {
      nextItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const nextVideo = videoRefs.current[nextIndex];
    if (nextVideo) {
      setTimeout(() => {
        nextVideo.play().catch(() => {});
      }, 300);
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

  const toggleLoop = (index) => {
    const vid = videoData[index];
    const defaultLoop = !!vid?.loop;
    const currentLoop = loopStates[index];
    const resolvedLoop = currentLoop ?? defaultLoop;
    const nextLoop = !resolvedLoop;
    setLoopStates((prev) => ({ ...prev, [index]: nextLoop }));
    const video = videoRefs.current[index];
    if (video) video.loop = nextLoop;
  };

  const toggleAutoPlayNext = () => {
    setAutoPlayNext((prev) => !prev);
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

  const mediaElasticShellStyle = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    backgroundColor: 'black',
    transform: 'translate3d(0, 0, 0) scale(1) rotateX(0deg)',
    transformOrigin: 'center center',
    transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: 'transform',
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
    minWidth: '4.8rem',
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
      ref={feedRef}
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
        const isTwitter = isTwitterItem(vid);
        const twitterSourceUrl = getTwitterSourceUrl(vid);
        const mediaUrl = getPlayableMediaUrl(vid);
        const isAudio = isAudioItem(vid);
        const isPlaying = !!playingStates[index];
        const isLooping = loopStates[index] ?? !!vid.loop;
        const downloadUrl = mediaUrl || twitterSourceUrl;
        const twitterPostText = isTwitter
          ? vid.sourceDescription || vid.tweetText || (!vid.userDescription ? vid.description : '')
          : '';
        const displayDescription =
          vid.userDescription ??
          (isTwitter && !vid.sourceDescription && !vid.tweetText ? '' : vid.description || '');
        return (
          <div
            key={index}
            ref={(el) => (itemRefs.current[index] = el)}
            style={{
              position: 'relative',
              height: '100vh',
              width: '100%',
              scrollSnapAlign: 'start',
              overflow: 'hidden',
              backgroundColor: 'black',
              perspective: '900px',
            }}
          >
            <div ref={(el) => (elasticShellRefs.current[index] = el)} style={mediaElasticShellStyle}>
              <>
                <video
                  ref={(el) => (videoRefs.current[index] = el)}
                  muted={muted}
                  controls={false}
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  poster={vid.poster || undefined}
                  onLoadStart={() => syncMediaLoadState(index, {
                    isLoading: !isAudio,
                    label: mediaUrl?.endsWith('.m3u8') ? 'Starting stream' : 'Loading',
                  })}
                  onLoadedMetadata={() => syncMediaLoadState(index, {
                    isLoading: !isAudio,
                    label: mediaUrl?.endsWith('.m3u8') ? 'Buffering stream' : 'Loading',
                  })}
                  onProgress={() => syncMediaLoadState(index)}
                  onCanPlay={() => syncMediaLoadState(index, { isLoading: false, label: 'Ready' })}
                  onPlaying={() => syncMediaLoadState(index, { isLoading: false, label: 'Playing' })}
                  onWaiting={() => syncMediaLoadState(index, { isLoading: !isAudio, label: 'Buffering' })}
                  onStalled={() => syncMediaLoadState(index, { isLoading: !isAudio, label: 'Buffering' })}
                  onSeeking={() => syncMediaLoadState(index, { isLoading: !isAudio, label: 'Seeking' })}
                  onSeeked={() => syncMediaLoadState(index, { isLoading: false, label: 'Ready' })}
                  onError={() => handleVideoError(index)}
                  onPlay={() => handlePlay(index)}
                  onPause={() => handlePause(index)}
                  onEnded={() => handleEnded(index)}
                  onClick={() => {
                    const v = videoRefs.current[index];
                    if (!v) return;
                    if (v.paused) v.play();
                    else v.pause();
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    backgroundColor: 'black',
                    cursor: 'pointer',
                    opacity: isAudio ? 0 : 1,
                    pointerEvents: isAudio ? 'none' : 'auto',
                    transition: 'opacity 0.35s ease',
                  }}
                />
                <MediaLoadingOverlay
                  visible={!isAudio && (Boolean(mediaUrl) || isTwitter) && !!mediaLoadStates[index]?.isLoading}
                  percent={mediaLoadStates[index]?.loadedPercent}
                  label={mediaLoadStates[index]?.label}
                />
              </>
            </div>

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
                {displayDescription && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#ccc' }}>{displayDescription}</p>
                )}
              </div>
            )}

            {showInfo && (
              <div style={infoCardStyle}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{vid.filename || 'Untitled'}</div>
                {displayDescription && (
                  <div style={{ marginTop: '0.35rem', color: '#cfe2ff' }}>{displayDescription}</div>
                )}
                <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#d6e5ff' }}>
                  {isTwitter ? (
                    <>
                      <div style={{ marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600 }}>Source:</span> X/Twitter
                      </div>
                      {twitterPostText && (
                        <div style={{ marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600 }}>Post:</span> {twitterPostText}
                        </div>
                      )}
                      {(vid.username || vid.name) && (
                        <div style={{ marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600 }}>Author:</span>{' '}
                          {vid.username ? `@${vid.username}` : vid.name}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600 }}>Author:</span> {vid.author || 'Anonymous'}
                    </div>
                  )}
                  <div style={{ marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600 }}>{isTwitter ? 'Original post:' : 'Link:'}</span>{' '}
                    {(isTwitter ? twitterSourceUrl : mediaUrl) ? (
                      <a
                        href={isTwitter ? twitterSourceUrl : mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={infoLinkStyle}
                      >
                        {isTwitter ? twitterSourceUrl : mediaUrl}
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
                    onClick={() => toggleLoop(index)}
                    style={{ ...iconButtonStyle, ...(isLooping ? toggleActiveStyle : null) }}
                    title={isLooping ? 'Disable Loop' : 'Enable Loop'}
                  >
                    <FaRedo size={16} color="#fff" />
                  </div>
                  <div
                    onClick={toggleAutoPlayNext}
                    style={{ ...iconButtonStyle, ...(autoPlayNext ? toggleActiveStyle : null) }}
                    title={autoPlayNext ? 'Disable Auto-Play Next' : 'Enable Auto-Play Next'}
                  >
                    <FaStepForward size={16} color="#fff" />
                  </div>
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
                  <div
                    onClick={() => downloadUrl && window.open(downloadUrl, '_blank')}
                    style={iconButtonStyle}
                    title="Download"
                  >
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
                  {isPlaying ? <FaPause size={16} color="#fff" /> : <FaPlay size={16} color="#fff" />}
                </button>
                <>
                  <div ref={(el) => (seekTimeRefs.current[index] = el)} style={seekTimeStyle}>0:00</div>
                  <div onClick={(e) => handleSeek(e, index)} style={progressWrapperStyle}>
                    <div style={progressTrackStyle}>
                      <div ref={(el) => (progressRefs.current[index] = el)} style={progressFillStyle} />
                    </div>
                  </div>
                  <div ref={(el) => (seekDurationRefs.current[index] = el)} style={seekDurationStyle}>0:00</div>
                </>
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
