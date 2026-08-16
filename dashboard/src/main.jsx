import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import './styles.css';

initTheme();

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Analytics />
    <SpeedInsights />
  </>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
