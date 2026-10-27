import React, { useState } from 'react';
import Swal from 'sweetalert2';
import Status from '../components/Status';
import { api } from '../services/api';
import './Documentos.css';

const emptyForm = {
  vehicle_plate: '',
  document_name: '',
  checked_at: '',
  expires_at: '',
  action_required: '',
  evidence_url: '',
};

function formatDate(value) {
  if (!value) return 'Sin registrar';

  const date = String(value).slice(0, 10);
  const parts = date.split('-');

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : date;
}

function getDocumentState(doc) {
  if (doc.expires_at) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(
      `${String(doc.expires_at).slice(0, 10)}T00:00:00`
    );

    const days = Math.round(
      (expiry.getTime() - today.getTime()) / 86400000
    );

    if (days < 0) {
      return {
        status: 'red',
        label: `Vencido hace ${Math.abs(days)} día(s)`,
      };
    }

    if (days <= 30) {
      return {
        status: 'yellow',
        label: days === 0 ? 'Vence hoy' : `Vence en ${days} día(s)`,
      };
    }

    return {
      status: 'green',
      label: 'Vigente',
    };
  }

  const status = doc.status || 'gray';

  const labels = {
    red: 'Requiere atención',
    yellow: 'Próximo a revisión',
    green: 'En regla',
    gray: 'Sin verificar',
  };

  return {
    status,
    label: labels[status] || 'Sin verificar',
  };
}

