export default function PlaybackGlyph({ playing }) {
  if (playing) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          width: '16px',
          height: '16px',
        }}
      >
        <span style={{ width: '4px', height: '14px', borderRadius: '1px', backgroundColor: '#fff' }} />
        <span style={{ width: '4px', height: '14px', borderRadius: '1px', backgroundColor: '#fff' }} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        marginLeft: '2px',
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderLeft: '12px solid #fff',
      }}
    />
  );
}
