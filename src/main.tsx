import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { LabStoreProvider } from './store/labStore';
import microscopeLogo from '../microscope.png';

// Use one source asset for the interface mark and browser tab icon.
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = microscopeLogo;
document.head.appendChild(favicon);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LabStoreProvider>
        <App />
      </LabStoreProvider>
    </ThemeProvider>
  </StrictMode>,
);
