import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { loginRequest } from '../services/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const session = await loginRequest(email, password);
      localStorage.setItem('balso_session', JSON.stringify(session));
      onLogin(session);
      setPassword('');
      await Swal.fire({
        icon: 'success',
        title: 'Bienvenido a BALSO',
        text: 'Has iniciado sesión correctamente.',
        timer: 1600,
        showConfirmButton: false
      });
    } catch (error) {
      setPassword('');
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo iniciar sesión',
        text: error.message,
        confirmButtonText: 'Entendido'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">B</div>
        <h1>BALSO</h1>
        <p>Control de Flota</p>
        <h2>Iniciar sesión</h2>
        <label>Correo electrónico
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="primary full" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar al sistema'}</button>
        <small>Acceso solo para usuarios autorizados.</small>
      </form>
    </div>
  );
}
