import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import './styles.css';

initTheme();

createRoot(document.getElementById('root')).render(<App />);
