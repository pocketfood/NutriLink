const handleSubmit = async (e) => {
  e.preventDefault();
  if (!url) return;
  setLoading(true);

  const id = Math.random().toString(36).substring(2, 8);
  const links = url.split(',').map(link => link.trim()).filter(Boolean);

  let payload;

  if (links.length === 1) {
    // Single video logic (same as before)
    payload = {
      id,
      url: links[0],
      filename,
      description,
      volume,
      loop,
    };
  } else {
    // Multi-video logic
    const videos = links.map(link => ({
      url: link,
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
    } catch (err) {
      throw new Error('Received invalid response from server');
    }

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    // Redirect to the right page
    if (links.length === 1) {
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
