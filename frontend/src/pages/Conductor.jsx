
import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { api } from '../services/api';
import { checks, roleName } from '../utils/formatters';
import RecordTable from '../components/RecordTable';

export default function Conductor({ vehicles = [], records = [], session, onReload }) {
  const sessionDriverName =
    session?.user?.name ||
    session?.user?.full_name ||
    '';

  const [form, setForm] = useState({
    plate: '',
    driver: sessionDriverName,
    km: '',
    route: '',
    gallons: '0',
    cost: '0',
    observations: ''
  });

  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(false);

  // Seleccionar automáticamente la unidad asignada al conductor.
  useEffect(() => {
    if (!vehicles.length) {
      setForm(current => ({
        ...current,
        plate: '',
        driver: sessionDriverName
      }));
      return;
    }

    setForm(current => {
      const currentVehicle = vehicles.find(
        vehicle => vehicle.plate === current.plate
      );

      const assignedVehicle = currentVehicle || vehicles[0];

      return {
        ...current,
        plate: assignedVehicle.plate,
        driver: assignedVehicle.assigned_driver || sessionDriverName
      };
    });
  }, [vehicles, sessionDriverName]);

  // Al seleccionar una placa, completar el conductor asignado.
  function handlePlateChange(event) {
    const plate = event.target.value;

    const vehicle = vehicles.find(
      item => item.plate === plate
    );

    setForm(current => ({
      ...current,
      plate,
      driver: vehicle?.assigned_driver || sessionDriverName
    }));
  }

  async function submit(event) {
    event.preventDefault();

    if (!vehicles.length) {
      return Swal.fire({
        icon: 'warning',
        title: 'No tienes una unidad asignada',
        text: 'Solicita al administrador que te asigne una unidad antes de registrar una inspección.'
      });
    }

    if (!form.plate || !form.driver.trim() || form.km === '') {
      return Swal.fire({
        icon: 'warning',
        title: 'Faltan datos',
        text: 'Completa la placa, el conductor y el kilometraje.'
      });
    }

    const km = Number(form.km);
    const gallons = Number(form.gallons || 0);
    const cost = Number(form.cost || 0);

    if (![km, gallons, cost].every(
      number => Number.isFinite(number) && number >= 0
    )) {
      return Swal.fire({
        icon: 'warning',
        title: 'Datos numéricos incorrectos',
        text: 'Revisa el kilometraje, los galones y el importe.'
      });
    }

    setLoading(true);

    try {
      const result = await api('/driver/records', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          km,
          gallons,
          cost,
          failedChecks: failed
        })
      }, session);

      setForm(current => ({
        ...current,
        km: '',
        route: '',
        gallons: '0',
        cost: '0',
        observations: ''
      }));

      setFailed([]);

      await onReload();

      const label = ({
        red: 'ROJO',
        yellow: 'AMARILLO',
        green: 'VERDE'
      })[result.status] || result.status || 'REGISTRADO';

      await Swal.fire({
        icon: 'success',
        title: 'Registro guardado',
        text: `${result.message || 'Inspección guardada correctamente.'} Estado: ${label}.`
      });
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: error.message
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Registro móvil del conductor</h1>
          <p>Los datos se guardan en la base central de BALSO.</p>
        </div>
      </div>

      <div className="two-col">
        <form className="panel" onSubmit={submit}>
          <h2>Registrar inspección</h2>

          {!vehicles.length && (
            <div className="alert red-alert">
              No tienes una unidad asignada. Contacta al administrador.
            </div>
          )}

          <div className="form-grid">
            <label>
              Placa
              <select
                value={form.plate}
                onChange={handlePlateChange}
                required
                disabled={!vehicles.length || loading}
              >
                <option value="">Selecciona una unidad</option>

                {vehicles.map(vehicle => (
                  <option
                    key={vehicle.id ?? vehicle.plate}
                    value={vehicle.plate}
                  >
                    {vehicle.plate} · {vehicle.brand} {vehicle.model}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Nombre del conductor asignado
              <input
                value={form.driver}
                readOnly
                required
                placeholder="Se completará automáticamente"
              />
            </label>

            <label>
              Kilometraje actual
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.km}
                onChange={event =>
                  setForm({ ...form, km: event.target.value })
                }
                required
              />
            </label>

            <label>
              Zona / ruta
              <input
                value={form.route}
                onChange={event =>
                  setForm({ ...form, route: event.target.value })
                }
                placeholder="Ej. Satipo - Pangoa"
              />
            </label>

            <label>
              Galones cargados
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.gallons}
                onChange={event =>
                  setForm({ ...form, gallons: event.target.value })
                }
              />
            </label>

            <label>
              Importe S/
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={event =>
                  setForm({ ...form, cost: event.target.value })
                }
              />
            </label>
          </div>

          <h3>Checklist de inspección</h3>

          <div className="checks">
            {checks.map(check => (
              <label className="check" key={check}>
                <input
                  type="checkbox"
                  checked={!failed.includes(check)}
                  onChange={event =>
                    setFailed(old =>
                      event.target.checked
                        ? old.filter(item => item !== check)
                        : [...old, check]
                    )
                  }
                />
                {check}
              </label>
            ))}
          </div>

          <label>
            Observaciones
            <textarea
              value={form.observations}
              onChange={event =>
                setForm({
                  ...form,
                  observations: event.target.value
                })
              }
              placeholder="Ruido, fuga, vibración, neumático..."
            />
          </label>

          <button
            className="primary"
            disabled={loading || !vehicles.length}
          >
            {loading ? 'Guardando…' : 'Guardar registro'}
          </button>
        </form>

        <div className="panel">
          <h2>Mis registros</h2>

          <p className="muted">
            {roleName[session?.user?.role] || 'Conductor'}
          </p>

          <RecordTable records={records} driver />
        </div>
      </div>
    </section>
  );
}
