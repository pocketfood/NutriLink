import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WatchPage from './pages/WatchPage';
import MultiTrackPage from './pages/MultiTrackPage';
import WatchMultiPage from './pages/WatchMultiPage'; // ← NEW import

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/v/:id" element={<WatchPage />} />
      <Route path="/studio" element={<MultiTrackPage />} />
      <Route path="/m/:id" element={<WatchMultiPage />} /> {/* ← NEW route */}
    </Routes>
  );
}
