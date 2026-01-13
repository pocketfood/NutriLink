import { useParams } from 'react-router-dom';
import WatchPage from './WatchPage';
import WatchMultiPage from './WatchMultiPage';

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
    return <WatchMultiPage idOverride={ids.join(',')} />;
  }

  if (ids.length === 1) {
    return <WatchPage idOverride={ids[0]} />;
  }

  return <WatchPage />;
}
