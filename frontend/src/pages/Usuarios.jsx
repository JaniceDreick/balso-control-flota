import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { api } from '../services/api';
import { roleName } from '../utils/formatters';
import Status from '../components/Status';

const blankUser = { full_name: '', dni: '', email: '', password: '', role: 'conductor', assigned_vehicle_id: '' };

export default function Usuarios({ users, vehicles, session, isGeneralAdmin, onReload }) {
  const [newUser, setNewUser] = useState({ ...blankUser });
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);

  async function createUser(event) {
    event.preventDefault();
    const dni = String(newUser.dni || '').trim();
    const full_name = String(newUser.full_name || '').trim();
    const email = String(newUser.email || '').trim();
    const password = String(newUser.password || '');
    const role = isGeneralAdmin ? newUser.role : 'conductor';

    if (!full_name || !dni || !email || !password) {
      return Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Nombre, DNI, correo y contraseña son obligatorios.' });
    }
    if (!/^\d{8,12}$/.test(dni)) {
      return Swal.fire({ icon: 'warning', title: 'DNI no válido', text: 'El DNI debe tener entre 8 y 12 números.' });
    }
    if (password.length < 10) {
      return Swal.fire({ icon: 'warning', title: 'Contraseña no válida', text: 'La contraseña debe tener al menos 10 caracteres.' });
    }
    if (role === 'conductor' && !newUser.assigned_vehicle_id) {
      return Swal.fire({ icon: 'warning', title: 'Falta asignar unidad', text: 'Selecciona una unidad para el conductor.' });
    }

    setLoading(true);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...newUser, full_name, dni, email, password, role,
          assigned_vehicle_id: role === 'conductor' ? Number(newUser.assigned_vehicle_id) : null
        })
      }, session);
      setNewUser({ ...blankUser });
      await onReload();
      await Swal.fire({ icon: 'success', title: 'Usuario creado', text: role === 'conductor' ? 'Usuario creado y unidad asignada correctamente.' : 'Usuario registrado correctamente.' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo crear el usuario', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(user) {
    setEditingUser({
      id: user.id, full_name: user.full_name || user.name || '',
      dni: user.dni || '', email: user.email || '', password: '',
      role: user.role || 'conductor',
      assigned_vehicle_id: user.assigned_vehicle_id == null ? '' : String(user.assigned_vehicle_id)
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingUser) return;
    const full_name = String(editingUser.full_name || '').trim();
    const dni = String(editingUser.dni || '').trim();
    const email = String(editingUser.email || '').trim();
    if (!full_name || !dni || !email) {
      return Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Completa nombre, DNI y correo electrónico.' });
    }
    if (!/^\d{8,12}$/.test(dni)) {
      return Swal.fire({ icon: 'warning', title: 'DNI no válido', text: 'El DNI debe tener entre 8 y 12 números.' });
    }
    if (editingUser.password && editingUser.password.length < 10) {
      return Swal.fire({ icon: 'warning', title: 'Contraseña no válida', text: 'La contraseña debe tener al menos 10 caracteres.' });
    }
    const role = isGeneralAdmin ? editingUser.role : 'conductor';
    if (role === 'conductor' && !editingUser.assigned_vehicle_id) {
      return Swal.fire({ icon: 'warning', title: 'Falta asignar unidad', text: 'Selecciona una unidad para el conductor.' });
    }

    const payload = {
      full_name, dni, email, role,
      assigned_vehicle_id: role === 'conductor' ? Number(editingUser.assigned_vehicle_id) : null
    };
    if (editingUser.password) payload.password = editingUser.password;

    setLoading(true);
    try {
      await api(`/users/${editingUser.id}`, { method: 'PATCH', body: JSON.stringify(payload) }, session);
      setEditingUser(null);
      await onReload();
      await Swal.fire({ icon: 'success', title: 'Cambios guardados', text: 'Los datos del usuario se actualizaron correctamente.' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo editar', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function toggleUser(user) {
    if (Number(user.id) === Number(session?.user?.id)) {
      return Swal.fire({ icon: 'warning', title: 'Acción no permitida', text: 'No puedes desactivar tu propia cuenta.' });
    }
    const active = user.active === true || user.active === 1 || user.active === '1';
    const result = await Swal.fire({
      icon: 'question',
      title: `${active ? '¿Desactivar' : '¿Activar'} usuario?`,
      text: `${user.full_name || user.name || user.email}`,
      showCancelButton: true,
      confirmButtonText: active ? 'Sí, desactivar' : 'Sí, activar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: active ? '#c0392b' : '#167d45',
      reverseButtons: true
    });
    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) }, session);
      await onReload();
      await Swal.fire({ icon: 'success', title: active ? 'Usuario desactivado' : 'Usuario activado', text: 'El estado de la cuenta se actualizó.' });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo cambiar el estado', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  const visibleUsers = users.filter(user => user.role !== 'administrador_general' || isGeneralAdmin);

  return <>
    <div className="page-heading"><div><h1>Conductores y usuarios</h1><p>Administra cuentas, unidades asignadas y permisos.</p></div></div>
    <div className="two-col">
      <form className="panel" onSubmit={createUser}>
        <h2>Crear usuario</h2>
        <label>Nombre completo
          <input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} required />
        </label>
        <label>DNI
          <input value={newUser.dni} inputMode="numeric" maxLength={12} minLength={8} pattern="[0-9]{8,12}" onChange={e => setNewUser({ ...newUser, dni: e.target.value.replace(/\D/g, '').slice(0, 12) })} required />
        </label>
        <label>Correo electrónico
          <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
        </label>
        <label>Contraseña (mínimo 10 caracteres)
          <input type="password" minLength={10} autoComplete="new-password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
        </label>
        <label>Rol
          <select value={isGeneralAdmin ? newUser.role : 'conductor'} disabled={!isGeneralAdmin} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="conductor">Conductor</option><option value="administrador">Administrador</option>
            {isGeneralAdmin && <option value="administrador_general">Administrador general</option>}
          </select>
        </label>
        {(isGeneralAdmin ? newUser.role : 'conductor') === 'conductor' && <label>Unidad asignada
          <select value={newUser.assigned_vehicle_id} onChange={e => setNewUser({ ...newUser, assigned_vehicle_id: e.target.value })} required>
            <option value="">Selecciona una unidad</option>
            {vehicles.map(v => <option key={v.id} value={String(v.id)}>{v.plate} · {v.brand} {v.model}</option>)}
          </select>
        </label>}
        <button className="primary" disabled={loading}>{loading ? 'Procesando…' : 'Crear usuario'}</button>
        <p className="muted">{isGeneralAdmin ? 'Puedes administrar las cuentas y sus roles.' : 'Puedes registrar conductores y asignarles una unidad.'}</p>
      </form>

      <div className="panel">
        <h2>Usuarios existentes</h2>
        {visibleUsers.map(user => {
          const active = user.active === true || user.active === 1 || user.active === '1';
          const assignedVehicle = vehicles.find(v => String(v.id) === String(user.assigned_vehicle_id));
          return <div className="user-row" key={user.id}>
            <div>
              <b>{user.full_name || user.name || 'Usuario'}</b>
              <p>DNI: {user.dni || '-'}</p><p>{user.email} · {roleName[user.role] || user.role}</p>
              <p>Unidad: {assignedVehicle?.plate || 'Sin unidad asignada'}</p>
              <span className={`user-status ${active ? 'user-status-active' : 'user-status-inactive'}`}>
                <span className="user-status-dot"></span>
                {active ? 'Correcto · Activo' : 'Inactivo'}
              </span>
            </div>
            <div className="record-actions user-actions">
              <button
                type="button"
                className="btn-edit-user"
                disabled={loading || Number(user.id) === Number(session?.user?.id)}
                onClick={() => beginEdit(user)}
              >
                ✏️ Editar datos
              </button>

              <button
                type="button"
                className={active ? 'btn-disable-user' : 'btn-enable-user'}
                disabled={loading || Number(user.id) === Number(session?.user?.id)}
                onClick={() => toggleUser(user)}
              >
                {active ? '⛔ Desactivar' : '✓ Activar'}
              </button>
            </div>
          </div>;
        })}
        {!visibleUsers.length && <p className="muted">No hay usuarios para mostrar.</p>}

        {editingUser && <form className="panel" onSubmit={saveEdit}>
          <h2>Editar datos del usuario</h2>
          <label>Nombre completo
            <input value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} required />
          </label>
          <label>DNI
            <input value={editingUser.dni} inputMode="numeric" maxLength={12} onChange={e => setEditingUser({ ...editingUser, dni: e.target.value.replace(/\D/g, '').slice(0, 12) })} required />
          </label>
          <label>Correo electrónico
            <input type="email" value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} required />
          </label>
          <label>Nueva contraseña (opcional)
            <input type="password" minLength={10} autoComplete="new-password" value={editingUser.password} onChange={e => setEditingUser({ ...editingUser, password: e.target.value })} placeholder="Dejar vacío para conservarla" />
          </label>
          <label>Rol
            <select value={isGeneralAdmin ? editingUser.role : 'conductor'} disabled={!isGeneralAdmin} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>
              <option value="conductor">Conductor</option>
              {isGeneralAdmin && <option value="administrador">Administrador</option>}
              {isGeneralAdmin && <option value="administrador_general">Administrador general</option>}
            </select>
          </label>
          {(isGeneralAdmin ? editingUser.role : 'conductor') === 'conductor' && <label>Unidad asignada
            <select value={editingUser.assigned_vehicle_id} onChange={e => setEditingUser({ ...editingUser, assigned_vehicle_id: e.target.value })} required>
              <option value="">Selecciona una unidad</option>
              {vehicles.map(v => <option key={v.id} value={String(v.id)}>{v.plate} · {v.brand} {v.model}</option>)}
            </select>
          </label>}
          <div className="record-actions">
            <button className="primary" disabled={loading}>{loading ? 'Guardando…' : 'Guardar cambios'}</button>
            <button type="button" className="outline" disabled={loading} onClick={() => setEditingUser(null)}>Cancelar</button>
          </div>
        </form>}
      </div>
    </div>
  </>;
}
