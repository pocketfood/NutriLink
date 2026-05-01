import { useCallback, useEffect, useRef, useState } from 'react';
import MediaLoadingOverlay from './MediaLoadingOverlay';
import { getCanonicalXPostUrl, getXPostId } from '../utils/xPost';

let widgetsPromise = null;
const EMBED_TIMEOUT_MS = 9000;
const X_WIDGET_SCRIPT_SOURCES = [
  'https://platform.twitter.com/widgets.js',
  'https://platform.x.com/widgets.js',
];

function getProxyUrl(value) {
  return `/api/proxy?url=${encodeURIComponent(value)}`;
}

function loadXWidgets() {
  if (typeof window === 'undefined') return Promise.reject(new Error('X embeds require a browser.'));
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);

  if (!widgetsPromise) {
    const scriptSources = X_WIDGET_SCRIPT_SOURCES.flatMap((source) => [getProxyUrl(source), source]);

    widgetsPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-nutrilink-x-widgets="true"]');

      window.twttr = window.twttr || {};
      window.twttr._e = window.twttr._e || [];
      window.twttr.ready = window.twttr.ready || ((callback) => window.twttr._e.push(callback));
      window.twttr.ready((twttr) => resolve(twttr));

      if (existingScript) return;

      const appendScript = (index = 0) => {
        if (index >= scriptSources.length) {
          reject(new Error('Unable to load X embed player.'));
          return;
        }

        const script = document.createElement('script');
        script.src = scriptSources[index];
        script.async = true;
        script.charset = 'utf-8';
        script.dataset.nutrilinkXWidgets = 'true';
        script.onerror = () => {
          script.remove();
          appendScript(index + 1);
        };
        document.body.appendChild(script);
      };

      appendScript();
    });
  }

  return widgetsPromise;
}

function createTweetEmbed(twttr, postId, container) {
  return twttr.widgets
    .createTweet(postId, container, {
      align: 'center',
      conversation: 'none',
      dnt: true,
      theme: 'dark',
      width: 550,
    })
    .then((element) => {
      if (!element) throw new Error('X post widget did not render.');
      return { element, type: 'post' };
    });
}

export default function XPostEmbed({ url, onReady, onError, onScrollIntent }) {
  const shellRef = useRef(null);
  const containerRef = useRef(null);
  const touchStartYRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1);

  const fitEmbedToShell = useCallback(() => {
    const shell = shellRef.current;
    const container = containerRef.current;
    const frame = container?.querySelector('iframe');
    if (!shell || !container || !frame) return;

    const shellRect = shell.getBoundingClientRect();
    const frameWidth = frame.offsetWidth || frame.getBoundingClientRect().width;
    const frameHeight = frame.offsetHeight || frame.getBoundingClientRect().height;
    if (!frameWidth || !frameHeight) return;

    frame.setAttribute('scrolling', 'no');
    frame.style.setProperty('overflow', 'hidden', 'important');

    const shellStyles = window.getComputedStyle(shell);
    const horizontalPadding =
      parseFloat(shellStyles.paddingLeft || '0') + parseFloat(shellStyles.paddingRight || '0');
    const verticalPadding =
      parseFloat(shellStyles.paddingTop || '0') + parseFloat(shellStyles.paddingBottom || '0');
    const maxWidth = Math.max(260, shellRect.width - horizontalPadding - 16);
    const maxHeight = Math.max(260, shellRect.height - verticalPadding - 16);
    const nextScale = Math.min(1, maxWidth / frameWidth, maxHeight / frameHeight);
    setScale(Number.isFinite(nextScale) ? Math.max(0.58, nextScale) : 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const postId = getXPostId(url);
    const container = containerRef.current;

    if (!container || !postId) {
      setIsLoading(false);
      setError('This X link is not a valid post URL.');
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError(null);
    setScale(1);
    container.innerHTML = '';

    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setIsLoading(false);
      setError('X embed is blocked or taking too long to load.');
      if (onError) onError();
    }, EMBED_TIMEOUT_MS);

    const clearEmbedTimeout = () => window.clearTimeout(timeout);

    loadXWidgets()
      .then((twttr) => createTweetEmbed(twttr, postId, container))
      .then(({ element }) => {
        if (cancelled) return;
        clearEmbedTimeout();
        setIsLoading(false);
        if (!element) {
          setError('This X post could not be embedded.');
          if (onError) onError();
          return;
        }
        window.requestAnimationFrame(fitEmbedToShell);
        window.setTimeout(fitEmbedToShell, 500);
        if (onReady) onReady();
      })
      .catch(() => {
        if (cancelled) return;
        clearEmbedTimeout();
        setIsLoading(false);
        setError('Unable to load the X video embed.');
        if (onError) onError();
      });

    return () => {
      cancelled = true;
      clearEmbedTimeout();
      if (container) container.innerHTML = '';
    };
  }, [url, onReady, onError, fitEmbedToShell]);

  useEffect(() => {
    window.addEventListener('resize', fitEmbedToShell);
    return () => window.removeEventListener('resize', fitEmbedToShell);
  }, [fitEmbedToShell]);

  const handleWheel = (event) => {
    if (!onScrollIntent || Math.abs(event.deltaY) < 1) return;
    onScrollIntent(event.deltaY);
  };

  const handleTouchStart = (event) => {
    touchStartYRef.current = event.touches?.[0]?.clientY ?? null;
  };

  const handleTouchMove = (event) => {
    if (!onScrollIntent || touchStartYRef.current === null) return;
    const currentY = event.touches?.[0]?.clientY;
    if (typeof currentY !== 'number') return;
    const deltaY = touchStartYRef.current - currentY;
    if (Math.abs(deltaY) < 8) return;
    touchStartYRef.current = currentY;
    onScrollIntent(deltaY);
  };

  return (
    <div
      ref={shellRef}
      className="x-post-embed-shell"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div
        ref={containerRef}
        className="x-post-embed-target x-post-embed-target--post"
        style={{ '--x-post-scale': String(scale) }}
      />
      <MediaLoadingOverlay visible={isLoading} label="Loading X video" />
      {error && (
        <div className="x-post-embed-error">
          <div>{error}</div>
          <a href={getCanonicalXPostUrl(url)} target="_blank" rel="noreferrer">
            Open on X
          </a>
        </div>
      )}
    </div>
  );
}
