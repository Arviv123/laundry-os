import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('courier_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401 + log errors to server
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('courier_token');
      window.location.href = '/login';
    }

    // Log error to backend (fire-and-forget)
    const url = err.config?.url || '';
    if (!url.includes('client-errors')) {
      const payload = {
        url,
        method: err.config?.method,
        status: err.response?.status,
        message: err.response?.data?.error || err.message,
        data: err.response?.data,
        timestamp: new Date().toISOString(),
      };
      fetch(`${API_BASE}/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {}); // silent
    }

    return Promise.reject(err);
  },
);

export default api;
