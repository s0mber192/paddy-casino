import { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';

interface Props {
  url: string;
  style?: React.CSSProperties;
}

// Глобальный кэш, чтобы не скачивать один и тот же JSON дважды
const animationCache = new Map<string, any>();

export default function LottiePlayer({ url, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);

  // 1. Проверяем, виден ли элемент на экране
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '200px' } // Начинаем грузить чуть раньше, чем он появится
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 2. Загружаем и рендерим
  useEffect(() => {
    let isMounted = true;
    if (!url || !isVisible || !containerRef.current) return;

    // Очищаем предыдущую
    if (animationRef.current) {
      animationRef.current.destroy();
      animationRef.current = null;
    }

    const loadAnim = async () => {
      try {
        let animationData = animationCache.get(url);
        
        if (!animationData) {
          const res = await fetch(url, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
          });
          if (!res.ok) throw new Error('Fetch error');
          animationData = await res.json();
          animationCache.set(url, animationData);
        }

        if (!isMounted || !containerRef.current) return;

        animationRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'canvas',
          loop: true,
          autoplay: true,
          animationData: JSON.parse(JSON.stringify(animationData)),
          rendererSettings: { preserveAspectRatio: 'xMidYMid slice' }
        });
      } catch (e) {
        if (isMounted) setError(true);
      }
    };

    loadAnim();

    return () => {
      isMounted = false;
      if (animationRef.current) {
        animationRef.current.destroy();
        animationRef.current = null;
      }
    };
  }, [url, isVisible]);

  if (error) {
    return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🎁</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      {!isVisible && <div style={{ width: '100%', height: '100%' }} />}
    </div>
  );
}