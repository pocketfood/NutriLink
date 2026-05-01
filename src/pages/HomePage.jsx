import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isXPostUrl, resolveXVideo } from '../utils/xPost';

const BLOB_BASE_URL = 'https://ogoyhmlvdwypuizr.public.blob.vercel-storage.com/videos';
const NUTRILINK_HOSTS = new Set(['nutrilink-xi.vercel.app', 'www.nutrilink-xi.vercel.app']);
const NUTRILINK_ID_PATTERN = /^[a-z0-9_-]{2,128}$/i;

function getCurrentOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://nutrilink-xi.vercel.app';
}

function getNutriLinkReference(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = new URL(value, getCurrentOrigin());
    const host = parsed.hostname.toLowerCase();
    const currentHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const isKnownHost = NUTRILINK_HOSTS.has(host) || (currentHost && host === currentHost);

    if (!isKnownHost) return null;

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const route = pathParts[0];
    if (route !== 'v' && route !== 'm') return null;

    const ids = pathParts
      .slice(1)
      .join('/')
      .split(/[,/]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!ids.length || ids.some((id) => !NUTRILINK_ID_PATTERN.test(id))) return null;

    return { route, ids };
  } catch {
    return null;
  }
}

function parseUrlInputs(value) {
  return value
    .split(/\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      if (getNutriLinkReference(trimmed)) return [trimmed];
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    });
}

async function fetchSavedNutriLink(id) {
  const res = await fetch(`${BLOB_BASE_URL}/${encodeURIComponent(id)}.json`);
  if (res.status === 404) throw new Error(`NutriLink ${id} was not found`);
  if (!res.ok) throw new Error(`Could not load NutriLink ${id}`);
  return res.json();
}

function normalizeSavedItems(payload) {
  if (!payload) return [];

  const payloadType = payload.type;
  const rawItems = Array.isArray(payload.videos)
    ? payload.videos
    : payload.url || payload.videoUrl
      ? [payload]
      : [];

  return rawItems
    .filter(Boolean)
    .map((item) => {
      const mediaUrl = item.url || item.videoUrl;
      return {
        ...item,
        url: mediaUrl,
        type: item.type || payloadType || 'video',
      };
    })
    .filter((item) => item.url);
}

