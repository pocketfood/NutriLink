import { useEffect, useRef, useState } from 'react';
import MediaLoadingOverlay from './MediaLoadingOverlay';
import { getCanonicalXPostUrl, getXPostId } from '../utils/xPost';

let widgetsPromise = null;
const EMBED_TIMEOUT_MS = 9000;
const WIDGET_RENDER_TIMEOUT_MS = 3500;

function loadXWidgets() {
  if (typeof window === 'undefined') return Promise.reject(new Error('X embeds require a browser.'));
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);

  if (!widgetsPromise) {
    const scriptSources = [
      'https://platform.twitter.com/widgets.js',
      'https://platform.x.com/widgets.js',
    ];

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

function waitForWidgetFrame(container) {
  const existingFrame = container.querySelector('iframe');
  if (existingFrame) return Promise.resolve(existingFrame);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const frame = container.querySelector('iframe');
      if (!frame) return;

      observer.disconnect();
      window.clearTimeout(timer);
      resolve(frame);
    });

    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('X widget did not render a frame.'));
    }, WIDGET_RENDER_TIMEOUT_MS);

    observer.observe(container, { childList: true, subtree: true });
  });
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

function createVideoEmbed(twttr, postId, container, canonicalUrl) {
  if (typeof twttr.widgets.createVideo === 'function') {
    return twttr.widgets
      .createVideo(postId, container, {
        status: 'hidden',
        lang: 'en',
      })
      .then((element) => {
        if (!element) throw new Error('X video widget did not render.');
        return { element, type: 'video' };
      });
  }

  const blockquote = document.createElement('blockquote');
  blockquote.className = 'twitter-video';
  blockquote.dataset.status = 'hidden';
  blockquote.lang = 'en';

  const link = document.createElement('a');
  link.href = canonicalUrl;
  link.textContent = canonicalUrl;
  blockquote.appendChild(link);
  container.appendChild(blockquote);

  return Promise.resolve(twttr.widgets.load(container))
    .then(() => waitForWidgetFrame(container))
    .then((element) => ({ element, type: 'video' }));
}

function createBestXEmbed(twttr, postId, container, canonicalUrl) {
  return createVideoEmbed(twttr, postId, container, canonicalUrl).catch(() => {
    container.innerHTML = '';
    return createTweetEmbed(twttr, postId, container);
  });
}

function stretchVideoWidget(element, container, type) {
  if (type !== 'video') return;

  const frame = element?.tagName === 'IFRAME' ? element : container.querySelector('iframe');
  if (!frame) return;

  frame.setAttribute('width', '100%');
  frame.setAttribute('height', '100%');
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.maxWidth = 'none';
}

export default function XPostEmbed({ url, onReady, onError }) {
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [widgetType, setWidgetType] = useState('video');

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
    setWidgetType('video');
    container.innerHTML = '';

    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setIsLoading(false);
      setError('X embed is blocked or taking too long to load.');
      if (onError) onError();
    }, EMBED_TIMEOUT_MS);

    const clearEmbedTimeout = () => window.clearTimeout(timeout);

    const canonicalUrl = getCanonicalXPostUrl(url);

    loadXWidgets()
      .then((twttr) => createBestXEmbed(twttr, postId, container, canonicalUrl))
      .then(({ element, type }) => {
        if (cancelled) return;
        clearEmbedTimeout();
        setIsLoading(false);
        setWidgetType(type);
        if (!element) {
          setError('This X video could not be embedded.');
          if (onError) onError();
          return;
        }
        stretchVideoWidget(element, container, type);
        window.requestAnimationFrame(() => stretchVideoWidget(element, container, type));
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
  }, [url, onReady, onError]);

  return (
    <div className="x-post-embed-shell">
      <div ref={containerRef} className={`x-post-embed-target x-post-embed-target--${widgetType}`} />
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
