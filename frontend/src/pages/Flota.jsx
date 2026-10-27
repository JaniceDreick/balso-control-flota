import React, { useMemo, useState } from 'react';
import Status from '../components/Status';
import { fmt, money } from '../utils/formatters';

const EMPTY_VEHICLE = {
  plate: '',
  brand: '',
  model: '',
  year: '',
  vin: '',
  engine_number: '',
  site: '',
  owner_name: '',
  current_km: '',
  image_data: '',
  notes: '',
  active: true
};

function normalizeVehicle(vehicle = {}) {
  return {
    ...EMPTY_VEHICLE,
    ...vehicle,
    plate: vehicle.plate || '',
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    year: vehicle.year ?? '',
    vin: vehicle.vin || '',
    engine_number: vehicle.engine_number || '',
    site: vehicle.site || '',
    owner_name: vehicle.owner_name || '',
    current_km: vehicle.current_km ?? '',
    image_data: vehicle.image_data || '',
    notes: vehicle.notes || '',
    active: vehicle.active === undefined ? true : Boolean(vehicle.active)
  };
}

export default function Flota({
  vehicles = [],
  onCreate,
  onUpdate,
  onToggle
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_VEHICLE });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeVehicles = vehicles.filter(v => v.active !== false);
  const inactiveVehicles = vehicles.filter(v => v.active === false);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return vehicles.filter(vehicle => {
      const matchesSearch = [
        vehicle.plate,
        vehicle.brand,
        vehicle.model,
        vehicle.site,
        vehicle.owner_name
      ].some(value => String(value || '').toLowerCase().includes(term));

      const isActive = vehicle.active !== false;

      const matchesStatus =
        filterStatus === 'todos' ||
        (filterStatus === 'activos' && isActive) ||
        (filterStatus === 'inactivos' && !isActive);

      return matchesSearch && matchesStatus;
    });
  }, [vehicles, search, filterStatus]);

  function openCreateForm() {
    setEditingVehicle(null);
    setForm({ ...EMPTY_VEHICLE });
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function openEditForm(vehicle) {
    setEditingVehicle(vehicle);
    setForm(normalizeVehicle(vehicle));
    setError('');
    setNotice('');
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingVehicle(null);
    setForm({ ...EMPTY_VEHICLE });
    setError('');
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleImage(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      event.target.value = '';
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError('La imagen no debe superar los 3 MB.');
      event.target.value = '';
      return;
    }

    try {
      const imageData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(file);
      });

      setForm(previous => ({
        ...previous,
        image_data: imageData
      }));

      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    const plate = form.plate.trim().toUpperCase();
    const brand = form.brand.trim();
    const model = form.model.trim();

    if (!plate || !brand || !model) {
      setError('La placa, la marca y el modelo son obligatorios.');
      return;
    }

    const duplicate = vehicles.some(vehicle =>
      String(vehicle.plate || '').trim().toUpperCase() === plate &&
      String(vehicle.id) !== String(editingVehicle?.id)
    );

    if (duplicate) {
      setError('Ya existe una unidad registrada con esa placa.');
      return;
    }

    const year = form.year === '' ? null : Number(form.year);
    const initialKm =
      form.current_km === '' ? 0 : Number(form.current_km);

    if (
      year !== null &&
      (!Number.isInteger(year) || year < 1900 || year > 2100)
    ) {
      setError('Ingresa un año válido.');
      return;
    }

    if (!Number.isFinite(initialKm) || initialKm < 0) {
      setError('El kilometraje debe ser un número igual o mayor que cero.');
      return;
    }

    if (
      editingVehicle &&
      Number(editingVehicle.current_km || 0) > initialKm
    ) {
      setError(
        'El kilometraje no puede ser menor que el último kilometraje registrado.'
      );
      return;
    }

    const payload = {
      plate,
      brand,
      model,
      year,
      vin: form.vin.trim(),
      engine_number: form.engine_number.trim(),
      site: form.site.trim(),
      owner_name: form.owner_name.trim(),
      current_km: initialKm,
      image_data: form.image_data,
      notes: form.notes.trim(),
      active: form.active
    };

    const saveFunction = editingVehicle ? onUpdate : onCreate;

    if (typeof saveFunction !== 'function') {
      setError(
        'Falta conectar esta operación con el componente principal y el backend.'
      );
      return;
    }

    setSaving(true);

    try {
      await saveFunction(
        ...(editingVehicle
          ? [editingVehicle.id, payload]
          : [payload])
      );

      setShowForm(false);
      setEditingVehicle(null);
      setForm({ ...EMPTY_VEHICLE });

      setNotice(
        editingVehicle
          ? 'Los datos de la unidad se actualizaron correctamente.'
          : 'La nueva unidad se registró correctamente.'
      );
    } catch (e) {
      setError(e.message || 'No se pudo guardar la unidad.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(vehicle) {
    const currentlyActive = vehicle.active !== false;

    const confirmed = window.confirm(
      currentlyActive
        ? `¿Deseas desactivar la unidad ${vehicle.plate}? Sus datos e historial se conservarán.`
        : `¿Deseas activar nuevamente la unidad ${vehicle.plate}?`
    );

    if (!confirmed) return;

    if (typeof onToggle !== 'function') {
      setError(
        'Falta conectar el cambio de estado con el backend.'
      );
      return;
    }

    setError('');
    setNotice('');

    try {
      await onToggle(vehicle.id, !currentlyActive);

      setNotice(
        currentlyActive
          ? 'La unidad se desactivó correctamente.'
          : 'La unidad se activó correctamente.'
      );
    } catch (e) {
      setError(e.message || 'No se pudo cambiar el estado de la unidad.');
    }
  }

  return (
    <div className="fleet-page">
      <style>{`
        .fleet-page {
          width: 100%;
          color: var(--text, #172b4d);
        }

        .fleet-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin: 20px 0;
        }

        .fleet-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 20px 0;
        }

        .fleet-summary-item {
          background: var(--panel, #fff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 14px;
          padding: 16px;
        }

        .fleet-summary-item small {
          display: block;
          color: #64748b;
          margin-bottom: 8px;
        }

        .fleet-summary-item strong {
          font-size: 24px;
        }

        .fleet-input,
        .fleet-select,
        .fleet-textarea {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          padding: 11px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: var(--panel, white);
          color: inherit;
          font: inherit;
        }

        .fleet-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .fleet-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
        }

        .fleet-field label {
          font-weight: 600;
          font-size: 14px;
        }

        .fleet-field-full {
          grid-column: 1 / -1;
        }

        .fleet-button {
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          padding: 10px 14px;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
          background: var(--panel, white);
          color: inherit;
        }

        .fleet-button-primary {
          background: #0f4c81;
          color: white;
          border-color: #0f4c81;
        }

        .fleet-button:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .fleet-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow-y: auto;
          padding: 24px 12px;
          background: rgba(15, 23, 42, .58);
        }

        .fleet-modal {
          width: min(760px, 100%);
          box-sizing: border-box;
          background: var(--panel, #fff);
          color: inherit;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,.2);
        }

        .fleet-image-preview {
          width: 100%;
          max-height: 220px;
          object-fit: contain;
          border-radius: 12px;
          background: #f1f5f9;
        }

        .fleet-state {
          display: inline-block;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 700;
        }

        .fleet-state-active {
          color: #166534;
          background: #dcfce7;
        }

        .fleet-state-inactive {
          color: #991b1b;
          background: #fee2e2;
        }

        .fleet-message {
          padding: 12px 14px;
          border-radius: 9px;
          margin: 12px 0;
          overflow-wrap: anywhere;
        }

        .fleet-message-error {
          color: #991b1b;
          background: #fee2e2;
        }

        .fleet-message-success {
          color: #166534;
          background: #dcfce7;
        }

        .fleet-card-inactive {
          opacity: .78;
        }

        .fleet-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .fleet-muted {
          color: #64748b;
          overflow-wrap: anywhere;
        }

        @media (max-width: 600px) {
          .fleet-summary {
            grid-template-columns: 1fr;
          }

          .fleet-form-grid {
            grid-template-columns: 1fr;
          }

          .fleet-field-full {
            grid-column: auto;
          }

          .fleet-modal {
            padding: 18px;
          }
        }
      `}</style>

      <div className="page-heading">
        <div>
          <h1>Maestro de unidades</h1>
          <p>Registra, edita y administra las unidades de BALSO.</p>
        </div>
      </div>

      {notice && (
        <div className="fleet-message fleet-message-success" role="status">
          {notice}
          <button
            type="button"
            className="fleet-button"
            style={{ float: 'right', padding: '2px 8px' }}
            onClick={() => setNotice('')}
          >
            Cerrar
          </button>
        </div>
      )}

      {error && !showForm && (
        <div className="fleet-message fleet-message-error" role="alert">
          {error}
          <button
            type="button"
            className="fleet-button"
            style={{ float: 'right', padding: '2px 8px' }}
            onClick={() => setError('')}
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="fleet-summary">
        <div className="fleet-summary-item">
          <small>Unidades registradas</small>
          <strong>{vehicles.length}</strong>
        </div>

        <div className="fleet-summary-item">
          <small>Unidades activas</small>
          <strong style={{ color: '#15803d' }}>
            {activeVehicles.length}
          </strong>
        </div>

        <div className="fleet-summary-item">
          <small>Unidades inactivas</small>
          <strong style={{ color: '#b91c1c' }}>
            {inactiveVehicles.length}
          </strong>
        </div>
      </div>

      <div className="fleet-toolbar">
        <div style={{ flex: '1 1 240px' }}>
          <input
            className="fleet-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por placa, marca, modelo o sede..."
            aria-label="Buscar unidades"
          />
        </div>

        <select
          className="fleet-select"
          style={{ width: 'auto', minWidth: 150 }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          aria-label="Filtrar unidades por estado"
        >
          <option value="todos">Todas las unidades</option>
          <option value="activos">Solo activas</option>
          <option value="inactivos">Solo inactivas</option>
        </select>

        <button
          type="button"
          className="fleet-button fleet-button-primary"
          onClick={openCreateForm}
        >
          + Registrar nueva unidad
        </button>
      </div>

      <div className="vehicle-grid">
        {filteredVehicles.map(vehicle => {
          const isActive = vehicle.active !== false;

          return (
            <article
              className={`panel ${!isActive ? 'fleet-card-inactive' : ''}`}
              key={vehicle.id ?? vehicle.plate}
            >
              {vehicle.image_data ? (
                <img
                  className="truck"
                  src={vehicle.image_data}
                  alt={`Unidad ${vehicle.plate}`}
                  style={{
                    width: '100%',
                    maxHeight: 220,
                    objectFit: 'contain'
                  }}
                />
              ) : (
                <div
                  style={{
                    minHeight: 125,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 8,
                    background: '#f1f5f9',
                    borderRadius: 12,
                    color: '#64748b',
                    marginBottom: 16
                  }}
                >
                  <span style={{ fontSize: 38 }}>🚚</span>
                  <strong>{vehicle.brand || 'Vehículo'} {vehicle.model}</strong>
                  <small>Sin fotografía</small>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <h2 style={{ margin: '8px 0' }}>
                  {vehicle.plate}
                </h2>

                <span
                  className={`fleet-state ${
                    isActive
                      ? 'fleet-state-active'
                      : 'fleet-state-inactive'
                  }`}
                >
                  {isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <p>
                <b>{vehicle.brand} {vehicle.model}</b>
                {' · '}
                {vehicle.year || 'Año por confirmar'}
              </p>

              <p>{vehicle.site || 'Sede por confirmar'}</p>

              <p>
                <b>Titular:</b> {vehicle.owner_name || 'Por confirmar'}
              </p>

              <p>
                <b>VIN:</b> {vehicle.vin || 'Sin registrar'}
              </p>

              <p>
                <b>N.º de motor:</b> {vehicle.engine_number || 'Sin registrar'}
              </p>

              <div className="status-row">
                <Status value={vehicle.mechanical_status || 'Por revisar'} />
                <Status value={vehicle.document_status || 'Por revisar'} />
              </div>

              <div className="metrics">
                <div>
                  <small>Kilometraje actual</small>
                  <b>{fmt(vehicle.current_km ?? 0)}</b>
                </div>

                <div>
                  <small>Combustible registrado</small>
                  <b>{money(vehicle.historical_fuel_cost ?? 0)}</b>
                </div>

                <div>
                  <small>Galones registrados</small>
                  <b>{fmt(vehicle.historical_gallons ?? 0)}</b>
                </div>

                <div>
                  <small>Km/gal</small>
                  <b>{vehicle.historical_efficiency ?? 'Sin dato'}</b>
                </div>
              </div>

              <p className="fleet-muted">
                {vehicle.notes || 'Sin observaciones registradas.'}
              </p>

              <div className="fleet-actions">
                <button
                  type="button"
                  className="fleet-button"
                  onClick={() => openEditForm(vehicle)}
                >
                  Editar datos
                </button>

                <button
                  type="button"
                  className="fleet-button"
                  onClick={() => handleToggle(vehicle)}
                >
                  {isActive ? 'Desactivar unidad' : 'Activar unidad'}
                </button>
              </div>
            </article>
          );
        })}

        {filteredVehicles.length === 0 && (
          <div className="panel">
            <h3>No se encontraron unidades</h3>
            <p>
              Prueba con otra búsqueda o registra una nueva unidad.
            </p>
            {vehicles.length === 0 && (
              <button
                type="button"
                className="fleet-button fleet-button-primary"
                onClick={openCreateForm}
              >
                + Registrar primera unidad
              </button>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fleet-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            className="fleet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fleet-form-title"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'flex-start',
                marginBottom: 20
              }}
            >
              <div>
                <h2 id="fleet-form-title" style={{ marginTop: 0 }}>
                  {editingVehicle ? 'Editar unidad' : 'Registrar nueva unidad'}
                </h2>
                <p className="fleet-muted">
                  Completa los datos disponibles. Los campos opcionales
                  pueden dejarse vacíos.
                </p>
              </div>

              <button
                type="button"
                className="fleet-button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="fleet-message fleet-message-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="fleet-form-grid">
                <div className="fleet-field">
                  <label htmlFor="fleet-plate">Placa *</label>
                  <input
                    id="fleet-plate"
                    className="fleet-input"
                    name="plate"
                    value={form.plate}
                    onChange={updateField}
                    maxLength={15}
                    required
                    placeholder="Ej. 1655VW"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-brand">Marca *</label>
                  <input
                    id="fleet-brand"
                    className="fleet-input"
                    name="brand"
                    value={form.brand}
                    onChange={updateField}
                    required
                    placeholder="Ej. Toyota"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-model">Modelo *</label>
                  <input
                    id="fleet-model"
                    className="fleet-input"
                    name="model"
                    value={form.model}
                    onChange={updateField}
                    required
                    placeholder="Modelo del vehículo"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-year">Año</label>
                  <input
                    id="fleet-year"
                    className="fleet-input"
                    type="number"
                    name="year"
                    value={form.year}
                    onChange={updateField}
                    min="1900"
                    max="2100"
                    placeholder="Ej. 2025"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-vin">VIN / Chasis</label>
                  <input
                    id="fleet-vin"
                    className="fleet-input"
                    name="vin"
                    value={form.vin}
                    onChange={updateField}
                    placeholder="Número de chasis"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-engine">Número de motor</label>
                  <input
                    id="fleet-engine"
                    className="fleet-input"
                    name="engine_number"
                    value={form.engine_number}
                    onChange={updateField}
                    placeholder="Número de motor"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-site">Sede</label>
                  <input
                    id="fleet-site"
                    className="fleet-input"
                    name="site"
                    value={form.site}
                    onChange={updateField}
                    placeholder="Ej. La Merced"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-owner">Titular</label>
                  <input
                    id="fleet-owner"
                    className="fleet-input"
                    name="owner_name"
                    value={form.owner_name}
                    onChange={updateField}
                    placeholder="Nombre del titular"
                  />
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-km">
                    Kilometraje inicial (km)
                  </label>
                  <input
                    id="fleet-km"
                    className="fleet-input"
                    type="number"
                    name="current_km"
                    value={form.current_km}
                    onChange={updateField}
                    min="0"
                    step="1"
                    placeholder="0"
                  />
                  <small className="fleet-muted">
                    Introduce el kilometraje real del odómetro al iniciar
                    el control; no se importan automáticamente los datos
                    históricos.
                  </small>
                </div>

                <div className="fleet-field">
                  <label htmlFor="fleet-status">Estado de la unidad</label>
                  <select
                    id="fleet-status"
                    className="fleet-select"
                    name="active"
                    value={form.active ? 'true' : 'false'}
                    onChange={e =>
                      setForm(previous => ({
                        ...previous,
                        active: e.target.value === 'true'
                      }))
                    }
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>

                <div className="fleet-field fleet-field-full">
                  <label htmlFor="fleet-image">Fotografía de la unidad</label>
                  <input
                    id="fleet-image"
                    className="fleet-input"
                    type="file"
                    accept="image/*"
                    onChange={handleImage}
                  />
                  <small className="fleet-muted">
                    Imagen de hasta 3 MB. Si cambias la fotografía,
                    selecciona una nueva. Si no, se conserva la actual.
                  </small>

                  {form.image_data && (
                    <div style={{ marginTop: 8 }}>
                      <img
                        src={form.image_data}
                        alt="Vista previa de la unidad"
                        className="fleet-image-preview"
                      />
                      <button
                        type="button"
                        className="fleet-button"
                        style={{ marginTop: 8 }}
                        onClick={() =>
                          setForm(previous => ({
                            ...previous,
                            image_data: ''
                          }))
                        }
                      >
                        Quitar fotografía
                      </button>
                    </div>
                  )}
                </div>

                <div className="fleet-field fleet-field-full">
                  <label htmlFor="fleet-notes">Observaciones</label>
                  <textarea
                    id="fleet-notes"
                    className="fleet-textarea"
                    name="notes"
                    value={form.notes}
                    onChange={updateField}
                    rows={3}
                    placeholder="Observaciones de la unidad"
                  />
                </div>
              </div>

              <div
                className="fleet-actions"
                style={{ justifyContent: 'flex-end', marginTop: 24 }}
              >
                <button
                  type="button"
                  className="fleet-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="fleet-button fleet-button-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Guardando...'
                    : editingVehicle
                      ? 'Guardar cambios'
                      : 'Registrar unidad'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
