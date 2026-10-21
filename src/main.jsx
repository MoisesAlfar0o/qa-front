import React from 'react';
import { createRoot } from 'react-dom/client';
import { Planner } from './planner.jsx';
import { App } from './ui.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {window.location.pathname === '/planner' ? <Planner /> : <App />}
  </React.StrictMode>,
);
