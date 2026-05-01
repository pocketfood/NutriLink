import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';

const WatchPage = lazy(() => import('./WatchPage'));
const WatchMultiPage = lazy(() => import('./WatchMultiPage'));

function WatchLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'black',
      color: 'white',
    }}>
      Loading video...
    </div>
  );
}

const splitIds = (value) =>
  value
    .split('/')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean);

export default function WatchEntryPage() {
  const params = useParams();
  const rawIds = [params.id, params['*']].filter(Boolean).join('/');
  const ids = splitIds(rawIds);

  if (ids.length > 1) {
    return (
      <Suspense fallback={<WatchLoading />}>
        <WatchMultiPage idOverride={ids.join(',')} />
      </Suspense>
    );
  }

  if (ids.length === 1) {
    return (
      <Suspense fallback={<WatchLoading />}>
        <WatchPage idOverride={ids[0]} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<WatchLoading />}>
      <WatchPage />
    </Suspense>
  );
}
