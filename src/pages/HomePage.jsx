import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveVideo } from '../utils/videoStore';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);

    // Simulate an old-school "upload" effect
    setTimeout(() => {
      const id = saveVideo(url);
      navigate(`/v/${id}`);
    }, 1500);
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
            placeholder="Paste video URL (MP4, WebM...)"
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
          />
          <br />
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

        {/* Fake Progress Bar */}
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

        {/* Instructions */}
        {!loading && (
          <div style={{ marginTop: '2rem', fontSize: '14px', color: '#444' }}>
            <ol style={{ textAlign: 'left', display: 'inline-block' }}>
              <li><strong>Paste a video URL</strong></li>
              <li><strong>Share the generated link</strong></li>
              <li><strong>Watch the video any time</strong></li>
            </ol>
            <p><a href="#" style={{ color: '#00f', textDecoration: 'underline' }}>Need help?</a></p>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', color: '#888', fontSize: '12px' }}>
        © 2025 NutriLink. All rights reserved.
      </div>

      {/* CSS animation keyframes */}
      <style>
        {`
          @keyframes progress {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}
      </style>
    </div>
  );
}
