
import React, { useEffect, useState, useCallback } from 'react';
import Swal from 'sweetalert2';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Flota from './pages/Flota';
import Mantenimiento from './pages/Mantenimiento';
import Documentos from './pages/Documentos';
import Registros from './pages/Registros';
import Usuarios from './pages/Usuarios';
import Conductor from './pages/Conductor';

import { api, getSession } from './services/api';
import { roleName } from './utils/formatters';

export default function App() {
  const [session, setSession] = useState(getSession);
  const [page, setPage] = useState('inicio');
  const [error, setError] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [records, setRecords] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);

  const role = session?.user?.role;
  const isDriver = role === 'conductor';
  const isAdmin =
    role === 'administrador' ||
    role === 'administrador_general';
  const isGeneralAdmin = role === 'administrador_general';

  // Normaliza respuestas de API que pueden venir como arreglo
  // o dentro de una propiedad de datos.
  const extractArray = useCallback((response, keys = []) => {
    if (Array.isArray(response)) return response;

    for (const key of keys) {
      if (Array.isArray(response?.[key])) {
        return response[key];
      }
    }

    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.rows)) return response.rows;
    if (Array.isArray(response?.results)) return response.results;

    return [];
  }, []);

  // Carga de información principal de la aplicación.
  const load = useCallback(async () => {
    if (!session?.token) return;

    try {
      setError('');

      const vehicleResponse = await api('/vehicles', {}, session);
      const vehicleList = extractArray(vehicleResponse, [
        'vehicles',
        'vehiculos',
      ]);

      setVehicles(vehicleList);

      // El conductor solo necesita sus propios registros.
      if (role === 'conductor') {
        const recordResponse = await api(
          '/driver/records',
          {},
          session
        );

        setRecords(
          extractArray(recordResponse, ['records', 'registros'])
        );

        setMaintenance([]);
        setDocuments([]);
        setUsers([]);
        return;
      }

      const [
        recordResponse,
        maintenanceResponse,
        documentResponse,
      ] = await Promise.all([
        api('/records', {}, session),
        api('/maintenance', {}, session),
        api('/documents', {}, session),
      ]);

      setRecords(
        extractArray(recordResponse, ['records', 'registros'])
      );

      setMaintenance(
        extractArray(maintenanceResponse, [
          'maintenance',
          'rules',
          'especificaciones',
        ])
      );

      setDocuments(
        extractArray(documentResponse, ['documents', 'documentos'])
      );

      if (isAdmin) {
        const userResponse = await api('/users', {}, session);

        setUsers(
          extractArray(userResponse, ['users', 'usuarios'])
        );
      } else {
        setUsers([]);
      }
    } catch (err) {
      const message =
        err?.message || 'Ocurrió un error al cargar los datos.';

      setError(message);

      if (
        /sesión|sesion|token expirado|no autorizado|unauthorized|401/i.test(
          message
        )
      ) {
        localStorage.removeItem('balso_session');

        setSession(null);
        setVehicles([]);
        setRecords([]);
        setMaintenance([]);
        setDocuments([]);
        setUsers([]);
        setPage('inicio');

        await Swal.fire({
          icon: 'warning',
          title: 'Sesión finalizada',
          text: 'Inicia sesión nuevamente.',
        });
      } else {
        await Swal.fire({
          icon: 'error',
          title: 'No se pudieron cargar los datos',
          text: message,
        });
      }
    }
  }, [session, role, isAdmin, extractArray]);

  useEffect(() => {
    load();
  }, [load]);

  // Función API para Mantenimiento.
  // Conserva la sesión autenticada en cada solicitud.
  const maintenanceApi = useCallback(
    (path, options = {}) => api(path, options, session),
    [session]
  );

  // Crear una unidad vehicular.
  const handleCreateVehicle = async (payload) => {
    const response = await api(
      '/vehicles',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      session
    );

    await load();
    return response;
  };

  // Editar una unidad vehicular.
  const handleUpdateVehicle = async (id, payload) => {
    const response = await api(
      `/vehicles/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      session
    );

    await load();
    return response;
  };

  // Activar o desactivar una unidad.
  const handleToggleVehicle = async (id, newActiveStatus) => {
    const response = await api(
      `/vehicles/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          active: newActiveStatus,
        }),
      },
      session
    );

    await load();
    return response;
  };

  // Inicio de sesión.
  function handleLogin(newSession) {
    setSession(newSession);
    setError('');

    setPage(
      newSession?.user?.role === 'conductor'
        ? 'conductor'
        : 'inicio'
    );
  }

  // Cierre de sesión.
  async function logout() {
    const result = await Swal.fire({
      icon: 'question',
      title: '¿Cerrar sesión?',
      text: 'Tendrás que volver a ingresar al sistema.',
      showCancelButton: true,
      confirmButtonText: 'Cerrar sesión',
      cancelButtonText: 'Continuar',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    localStorage.removeItem('balso_session');

    setSession(null);
    setVehicles([]);
    setRecords([]);
    setMaintenance([]);
    setDocuments([]);
    setUsers([]);
    setPage('inicio');
    setError('');
  }

  // Si no hay sesión, mostrar el login.
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  // Menú según el rol.
  const nav = isDriver
    ? []
    : [
        ['inicio', 'Resumen'],
        ['flota', 'Flota'],
        ['mantenimiento', 'Mantenimiento'],
        ['documentos', 'Documentos'],
        ['registros', 'Registros'],
        ...(isAdmin
          ? [['usuarios', 'Conductores y usuarios']]
          : []),
      ];

  return (
    <div className="app">
      <header>
        <div>
          <strong>
            Corporación Balso <span>Control de Flota</span>
          </strong>
          <small>{roleName[role] || 'Usuario'}</small>
        </div>

        <div className="user-area">
          <span>
            {session.user.name ||
              session.user.full_name ||
              session.user.email}
          </span>

          <button className="outline" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {!isDriver && (
        <nav>
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => {
                setPage(id);
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      <main>
        {error && (
          <div className="alert red-alert">
            {error}
          </div>
        )}

        {isDriver ? (
          <Conductor
            vehicles={vehicles}
            records={records}
            session={session}
            onReload={load}
          />
        ) : (
          <>
            {page === 'inicio' && (
              <Dashboard
                vehicles={vehicles}
                records={records}
              />
            )}

            {page === 'flota' && (
              <Flota
                vehicles={vehicles}
                onCreate={handleCreateVehicle}
                onUpdate={handleUpdateVehicle}
                onToggle={handleToggleVehicle}
              />
            )}

            {page === 'mantenimiento' && (
              <Mantenimiento
                maintenance={maintenance}
                vehicles={vehicles}
                api={maintenanceApi}
              />
            )}

            {page === 'documentos' && (
              <Documentos
                documents={documents}
                vehicles={vehicles}
                session={session}
                onReload={load}
              />
            )}

            {page === 'registros' && (
              <Registros
                records={records}
                users={users}
                vehicles={vehicles}
                session={session}
                onReload={load}
              />
            )}

            {page === 'usuarios' && isAdmin && (
              <Usuarios
                users={users}
                vehicles={vehicles}
                session={session}
                isGeneralAdmin={isGeneralAdmin}
                onReload={load}
              />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-brand">
          <strong>BALSO </strong>
          <span>Control de Flota</span>
        </div>

        <div className="footer-security">
          <span className="footer-dot"></span>
          Sistema con autenticación
        </div>

        <div className="footer-copyright">
          © 2026 Ing. Jozue Ruiz Quispe. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}
