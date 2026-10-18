import { useEffect, useState } from 'react';

function hue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export default function Cover({ work, size = 'sm' }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!work.cover) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(work.cover);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [work.cover]);

  if (url) return <img className="cover-img" src={url} alt="" />;

  const h = hue(work.title || '');
  return (
    <div
      className={`cover-gen ${size}`}
      style={{ background: `linear-gradient(160deg, hsl(${h} 38% 30%), hsl(${(h + 40) % 360} 45% 16%))` }}
    >
      <span className="cg-title">{work.title}</span>
      <span className="cg-fandom">{work.fandoms?.[0] || ''}</span>
    </div>
  );
}
