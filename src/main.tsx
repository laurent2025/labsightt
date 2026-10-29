import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './context/ThemeContext';
import { LabStoreProvider } from './store/labStore';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LabStoreProvider>
        <App />
      </LabStoreProvider>
    </ThemeProvider>
  </StrictMode>,
);
