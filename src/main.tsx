import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.VITE_GIT_COMMIT) {
  const meta = document.createElement('meta');
  meta.name = 'x-git-commit';
  meta.content = import.meta.env.VITE_GIT_COMMIT;
  document.head.appendChild(meta);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
