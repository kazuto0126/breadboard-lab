import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, bootstrapEditor } from './app/App';
import './app/styles.css';

bootstrapEditor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
