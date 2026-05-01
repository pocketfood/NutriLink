import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

const WatchEntryPage = lazy(() => import('./pages/WatchEntryPage'));
const MultiTrackPage = lazy(() => import('./pages/MultiTrackPage'));
const WatchMultiPage = lazy(() => import('./pages/WatchMultiPage'));

function PageLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#050b16',
      color: '#e9f1ff',
      fontFamily: 'Arial, sans-serif',
    }}>
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/v/*" element={<WatchEntryPage />} />
        <Route path="/studio" element={<MultiTrackPage />} />
        <Route path="/studio/:id" element={<MultiTrackPage />} />
        <Route path="/m/:id" element={<WatchMultiPage />} />
      </Routes>
    </Suspense>
  );
}
