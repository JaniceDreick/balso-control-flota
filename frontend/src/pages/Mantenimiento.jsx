import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './Mantenimiento.css';

const EMPTY_SCHEDULE = {
  vehicle_plate: '',
  maintenance_name: '',
  description: '',
  interval_km: '',
  interval_days: '',
  last_service_km: '',
  last_service_date: '',
  next_service_km: '',
  next_service_date: '',
  alert_record_id: '',
  alert_component: '',
  alert_notes: '',
};

const EMPTY_HISTORY = {
  schedule_id: '',
  vehicle_plate: '',
  maintenance_name: '',
  service_date: new Date().toLocaleDateString('en-CA'),
  service_km: '',
  description: '',
  workshop: '',
  cost: '',
  observations: '',
  next_service_km: '',
  next_service_date: '',
};

function getArray(response, keys = []) {
  if (Array.isArray(response)) return response;

  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
  }

  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.rows)) return response.rows;

  return [];
}

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  return Number(value || 0).toLocaleString('es-PE', {
    style: 'currency',
    currency: 'PEN',
  });
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase();

  if (value === 'red' || value.includes('vencid') || value.includes('rojo')) {
    return { label: 'Vencido', className: 'red' };
  }

  if (
    value === 'yellow' ||
    value.includes('próximo') ||
    value.includes('proximo') ||
    value.includes('amarillo')
  ) {
    return { label: 'Próximo', className: 'yellow' };
  }

  if (value === 'green' || value.includes('verde') || value.includes('vigente')) {
    return { label: 'Al día', className: 'green' };
  }

  return { label: status || 'Sin estado', className: 'gray' };
}

