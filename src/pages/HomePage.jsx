import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const [url, setUrl] = useState('');
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);

    const id = Math.random().toString(36).substring(2, 8);
    const urls = url.split(',').map((s) => s.trim()).filter(Boolean);

    let payload;

    if (urls.length === 1) {
      // single video logic
      payload = {
        id,
        url: urls[0],
        filename,
        description,
        volume,
        loop,
      };
    } else {
      // multiple video logic
      const videos = urls.map((u) => ({
        url: u,
        filename,
        description,
      }));

      payload = {
        id,
        videos,
        volume,
        loop,
      };
    }

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid server response');
      }

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (urls.length === 1) {
        navigate(`/v/${id}`);
      } else {
        navigate(`/m/${id}`);
      }
    } catch (err) {
      alert('Error saving video: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#e7ecf3', minHeight: '100vh', padding: '2rem' }}>
      <div style={{
        backgroundColor: '#fff',
        maxWidth: '600px',
        margin: '2rem auto',
        padding: '2rem',
        boxShadow: '0 0 10px rgba(0,0,0,0.1)',
        textAlign: 'center',
        borderRadius: '6px'
      }}>
        <img src="/nutrilink-logo.png" alt="NutriLink Logo" style={{ maxWidth: '200px', marginBottom: '1rem' }} />
        <hr style={{ margin: '1rem 0' }} />

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Paste video URL(s) — separate with commas for multiple"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{
              width: '80%',
              padding: '0.5rem',
              fontSize: '14px',
              marginBottom: '1rem',
              border: '1px solid #ccc',
              borderRadius: '4px'
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
            placeholder="Short video description"
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
              /> Loop Video
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
            {loading ? 'Uploading...' : 'Generate Link'}
          </button>
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

        {!loading && (
          <div style={{ marginTop: '2rem', fontSize: '14px', color: '#444' }}>
            <ol style={{ textAlign: 'left', display: 'inline-block', lineHeight: '1.6' }}>
              <li><strong>Paste a direct video link</strong> (e.g. MP4)</li>
              <li><strong>Use commas to separate multiple links</strong></li>
              <li><strong>Enter title & description</strong></li>
              <li><strong>Adjust volume & loop</strong> (optional)</li>
              <li><strong>Generate a shareable link</strong></li>
            </ol>
            <p><a href="/help" style={{ color: '#00f', textDecoration: 'underline' }}>Need help?</a></p>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>
        © 2025 NutriLink. All rights reserved.
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
