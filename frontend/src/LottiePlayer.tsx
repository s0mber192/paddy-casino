import { useEffect, useRef, useState } from 'react';
import type { AnimationItem } from 'lottie-web';
const cache = new Map<string, Promise<object>>();
export default function LottiePlayer({url, style}: {url: string; style?: React.CSSProperties}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {rootMargin: '100px'});
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !ref.current || !url) return;
    let cancelled = false;
    let animation: AnimationItem | undefined;
    setError(false);
    let promise = cache.get(url);
    if (!promise) {
      promise = fetch(url, {signal: AbortSignal.timeout(15_000)}).then(async r => {if (!r.ok) throw new Error(); return r.json();});
      cache.set(url, promise);
      promise.catch(() => cache.delete(url));
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
    }
    Promise.all([import('lottie-web'), promise]).then(([module, data]) => {
      if (cancelled || !ref.current) return;
      animation = module.default.loadAnimation({container: ref.current, renderer: 'canvas', loop: true, autoplay: true, animationData: structuredClone(data)});
    }).catch(() => {if (!cancelled) setError(true);});
    return () => {cancelled = true; animation?.destroy();};
  }, [url, visible]);
  return <div ref={ref} style={{width: '100%', height: '100%', ...style}}>{error && <span role="img" aria-label="Изображение недоступно">🎁</span>}</div>;
}