export default function Mantenimiento({
  maintenance = [],
  vehicles: vehicleProp = [],
  api,
}) {
  const [tab, setTab] = useState('programacion');
  const [schedules, setSchedules] = useState([]);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertTracking, setAlertTracking] = useState([]);
  const [alertFilter, setAlertFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const [historyForm, setHistoryForm] = useState(EMPTY_HISTORY);
  const [specPlate, setSpecPlate] = useState('');
  const [webSearchResults, setWebSearchResults] = useState(null);
  const [webSearchLoading, setWebSearchLoading] = useState(false);

  // Acepta la lista de vehículos tanto si llega directamente como si
  // el componente padre la envuelve en data/vehicles.
  const vehicles = useMemo(() => {
    const list = getArray(vehicleProp, ['vehicles', 'vehiculos']);
    return list.filter((vehicle) => {
      if (vehicle.active === undefined || vehicle.active === null) return true;
      return vehicle.active === true || Number(vehicle.active) === 1;
    });
  }, [vehicleProp]);

  const loadData = useCallback(async () => {
    if (typeof api !== 'function') {
      setError('No se recibió la función API desde App.jsx.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const results = await Promise.allSettled([
        api('/maintenance/schedules'),
        api('/maintenance/history'),
        api('/maintenance/alerts'),
        api('/maintenance/alert-tracking'),
      ]);
      const value = (index) => results[index].status === 'fulfilled' ? results[index].value : [];
      setSchedules(getArray(value(0), ['schedules', 'programaciones', 'results']));
      setHistory(getArray(value(1), ['history', 'historial', 'results']));
      setAlerts(getArray(value(2), ['alerts', 'results']));
      setAlertTracking(getArray(value(3), ['tracking', 'history', 'results']));
      if (results[2].status === 'rejected' || results[3].status === 'rejected') {
        console.warn('No se pudieron cargar las alertas o su historial. Verifica las rutas de mantenimiento en server.js.');
      }
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los datos de mantenimiento.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeSchedules = schedules.filter(
    (item) => item.active === undefined || Number(item.active) === 1
  );

  const overdueCount = activeSchedules.filter((item) => {
    const status = String(item.alert_status || '').toLowerCase();
    return status === 'red' || status.includes('vencid') || status.includes('rojo');
  }).length;

  const upcomingCount = activeSchedules.filter((item) => {
    const status = String(item.alert_status || '').toLowerCase();
    return (
      status === 'yellow' ||
      status.includes('próximo') ||
      status.includes('proximo') ||
      status.includes('amarillo')
    );
  }).length;

  const trackedByKey = useMemo(() => {
    const map = new Map();
    alertTracking.forEach((item) => map.set(`${item.record_id}::${String(item.component || '').trim().toLowerCase()}`, item));
    return map;
  }, [alertTracking]);

  const alertRows = alerts.map((alert) => {
    const saved = trackedByKey.get(`${alert.record_id}::${String(alert.component || '').trim().toLowerCase()}`);
    return { ...alert, status: saved?.status || alert.status || 'pendiente', notes: saved?.notes ?? alert.notes ?? '', updated_at: saved?.updated_at || alert.updated_at, updated_by_name: saved?.updated_by_name || alert.updated_by_name };
  });
  const pendingAlerts = alertRows.filter((item) => !['programado', 'resuelta'].includes(String(item.status).toLowerCase()));
  const historyAlertRows = useMemo(() => {
    const map = new Map(alertRows.map((item) => [`${item.record_id}::${String(item.component || '').trim().toLowerCase()}`, item]));
    alertTracking.forEach((saved) => {
      const key = `${saved.record_id}::${String(saved.component || '').trim().toLowerCase()}`;
      const current = map.get(key);
      map.set(key, { ...(current || {}), ...saved, status: saved.status || current?.status || 'pendiente', notes: saved.notes ?? current?.notes ?? '' });
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.updated_at || b.recorded_at || 0) - new Date(a.updated_at || a.recorded_at || 0));
  }, [alertRows, alertTracking]);
  const filteredAlerts = historyAlertRows.filter((item) => [item.vehicle_plate, item.driver_name, item.component, item.message, item.notes, item.status, item.updated_by_name].join(' ').toLowerCase().includes(alertFilter.toLowerCase()));

  const filteredSchedules = activeSchedules.filter((item) => {
    const plate = String(item.vehicle_plate || '').toLowerCase();
    const name = String(item.maintenance_name || '').toLowerCase();
    const query = vehicleFilter.toLowerCase();

    return plate.includes(query) || name.includes(query);
  });

  const filteredHistory = history.filter((item) => {
    const plate = String(item.vehicle_plate || '').toLowerCase();
    const name = String(item.maintenance_name || '').toLowerCase();
    const driver = String(item.registered_by_name || '').toLowerCase();
    const query = historyFilter.toLowerCase();

    return plate.includes(query) || name.includes(query) || driver.includes(query);
  });

  function updateSchedule(field, value) {
    setScheduleForm((current) => ({ ...current, [field]: value }));
  }

  function updateHistory(field, value) {
    setHistoryForm((current) => ({ ...current, [field]: value }));
  }

  function resetScheduleForm() {
    setEditingId(null);
    setScheduleForm(EMPTY_SCHEDULE);
  }

  function selectScheduleForService(schedule) {
    setHistoryForm({
      ...EMPTY_HISTORY,
      schedule_id: String(schedule.id),
      vehicle_plate: schedule.vehicle_plate || '',
      maintenance_name: schedule.maintenance_name || '',
      service_km: schedule.next_service_km || '',
      next_service_km: schedule.next_service_km || '',
      next_service_date: dateOnly(schedule.next_service_date),
      alert_record_id: '', alert_component: '', alert_notes: '',
    });
    setTab('registrar');
    setNotice('');
    setError('');
  }

  function editSchedule(schedule) {
    setEditingId(schedule.id);
    setScheduleForm({
      vehicle_plate: schedule.vehicle_plate || '',
      maintenance_name: schedule.maintenance_name || '',
      description: schedule.description || '',
      interval_km: schedule.interval_km ?? '',
      interval_days: schedule.interval_days ?? '',
      last_service_km: schedule.last_service_km ?? '',
      last_service_date: dateOnly(schedule.last_service_date),
      next_service_km: schedule.next_service_km ?? '',
      next_service_date: dateOnly(schedule.next_service_date),
    });
    setTab('programacion');
    setNotice('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    if (!scheduleForm.vehicle_plate) {
      setError('Selecciona una unidad vehicular.');
      setSaving(false);
      return;
    }

    if (!scheduleForm.maintenance_name.trim()) {
      setError('Escribe el nombre del mantenimiento.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...scheduleForm,
        interval_km: numberOrNull(scheduleForm.interval_km),
        interval_days: numberOrNull(scheduleForm.interval_days),
        last_service_km: numberOrNull(scheduleForm.last_service_km),
        last_service_date: scheduleForm.last_service_date || null,
        next_service_km: numberOrNull(scheduleForm.next_service_km),
        next_service_date: scheduleForm.next_service_date || null,
      };

      if (editingId) {
        await api(`/maintenance/schedules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice('Programación actualizada correctamente.');
      } else {
        await api('/maintenance/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice('Mantenimiento programado correctamente.');
        await Swal.fire({ icon: 'success', title: 'Programación guardada', text: 'El mantenimiento y el estado de la alerta se guardaron correctamente.', confirmButtonText: 'Aceptar' });
      }

      resetScheduleForm();
      await loadData();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la programación.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSchedule(schedule) {
    const confirmation = await Swal.fire({
      icon: 'warning', title: '¿Desactivar programación?',
      text: `Se desactivará ${schedule.maintenance_name} de la unidad ${schedule.vehicle_plate}. El historial no se eliminará.`,
      showCancelButton: true, confirmButtonText: 'Sí, desactivar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c'
    });
    if (!confirmation.isConfirmed) return;

    setError('');
    setNotice('');

    try {
      await api(`/maintenance/schedules/${schedule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      });

      setNotice('Programación desactivada correctamente.');
      await loadData();
    } catch (err) {
      setError(err?.message || 'No se pudo desactivar la programación.');
    }
  }

  async function submitHistory(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    if (!historyForm.vehicle_plate || !historyForm.maintenance_name.trim()) {
      setError('Selecciona una unidad y escribe el nombre del servicio.');
      setSaving(false);
      return;
    }

    if (!historyForm.service_date) {
      setError('Indica la fecha en que se realizó el servicio.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...historyForm,
        schedule_id: numberOrNull(historyForm.schedule_id),
        service_km: numberOrNull(historyForm.service_km),
        cost: numberOrNull(historyForm.cost),
        next_service_km: numberOrNull(historyForm.next_service_km),
        next_service_date: historyForm.next_service_date || null,
      };

      await api('/maintenance/history', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setNotice('Servicio registrado correctamente.');
      await Swal.fire({ icon: 'success', title: 'Servicio registrado', text: 'El historial y los datos de mantenimiento se actualizaron.', confirmButtonText: 'Aceptar' });
      setHistoryForm(EMPTY_HISTORY);
      await loadData();
      setTab('historial');
    } catch (err) {
      setError(err?.message || 'No se pudo registrar el servicio.');
    } finally {
      setSaving(false);
    }
  }

  async function updateAlert(alert, status, notes = alert.notes || '') {
    try {
      await api('/maintenance/alert-tracking', {
        method: 'PATCH',
        body: JSON.stringify({ record_id: alert.record_id, vehicle_plate: alert.vehicle_plate, component: alert.component, status, notes }),
      });
      await loadData();
      await Swal.fire({ icon: 'success', title: 'Alerta actualizada', text: status === 'resuelta' ? 'La alerta se retiró de pendientes y quedó en el historial.' : 'Se guardó el estado de la alerta.', confirmButtonText: 'Aceptar' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: err?.message || 'Verifica la conexión con la API y el estado ENUM de MySQL.' });
    }
  }

  function programAlert(alert) {
    setEditingId(null);
    setScheduleForm({
      ...EMPTY_SCHEDULE,
      vehicle_plate: alert.vehicle_plate || '',
      maintenance_name: alert.component || '',
      description: `${alert.message || alert.title || 'Alerta automática'}
${alert.recommendation || ''}`.trim(),
      last_service_km: alert.current_km ?? '',
      alert_record_id: String(alert.record_id),
      alert_component: alert.component,
      alert_notes: alert.notes || '',
    });
    setTab('programacion');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseVehicleForHistory(plate) {
    const selectedVehicle = vehicles.find(
      (vehicle) => vehicle.plate === plate
    );

    setHistoryForm((current) => ({
      ...current,
      vehicle_plate: plate,
      service_km: selectedVehicle?.current_km ?? current.service_km,
    }));
  }

  async function searchVehicleSpecifications() {
    if (!specPlate) {
      setError('Selecciona una unidad vehicular para buscar sus especificaciones.');
      setWebSearchResults(null);
      return;
    }
    setWebSearchLoading(true);
    setError('');
    setNotice('');
    setWebSearchResults(null);
    try {
      const result = await api(`/maintenance/search-web?plate=${encodeURIComponent(specPlate)}`);
      setWebSearchResults(result);
    } catch (err) {
      setError(err?.message || 'No se pudo preparar la búsqueda en Internet.');
    } finally {
      setWebSearchLoading(false);
    }
  }

  return (
    <section className="maintenance-page">
      <div className="maintenance-header">
        <div>
          <h2>Mantenimiento de flota</h2>
          <p>Programa servicios, registra trabajos y controla los próximos vencimientos.</p>
        </div>
        <button
          type="button"
          className="maintenance-btn maintenance-btn-secondary"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="maintenance-message maintenance-message-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="maintenance-message maintenance-message-success" role="status">
          {notice}
        </div>
      )}

      <div className="maintenance-kpis">
        <article className="maintenance-kpi">
          <span>Programaciones activas</span>
          <strong>{activeSchedules.length}</strong>
        </article>
        <article className="maintenance-kpi maintenance-kpi-red">
          <span>Mantenimientos vencidos</span>
          <strong>{overdueCount}</strong>
        </article>
        <article className="maintenance-kpi maintenance-kpi-yellow">
          <span>Próximos mantenimientos</span>
          <strong>{upcomingCount}</strong>
        </article>
        <article className="maintenance-kpi">
          <span>Servicios registrados</span>
          <strong>{history.length}</strong>
        </article>
      </div>

      <nav className="maintenance-tabs" aria-label="Secciones de mantenimiento">
        <button
          type="button"
          className={tab === 'programacion' ? 'active' : ''}
          onClick={() => setTab('programacion')}
        >
          Programación
        </button>
        <button
          type="button"
          className={tab === 'registrar' ? 'active' : ''}
          onClick={() => setTab('registrar')}
        >
          Registrar servicio
        </button>
        <button
          type="button"
          className={tab === 'historial' ? 'active' : ''}
          onClick={() => setTab('historial')}
        >
          Historial
        </button>
        <button
          type="button"
          className={tab === 'especificaciones' ? 'active' : ''}
          onClick={() => setTab('especificaciones')}
        >
          Especificaciones
        </button>
        <button type="button" className={tab === 'alertas' ? 'active' : ''} onClick={() => setTab('alertas')}>
          Alertas automáticas {pendingAlerts.length > 0 ? `(${pendingAlerts.length})` : ''}
        </button>
        <button type="button" className={tab === 'historial-alertas' ? 'active' : ''} onClick={() => setTab('historial-alertas')}>
          Historial de alertas
        </button>
      </nav>

      {tab === 'programacion' && (
        <>
          <section className="maintenance-panel">
            <div className="maintenance-panel-heading">
              <div>
                <h3>{editingId ? 'Editar programación' : 'Programar mantenimiento'}</h3>
                <p>Define la unidad, el intervalo y cuándo corresponde el siguiente servicio.</p>
              </div>
              {editingId && (
                <button
                  type="button"
                  className="maintenance-btn maintenance-btn-secondary"
                  onClick={resetScheduleForm}
                >
                  Cancelar edición
                </button>
              )}
            </div>

            {vehicles.length === 0 && (
              <div className="maintenance-message maintenance-message-warning">
                No se recibieron unidades activas desde Flota. Verifica que App.jsx
                envíe la propiedad <code>vehicles</code> y que la API de vehículos
                esté cargando correctamente.
              </div>
            )}

            <form className="maintenance-form" onSubmit={submitSchedule}>
              <label>
                Unidad vehicular
                <select
                  value={scheduleForm.vehicle_plate}
                  onChange={(event) =>
                    updateSchedule('vehicle_plate', event.target.value)
                  }
                  required
                >
                  <option value="">Selecciona una unidad</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id ?? vehicle.plate} value={vehicle.plate}>
                      {vehicle.plate} — {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Nombre del servicio
                <input
                  value={scheduleForm.maintenance_name}
                  onChange={(event) =>
                    updateSchedule('maintenance_name', event.target.value)
                  }
                  placeholder="Ej. Cambio de aceite"
                  required
                />
              </label>

              <label>
                Intervalo en kilómetros
                <input
                  type="number"
                  min="0"
                  value={scheduleForm.interval_km}
                  onChange={(event) => updateSchedule('interval_km', event.target.value)}
                  placeholder="Ej. 5000"
                />
              </label>

              <label>
                Intervalo en días
                <input
                  type="number"
                  min="0"
                  value={scheduleForm.interval_days}
                  onChange={(event) => updateSchedule('interval_days', event.target.value)}
                  placeholder="Ej. 180"
                />
              </label>

              <label>
                Kilometraje del último servicio
                <input
                  type="number"
                  min="0"
                  value={scheduleForm.last_service_km}
                  onChange={(event) =>
                    updateSchedule('last_service_km', event.target.value)
                  }
                  placeholder="Ej. 85000"
                />
              </label>

              <label>
                Fecha del último servicio
                <input
                  type="date"
                  value={scheduleForm.last_service_date}
                  onChange={(event) =>
                    updateSchedule('last_service_date', event.target.value)
                  }
                />
              </label>

              <label>
                Kilometraje del próximo servicio
                <input
                  type="number"
                  min="0"
                  value={scheduleForm.next_service_km}
                  onChange={(event) =>
                    updateSchedule('next_service_km', event.target.value)
                  }
                  placeholder="Ej. 90000"
                />
              </label>

              <label>
                Fecha del próximo servicio
                <input
                  type="date"
                  value={scheduleForm.next_service_date}
                  onChange={(event) =>
                    updateSchedule('next_service_date', event.target.value)
                  }
                />
              </label>

              <label className="maintenance-full">
                Descripción u observaciones
                <textarea
                  rows="2"
                  value={scheduleForm.description}
                  onChange={(event) =>
                    updateSchedule('description', event.target.value)
                  }
                  placeholder="Detalle del trabajo preventivo"
                />
              </label>

              {scheduleForm.alert_record_id && (
                <div className="maintenance-message maintenance-message-warning maintenance-full">
                  Esta programación quedará vinculada a la alerta {scheduleForm.alert_component} del registro #{scheduleForm.alert_record_id}.
                </div>
              )}
              <div className="maintenance-form-actions maintenance-full">
                <button
                  type="submit"
                  className="maintenance-btn maintenance-btn-primary"
                  disabled={saving || vehicles.length === 0}
                >
                  {saving
                    ? 'Guardando…'
                    : editingId
                      ? 'Guardar cambios'
                      : 'Guardar programación'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="maintenance-btn maintenance-btn-secondary"
                    onClick={resetScheduleForm}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="maintenance-panel">
            <div className="maintenance-panel-heading">
              <div>
                <h3>Programaciones registradas</h3>
                <p>Consulta el estado de los servicios por unidad.</p>
              </div>
              <input
                className="maintenance-search"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
                placeholder="Buscar placa o servicio…"
                aria-label="Buscar programación"
              />
            </div>

            <div className="maintenance-table-wrap">
              <table className="maintenance-table">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Servicio</th>
                    <th>Intervalo</th>
                    <th>Próximo por km</th>
                    <th>Próxima fecha</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((item) => {
                    const status = statusLabel(item.alert_status);
                    return (
                      <tr key={item.id}>
                        <td><strong>{item.vehicle_plate}</strong></td>
                        <td>
                          <strong>{item.maintenance_name}</strong>
                          {item.description && <small>{item.description}</small>}
                        </td>
                        <td>
                          {item.interval_km ? `${item.interval_km.toLocaleString()} km` : '—'}
                          {item.interval_days ? ` / ${item.interval_days} días` : ''}
                        </td>
                        <td>
                          {item.next_service_km != null
                            ? Number(item.next_service_km).toLocaleString() + ' km'
                            : '—'}
                        </td>
                        <td>{dateOnly(item.next_service_date) || '—'}</td>
                        <td>
                          <span className={`maintenance-status ${status.className}`}>
                            {item.alert_message || status.label}
                          </span>
                        </td>
                        <td>
                          <div className="maintenance-row-actions">
                            <button
                              type="button"
                              className="maintenance-link-btn"
                              onClick={() => editSchedule(item)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="maintenance-link-btn"
                              onClick={() => selectScheduleForService(item)}
                            >
                              Registrar servicio
                            </button>
                            <button
                              type="button"
                              className="maintenance-link-btn danger"
                              onClick={() => deactivateSchedule(item)}
                            >
                              Desactivar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && filteredSchedules.length === 0 && (
                    <tr>
                      <td colSpan="7" className="maintenance-empty">
                        No hay programaciones para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'registrar' && (
        <section className="maintenance-panel">
          <div className="maintenance-panel-heading">
            <div>
              <h3>Registrar servicio realizado</h3>
              <p>Registra el kilometraje, el costo y los detalles del trabajo.</p>
            </div>
          </div>

          <form className="maintenance-form" onSubmit={submitHistory}>
            <label>
              Unidad vehicular
              <select
                value={historyForm.vehicle_plate}
                onChange={(event) => chooseVehicleForHistory(event.target.value)}
                required
              >
                <option value="">Selecciona una unidad</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id ?? vehicle.plate} value={vehicle.plate}>
                    {vehicle.plate} — {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Servicio realizado
              <input
                value={historyForm.maintenance_name}
                onChange={(event) => updateHistory('maintenance_name', event.target.value)}
                placeholder="Ej. Cambio de aceite"
                required
              />
            </label>

            <label>
              Programación relacionada (opcional)
              <select
                value={historyForm.schedule_id}
                onChange={(event) => {
                  const selected = schedules.find(
                    (item) => String(item.id) === event.target.value
                  );
                  setHistoryForm((current) => ({
                    ...current,
                    schedule_id: event.target.value,
                    ...(selected
                      ? {
                          vehicle_plate: selected.vehicle_plate || current.vehicle_plate,
                          maintenance_name: selected.maintenance_name || current.maintenance_name,
                          next_service_km: selected.next_service_km ?? '',
                          next_service_date: dateOnly(selected.next_service_date),
                        }
                      : {}),
                  }));
                }}
              >
                <option value="">Sin programación vinculada</option>
                {activeSchedules.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.vehicle_plate} — {item.maintenance_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fecha del servicio
              <input
                type="date"
                value={historyForm.service_date}
                onChange={(event) => updateHistory('service_date', event.target.value)}
                required
              />
            </label>

            <label>
              Kilometraje del servicio
              <input
                type="number"
                min="0"
                value={historyForm.service_km}
                onChange={(event) => updateHistory('service_km', event.target.value)}
                placeholder="Ej. 90000"
              />
            </label>

            <label>
              Costo del servicio (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                value={historyForm.cost}
                onChange={(event) => updateHistory('cost', event.target.value)}
                placeholder="Ej. 350.00"
              />
            </label>

            <label>
              Taller o proveedor
              <input
                value={historyForm.workshop}
                onChange={(event) => updateHistory('workshop', event.target.value)}
                placeholder="Nombre del taller"
              />
            </label>

            <label>
              Próximo servicio por km
              <input
                type="number"
                min="0"
                value={historyForm.next_service_km}
                onChange={(event) => updateHistory('next_service_km', event.target.value)}
                placeholder="Ej. 95000"
              />
            </label>

            <label>
              Fecha del próximo servicio
              <input
                type="date"
                value={historyForm.next_service_date}
                onChange={(event) =>
                  updateHistory('next_service_date', event.target.value)
                }
              />
            </label>

            <label>
              Descripción del trabajo
              <input
                value={historyForm.description}
                onChange={(event) => updateHistory('description', event.target.value)}
                placeholder="Repuestos o trabajos realizados"
              />
            </label>

            <label className="maintenance-full">
              Observaciones
              <textarea
                rows="3"
                value={historyForm.observations}
                onChange={(event) => updateHistory('observations', event.target.value)}
                placeholder="Detalles adicionales"
              />
            </label>

            <div className="maintenance-form-actions maintenance-full">
              <button
                type="submit"
                className="maintenance-btn maintenance-btn-primary"
                disabled={saving || vehicles.length === 0}
              >
                {saving ? 'Guardando…' : 'Guardar servicio'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'historial' && (
        <section className="maintenance-panel">
          <div className="maintenance-panel-heading">
            <div>
              <h3>Historial de mantenimiento</h3>
              <p>Consulta los servicios realizados y sus costos.</p>
            </div>
            <input
              className="maintenance-search"
              value={historyFilter}
              onChange={(event) => setHistoryFilter(event.target.value)}
              placeholder="Buscar placa o servicio…"
              aria-label="Buscar historial"
            />
          </div>

          <div className="maintenance-table-wrap">
            <table className="maintenance-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Unidad</th>
                  <th>Servicio</th>
                  <th>Kilometraje</th>
                  <th>Taller</th>
                  <th>Costo</th>
                  <th>Registrado por</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{dateOnly(item.service_date) || '—'}</td>
                    <td><strong>{item.vehicle_plate || '—'}</strong></td>
                    <td>{item.maintenance_name || '—'}</td>
                    <td>
                      {item.service_km != null
                        ? `${Number(item.service_km).toLocaleString()} km`
                        : '—'}
                    </td>
                    <td>{item.workshop || '—'}</td>
                    <td>{money(item.cost)}</td>
                    <td>{item.registered_by_name || '—'}</td>
                    <td>{item.observations || item.description || '—'}</td>
                  </tr>
                ))}
                {!loading && filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan="8" className="maintenance-empty">
                      No hay servicios registrados todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'especificaciones' && (
        <section className="maintenance-panel">
          <div className="maintenance-panel-heading">
            <div>
              <h3>Especificaciones de las unidades</h3>
              <p>Busca manuales y fichas técnicas en Internet usando la marca, modelo, año y motor registrados.</p>
            </div>
          </div>

          <div className="maintenance-web-search">
            <label>
              Unidad vehicular
              <select value={specPlate} onChange={(event) => { setSpecPlate(event.target.value); setWebSearchResults(null); }}>
                <option value="">Selecciona una unidad</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id ?? vehicle.plate} value={vehicle.plate}>
                    {vehicle.plate} — {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="maintenance-btn maintenance-btn-primary" onClick={searchVehicleSpecifications} disabled={webSearchLoading || !specPlate}>
              {webSearchLoading ? 'Preparando búsqueda…' : 'Buscar en Internet'}
            </button>
          </div>

          {webSearchResults && (
            <div className="maintenance-web-results">
              <h4>Resultados de búsqueda para {webSearchResults.vehicle?.plate}</h4>
              <p><strong>Vehículo:</strong> {[webSearchResults.vehicle?.brand, webSearchResults.vehicle?.model, webSearchResults.vehicle?.year, webSearchResults.vehicle?.engine].filter(Boolean).join(' ') || 'Faltan datos del modelo o motor.'}</p>
              <p><strong>Consulta:</strong> {webSearchResults.query}</p>
              <div className="maintenance-web-links">
                {(webSearchResults.sources || []).map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener">{source.name}</a>
                ))}
              </div>
              <p className="maintenance-web-warning">Importante: estos enlaces abren búsquedas externas; revisa que el manual corresponda exactamente al modelo, año y motor. Los resultados no se guardan automáticamente en la base de datos.</p>
            </div>
          )}

          <div className="maintenance-panel-heading maintenance-specs-existing-heading">
            <div>
              <h3>Especificaciones guardadas en BALSO</h3>
              <p>Solo utiliza estos datos como referencia después de verificar la fuente técnica.</p>
            </div>
          </div>
          <div className="maintenance-table-wrap">
            <table className="maintenance-table">
              <thead><tr><th>Unidad</th><th>Elemento</th><th>Especificación</th><th>Capacidad</th><th>Intervalo</th><th>Confianza / fuente</th></tr></thead>
              <tbody>
                {getArray(maintenance, ['maintenance', 'rules', 'results']).map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.vehicle_plate || '—'}</strong></td>
                    <td>{item.item || '—'}</td>
                    <td>{item.specification || '—'}</td>
                    <td>{item.capacity || '—'}</td>
                    <td>{item.interval_text || '—'}</td>
                    <td>{item.confidence || item.source_url || 'Pendiente de verificar'}</td>
                  </tr>
                ))}
                {getArray(maintenance, ['maintenance', 'rules', 'results']).length === 0 && (
                  <tr><td colSpan="6" className="maintenance-empty">No hay especificaciones registradas en la base de datos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === 'alertas' && (
        <section className="maintenance-panel">
          <div className="maintenance-panel-heading">
            <div><h3>Alertas automáticas pendientes</h3><p>Se generan a partir de las inspecciones de los conductores. Programadas y resueltas pasan al historial.</p></div>
            <input className="maintenance-search" value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)} placeholder="Buscar placa, componente…" aria-label="Buscar alertas" />
          </div>
          <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Prioridad</th><th>Unidad / conductor</th><th>Componente y detalle</th><th>Fecha / km</th><th>Estado</th><th>Observaciones</th><th>Acciones</th></tr></thead><tbody>
            {pendingAlerts.filter((a) => [a.vehicle_plate,a.driver_name,a.component,a.message,a.notes].join(' ').toLowerCase().includes(alertFilter.toLowerCase())).map((a) => (
              <tr key={`${a.record_id}-${a.component}`}><td><span className={`maintenance-status ${a.priority === 'red' ? 'red' : 'yellow'}`}>{a.priority === 'red' ? 'Crítica' : 'Preventiva'}</span></td><td><strong>{a.vehicle_plate}</strong><small>{a.driver_name || '—'}</small></td><td><strong>{a.component}</strong><small>{a.message}</small><small>{a.recommendation}</small></td><td>{a.recorded_at ? new Date(a.recorded_at).toLocaleString('es-PE') : '—'}<small>{a.current_km != null ? `${Number(a.current_km).toLocaleString()} km` : ''}</small></td><td><select value={a.status || 'pendiente'} onChange={(e) => updateAlert(a, e.target.value)}><option value="pendiente">Pendiente</option><option value="en_mantenimiento">En mantenimiento</option><option value="programado">Programado</option><option value="resuelta">Resuelta</option></select></td><td><textarea rows="2" defaultValue={a.notes || ''} placeholder="Añadir observación" onBlur={(e) => { if (e.target.value !== (a.notes || '')) updateAlert(a, a.status || 'pendiente', e.target.value); }} /></td><td><button type="button" className="maintenance-link-btn" onClick={() => programAlert(a)}>Programar</button><button type="button" className="maintenance-link-btn" onClick={() => updateAlert(a, 'resuelta', a.notes || '')}>Resolver</button></td></tr>
            ))}
            {!loading && pendingAlerts.length === 0 && <tr><td colSpan="7" className="maintenance-empty">No hay alertas pendientes.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {tab === 'historial-alertas' && (
        <section className="maintenance-panel">
          <div className="maintenance-panel-heading"><div><h3>Historial de alertas</h3><p>Registro persistente de alertas pendientes, programadas, en mantenimiento y resueltas.</p></div><input className="maintenance-search" value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)} placeholder="Buscar en historial…" aria-label="Buscar historial de alertas" /></div>
          <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Fecha</th><th>Unidad</th><th>Componente</th><th>Detalle</th><th>Estado</th><th>Observaciones</th><th>Última actualización</th><th>Actualizado por</th></tr></thead><tbody>
            {filteredAlerts.map((a) => <tr key={`${a.record_id}-${a.component}`}><td>{a.recorded_at ? new Date(a.recorded_at).toLocaleString('es-PE') : '—'}</td><td><strong>{a.vehicle_plate}</strong><small>{a.driver_name || '—'}</small></td><td>{a.component}</td><td>{a.message || a.title || '—'}</td><td><span className={`maintenance-status ${a.status === 'resuelta' ? 'green' : a.status === 'programado' ? 'yellow' : 'gray'}`}>{({pendiente:'Pendiente',programado:'Programado',en_mantenimiento:'En mantenimiento',resuelta:'Resuelta'})[a.status] || a.status}</span></td><td>{a.notes || '—'}</td><td>{a.updated_at ? new Date(a.updated_at).toLocaleString('es-PE') : '—'}</td><td>{a.updated_by_name || '—'}</td></tr>)}
            {filteredAlerts.length === 0 && <tr><td colSpan="8" className="maintenance-empty">Todavía no hay alertas en el historial.</td></tr>}
          </tbody></table></div>
        </section>
      )}
    </section>
  );
}
