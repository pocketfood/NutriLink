import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getVideosFromBlob } from '../utils/videoStore';
import QRCode from 'qrcode.react';

export default function WatchPage() {
  const { id } = useParams();
  const [videos, setVideos] = useState([]);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const ids = id.split(',');
      const allVideos = [];

      for (const singleId of ids) {
        const data = await getVideosFromBlob(singleId.trim());
        if (data && data.url) {
          allVideos.push(data);
        }
      }

      const urlParams = new URLSearchParams(window.location.search);
      setVolume(parseFloat(urlParams.get('vol') || 1));
      setLoop(urlParams.get('loop') === 'true');
      setVideos(allVideos);
    };

    fetchData();
  }, [id]);

  const handleDownload = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  };

  const handleShare = (url) => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  };

  return (
    <div style={{ backgroundColor: '#fff', height: '100vh', overflowY: 'scroll', scrollSnapType: 'y mandatory' }}>
      {videos.map((video, index) => (
        <div key={index} style={{ 
          height: '100vh', 
          scrollSnapAlign: 'start', 
          position: 'relative', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          flexDirection: 'column'
        }}>
          <video
            src={video.url}
            controls
            loop={loop}
            autoPlay
            style={{ 
              maxHeight: '80vh', 
              width: 'auto', 
              borderRadius: '12px',
              boxShadow: '0 0 10px rgba(0,0,0,0.2)'
            }}
            volume={volume}
          />

          {/* Overlayed NutriLink Logo */}
          <img 
            src="/nutrilink-logo.png" 
            alt="NutriLink Logo" 
            style={{ position: 'absolute', top: '10px', left: '10px', height: '40px', opacity: 0.8 }} 
          />

          {/* Video Info */}
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <h3 style={{ margin: 0 }}>{video.filename || 'Untitled Video'}</h3>
            <p style={{ maxWidth: '80%', margin: '0.5rem auto', color: '#555' }}>{video.description}</p>

            {/* Action Buttons */}
            <div style={{ marginTop: '1rem' }}>
              <button 
                onClick={() => handleDownload(video.url)} 
                style={{ marginRight: '10px' }}
              >
                ⬇ Download
              </button>
              <button onClick={() => handleShare(video.url)}>🔗 Share</button>
            </div>

            {/* QR Code */}
            <div style={{ marginTop: '1rem' }}>
              <QRCode value={window.location.href} size={100} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