function HomePage() {
  const [mode, setMode] = useState('video');
  const [url, setUrl] = useState('');
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const isStudio = mode === 'studio';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'studio') {
      navigate('/studio');
      return;
    }
    if (!url) return;
    setLoading(true);

    const id = Math.random().toString(36).substring(2, 8);
    const urls = parseUrlInputs(url);
    if (!urls.length) {
      setLoading(false);
      return;
    }

    const resolveItem = async (inputUrl) => {
      if (mode !== 'video' || !isXPostUrl(inputUrl)) {
        return { url: inputUrl, filename, description };
      }

      const resolved = await resolveXVideo(inputUrl);
      return {
        url: resolved.videoUrl,
        videoUrl: resolved.videoUrl,
        filename,
        description,
        userDescription: description,
        sourceDescription: resolved.description || '',
        tweetText: resolved.description || '',
        type: 'twitter',
        source: resolved.source,
        sourceUrl: resolved.sourceUrl,
        tweetId: resolved.tweetId,
        poster: resolved.poster,
        width: resolved.width,
        height: resolved.height,
        durationMs: resolved.durationMs,
        username: resolved.username,
        name: resolved.name,
        profileImage: resolved.profileImage,
        possiblySensitive: resolved.possiblySensitive,
      };
    };

    const resolveNutriLinkItems = async (inputUrl) => {
      const reference = getNutriLinkReference(inputUrl);
      if (!reference) return null;

      const payloads = await Promise.all(reference.ids.map((savedId) => fetchSavedNutriLink(savedId)));
      const importedDescription = description.trim();
      const importedFilename = filename.trim();
      const items = payloads
        .flatMap((payload) => normalizeSavedItems(payload))
        .map((item) => {
          const nextDescription =
            importedDescription ||
            item.userDescription ||
            (item.type === 'twitter' && (item.sourceDescription || item.tweetText) ? '' : item.description || '');

          return {
            ...item,
            filename: importedFilename || item.filename || '',
            description: nextDescription,
            userDescription: nextDescription,
          };
        });

      if (!items.length) throw new Error('That NutriLink does not contain any playable videos');
      return items;
    };

    const resolveInput = async (inputUrl) => {
      if (mode === 'video') {
        const importedItems = await resolveNutriLinkItems(inputUrl);
        if (importedItems) return importedItems;
      }

      return [await resolveItem(inputUrl)];
    };

    try {
      const items = (await Promise.all(urls.map((u) => resolveInput(u)))).flat();
      if (!items.length) throw new Error('No playable links were found');

      const isSingle = items.length === 1;
      const payload = isSingle
        ? { id, ...items[0], volume, loop, type: items[0].type || mode }
        : {
            id,
            videos: items,
            volume,
            loop,
            type: mode,
          };

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      navigate(isSingle ? `/v/${id}` : `/m/${id}`);
    } catch (err) {
      alert('Error saving content: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#e7ecf3', minHeight: '100vh', padding: '1rem' }}>
      <div style={{
        backgroundColor: '#fff',
        maxWidth: '600px',
        margin: '0rem auto',
        padding: '1rem',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        textAlign: 'center',
        borderRadius: '6px'
      }}>
      <img
        src="/nutrilink-logo.png"
        alt="NutriLink Logo"
        style={{ maxWidth: '300px', marginBottom: '0rem', marginTop: '-4rem' }}
      />

      <hr style={{ margin: '-3.8rem 0 0.3rem' }} />


        {/* Mode Switch Links */}
        <div style={{ marginBottom: '4rem', fontSize: '14px' }}>
          <span
            onClick={() => setMode('video')}
            style={{
              cursor: 'pointer',
              marginRight: '1rem',
              textDecoration: mode === 'video' ? 'underline' : 'none',
              fontWeight: mode === 'video' ? 'bold' : 'normal',
              color: mode === 'video' ? '#2f62cc' : '#666',
            }}
          >
            Video
          </span>
          <span
            onClick={() => setMode('audio')}
            style={{
              cursor: 'pointer',
              textDecoration: mode === 'audio' ? 'underline' : 'none',
              fontWeight: mode === 'audio' ? 'bold' : 'normal',
              color: mode === 'audio' ? '#2f62cc' : '#666',
            }}
          >
            Audio
          </span>
          <span
            onClick={() => setMode('studio')}
            style={{
              cursor: 'pointer',
              marginLeft: '1rem',
              textDecoration: mode === 'studio' ? 'underline' : 'none',
              fontWeight: mode === 'studio' ? 'bold' : 'normal',
              color: mode === 'studio' ? '#2f62cc' : '#666',
            }}
          >
            Studio
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          {isStudio ? (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#4a4a4a', marginBottom: '1rem' }}>
                Build a multi-track audio session from multiple links with DAW-style controls.
              </p>
              <button
                type="button"
                onClick={() => navigate('/studio')}
                style={{
                  padding: '0.5rem 1.5rem',
                  fontSize: '14px',
                  backgroundColor: '#2f62cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Open Multi-Track Studio
              </button>
            </div>
          ) : (
            <>
          <textarea
            placeholder={mode === 'audio'
              ? 'Paste audio URL(s). Use one per line or separate with commas.'
              : 'Paste video, X post, or NutriLink URL(s). Use one per line or separate with commas.'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            rows={4}
            spellCheck={false}
            style={{
              width: '80%',
              padding: '0.5rem',
              fontSize: '14px',
              marginBottom: '1rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              lineHeight: 1.35,
              resize: 'vertical'
            }}
          /><br />

          <input
            type="text"
            placeholder="Enter title"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            style={{
              width: '80%',
              padding: '0.5rem',
              fontSize: '14px',
              marginBottom: '1rem',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          /><br />

          <textarea
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{
              width: '80%',
              padding: '0.5rem',
              fontSize: '14px',
              marginBottom: '1rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              resize: 'none'
            }}
          /><br />

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '14px', marginRight: '0.5rem' }}>Volume:</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ width: '50%' }}
            />
            <span style={{ marginLeft: '0.5rem' }}>{volume}</span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '14px', marginRight: '0.5rem' }}>
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
              /> Loop {mode === 'audio' ? 'Audio' : 'Video'}
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '14px',
              backgroundColor: loading ? '#999' : '#2f62cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Uploading...' : `Generate ${mode === 'audio' ? 'Audio' : 'Video'} Link`}
          </button>
            </>
          )}
        </form>

        {loading && (
          <div style={{
            marginTop: '1rem',
            height: '10px',
            width: '80%',
            backgroundColor: '#ddd',
            borderRadius: '4px',
            marginInline: 'auto',
            overflow: 'hidden'
          }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(to right, #00c6ff, #0072ff)',
                animation: 'progress 1.5s linear forwards'
              }}
            />
          </div>
        )}

        {!loading && !isStudio && (
          <div style={{ marginTop: '2rem', fontSize: '14px', color: '#444' }}>
            <ol style={{ textAlign: 'left', display: 'inline-block', lineHeight: '1.6' }}>
              <li>
                <strong>{mode === 'audio' ? 'Paste a direct audio link' : 'Paste video links, X post links, or NutriLinks'}</strong>
                {' '}(e.g. {mode === 'audio' ? 'MP3' : 'MP4, x.com/status/..., or /v/abc123'})
              </li>
              <li><strong>Use commas or new lines to separate multiple links</strong></li>
              <li><strong>Enter title & description</strong></li>
              <li><strong>Adjust volume & loop</strong> (optional)</li>
              <li><strong>Generate a shareable link</strong></li>
            </ol>
            <p><a href="/help" style={{ color: '#00f', textDecoration: 'underline' }}>Need help?</a></p>
            <p>
              <a href="/studio" style={{ color: '#2f62cc', textDecoration: 'underline' }}>
                Open Multi-Track Studio
              </a>
            </p>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>
        © 2026 NutriLink. All rights reserved.
      </div>

      <style>{`
        @keyframes progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default HomePage;