export default function Documentos({
  documents = [],
  vehicles = [],
  session,
  onReload,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  function updateField(event) {
    const { name, value } = event.target;

    setForm(current => ({
      ...current,
      [name]: value,
    }));
  }

  function openNewForm() {
    setEditingId(null);

    setForm({
      ...emptyForm,
      vehicle_plate: vehicles[0]?.plate || '',
    });

    setShowForm(true);
  }

  function openEditForm(doc) {
    setEditingId(doc.id);

    setForm({
      vehicle_plate: doc.vehicle_plate || '',
      document_name: doc.document_name || '',
      checked_at: doc.checked_at
        ? String(doc.checked_at).slice(0, 10)
        : '',
      expires_at: doc.expires_at
        ? String(doc.expires_at).slice(0, 10)
        : '',
      action_required: doc.action_required || '',
      evidence_url: doc.evidence_url || '',
    });

    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  async function saveDocument(event) {
    event.preventDefault();

    if (!form.vehicle_plate || !form.document_name.trim()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Faltan datos',
        text: 'Selecciona una placa e ingresa el nombre del documento.',
        confirmButtonText: 'Entendido',
      });

      return;
    }

    if (
      form.checked_at &&
      form.expires_at &&
      form.expires_at < form.checked_at
    ) {
      await Swal.fire({
        icon: 'warning',
        title: 'Fechas incorrectas',
        text: 'El vencimiento no puede ser anterior a la fecha de revisión.',
        confirmButtonText: 'Entendido',
      });

      return;
    }

    if (form.evidence_url.trim()) {
      try {
        const url = new URL(form.evidence_url.trim());

        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Enlace no válido');
        }
      } catch {
        await Swal.fire({
          icon: 'warning',
          title: 'Enlace inválido',
          text: 'Usa un enlace que comience con https:// o http://.',
          confirmButtonText: 'Entendido',
        });

        return;
      }
    }

    const isEditing = editingId !== null;

    const payload = {
      vehicle_plate: form.vehicle_plate,
      document_name: form.document_name.trim(),
      checked_at: form.checked_at || null,
      expires_at: form.expires_at || null,
      action_required: form.action_required.trim() || null,
      evidence_url: form.evidence_url.trim() || null,
    };

    setSaving(true);

    try {
      if (isEditing) {
        await api(
          `/documents/${editingId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
          session
        );
      } else {
        await api(
          '/documents',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          session
        );
      }

      closeForm();

      if (onReload) {
        await onReload();
      }

      await Swal.fire({
        icon: 'success',
        title: isEditing
          ? 'Documento actualizado'
          : 'Documento registrado',
        text: 'La información se guardó correctamente.',
        confirmButtonText: 'Aceptar',
      });
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text:
          error.message ||
          'Ocurrió un error al guardar el documento.',
        confirmButtonText: 'Cerrar',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="documents-page">
      {/* Encabezado */}
      <div className="documents-heading">
        <div>
          <h1>Control documental</h1>
          <p>
            Registra documentos por unidad y controla sus fechas de
            vencimiento.
          </p>
        </div>

        <button
          type="button"
          className="doc-btn doc-btn-primary"
          onClick={openNewForm}
          disabled={vehicles.length === 0}
        >
          + Nuevo documento
        </button>
      </div>

      {/* Aviso cuando no existen vehículos */}
      {vehicles.length === 0 && (
        <div className="doc-notice">
          No hay vehículos disponibles. Registra primero las unidades
          de la flota.
        </div>
      )}

      {/* Formulario de registro y edición */}
      {showForm && (
        <form className="doc-form" onSubmit={saveDocument}>
          <div className="doc-form-heading">
            <div>
              <h2>
                {editingId !== null
                  ? 'Editar documento'
                  : 'Registrar documento'}
              </h2>

              <p>
                Solo la placa y el nombre del documento son obligatorios.
                Los demás campos pueden dejarse vacíos.
              </p>
            </div>

            <button
              type="button"
              className="doc-close"
              onClick={closeForm}
              disabled={saving}
              aria-label="Cerrar formulario"
              title="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="doc-fields">
            <label>
              Placa del vehículo *
              <select
                name="vehicle_plate"
                value={form.vehicle_plate}
                onChange={updateField}
                required
              >
                <option value="">Selecciona una unidad</option>

                {vehicles.map(vehicle => (
                  <option
                    key={vehicle.id ?? vehicle.plate}
                    value={vehicle.plate}
                  >
                    {vehicle.plate}
                    {vehicle.brand || vehicle.model
                      ? ` · ${vehicle.brand || ''} ${vehicle.model || ''}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Nombre del documento *
              <input
                type="text"
                name="document_name"
                value={form.document_name}
                onChange={updateField}
                placeholder="Ej. SOAT, revisión técnica"
                maxLength={200}
                required
              />
            </label>

            <label>
              Fecha de última revisión{' '}
              <span className="doc-optional">(opcional)</span>
              <input
                type="date"
                name="checked_at"
                value={form.checked_at}
                onChange={updateField}
              />
            </label>

            <label>
              Fecha de vencimiento{' '}
              <span className="doc-optional">(opcional)</span>
              <input
                type="date"
                name="expires_at"
                value={form.expires_at}
                onChange={updateField}
              />
            </label>

            <label>
              Enlace de evidencia{' '}
              <span className="doc-optional">(opcional)</span>
              <input
                type="url"
                name="evidence_url"
                value={form.evidence_url}
                onChange={updateField}
                placeholder="https://..."
                maxLength={500}
              />
            </label>

            <label>
              Acción requerida{' '}
              <span className="doc-optional">(opcional)</span>
              <textarea
                name="action_required"
                value={form.action_required}
                onChange={updateField}
                placeholder="Ej. Renovar el documento antes del vencimiento"
                rows={3}
              />
            </label>
          </div>

          <div className="doc-form-actions">
            <button
              type="submit"
              className="doc-btn doc-btn-primary"
              disabled={saving}
            >
              {saving
                ? 'Guardando...'
                : editingId !== null
                  ? 'Guardar cambios'
                  : 'Guardar documento'}
            </button>

            <button
              type="button"
              className="doc-btn doc-btn-secondary"
              onClick={closeForm}
              disabled={saving}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Tabla de documentos */}
      <div className="doc-table-panel">
        <div className="doc-table-heading">
          <h2>Documentos registrados</h2>
          <p>{documents.length} documento(s) registrados</p>
        </div>

        {documents.length === 0 ? (
          <div className="doc-empty">
            <span aria-hidden="true">▤</span>
            <strong>No hay documentos registrados</strong>
            <p>
              Registra un documento para comenzar a controlar los
              vencimientos.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Documento</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th>Acción requerida</th>
                  <th>Última revisión</th>
                  <th>Evidencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {documents.map(doc => {
                  const state = getDocumentState(doc);

                  return (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.vehicle_plate}</strong>
                      </td>

                      <td>{doc.document_name}</td>

                      <td>
                        <div className="doc-status">
                          <Status value={state.status} />
                          <span>{state.label}</span>
                        </div>
                      </td>

                      <td>{formatDate(doc.expires_at)}</td>

                      <td>
                        {doc.action_required || (
                          <span className="doc-muted">
                            Sin acción pendiente
                          </span>
                        )}
                      </td>

                      <td>{formatDate(doc.checked_at)}</td>

                      <td>
                        {doc.evidence_url ? (
                          <a
                            className="doc-evidence-link"
                            href={doc.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver evidencia ↗
                          </a>
                        ) : (
                          <span className="doc-muted">
                            Sin evidencia
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="doc-btn doc-btn-edit"
                          onClick={() => openEditForm(doc)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}