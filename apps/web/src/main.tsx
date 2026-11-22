import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { createAuthClient } from './auth/client';
import { RouterProvider } from './router';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const authClient = createAuthClient();

createRoot(root).render(
  <StrictMode>
    <AuthProvider client={authClient}>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>
  </StrictMode>,
);
