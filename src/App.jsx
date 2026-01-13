import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WatchEntryPage from './pages/WatchEntryPage';
import MultiTrackPage from './pages/MultiTrackPage';
import WatchMultiPage from './pages/WatchMultiPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/v/*" element={<WatchEntryPage />} />
      <Route path="/studio" element={<MultiTrackPage />} />
      <Route path="/studio/:id" element={<MultiTrackPage />} />
      <Route path="/m/:id" element={<WatchMultiPage />} />
    </Routes>
  );
}
