import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserGate } from './app/BrowserGate';
import { App } from './app/App';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Fatal: #root element not found in DOM.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserGate>
      <App />
    </BrowserGate>
  </React.StrictMode>
);
