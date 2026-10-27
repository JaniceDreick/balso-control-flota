const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('balso_session') || 'null');
  } catch {
    return null;
  }
}

export async function api(path, options = {}, session = getSession()) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({
    message: 'El servidor devolvió una respuesta no válida.'
  }));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Error HTTP ${response.status}`);
  }

  return data;
}

export async function loginRequest(email, password) {
  const response = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'No se pudo iniciar sesión.');
  }
  if (!data.token || !data.user) {
    throw new Error('El servidor no devolvió una sesión válida.');
  }
  return data;
}
