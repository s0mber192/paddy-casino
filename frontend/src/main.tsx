import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from '@telegram-apps/sdk-react';
import App from './App';
import './index.css';

try {
  init();
} catch {
  // Открыто не в Telegram — App покажет понятное сообщение
}
window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready(): void;
        expand(): void;
        HapticFeedback?: {
          impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
          notificationOccurred(type: 'error' | 'success' | 'warning'): void;
        };
      };
    };
  }
}