import React from 'react';
import { createRoot } from 'react-dom/client';
import { LabApp } from './lab-app.jsx';
import { PlatformApp } from './platform-app.jsx';
import { App } from './ui.jsx';
import './styles.css';

const { pathname } = window.location;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {pathname === '/planner' ? <PlatformApp /> : pathname.startsWith('/lab') ? <LabApp /> : <App />}
  </React.StrictMode>,
);
