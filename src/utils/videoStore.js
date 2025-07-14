const STORAGE_KEY = 'nutrilink_videos';

function loadMap() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? new Map(JSON.parse(raw)) : new Map();
}

function saveMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
}

export function saveVideo({ url, filename, description }) {
  const map = loadMap();
  const id = Math.random().toString(36).substr(2, 8);
  map.set(id, { url, filename, description });
  saveMap(map);
  return id;
}

export function getVideo(id) {
  const map = loadMap();
  return map.get(id); // returns object: { url, filename, description }
}
