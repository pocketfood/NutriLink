import { useEffect, useRef, useState } from 'react';
import MediaLoadingOverlay from './MediaLoadingOverlay';
import { getXPostId } from '../utils/xPost';

let widgetsPromise = null;

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

export default function XPostEmbed({ url, onReady, onError }) {
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
    container.innerHTML = '';

    loadXWidgets()
      .then((twttr) =>
        twttr.widgets.createTweet(postId, container, {
          align: 'center',
          conversation: 'none',
          dnt: true,
          theme: 'dark',
          width: 550,
        })
      )
      .then((element) => {
        if (cancelled) return;
        setIsLoading(false);
        if (!element) {
          setError('This X post could not be embedded.');
          if (onError) onError();
          return;
        }
        if (onReady) onReady();
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
        setError('Unable to load the X embed.');
        if (onError) onError();
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = '';
    };
  }, [url, onReady, onError]);

  return (
    <div className="x-post-embed-shell">
      <div ref={containerRef} className="x-post-embed-target" />
      <MediaLoadingOverlay visible={isLoading} label="Loading X post" />
      {error && <div className="x-post-embed-error">{error}</div>}
    </div>
  );
}
