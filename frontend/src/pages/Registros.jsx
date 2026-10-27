
import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { api } from '../services/api';
import { checks, normalize, roleName } from '../utils/formatters';
import RecordTable from '../components/RecordTable';

const initialForm = {
  plate: '',
  driver: '',
  km_start: '',
  km_end: '',
  route: '',
  gallons: '0',
  cost: '0',
  observations: ''
};

function isActive(user) {
  return (
    user.active === true ||
    user.active === 1 ||
    user.active === '1'
  );
}

function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

export default function Registros({
  records = [],
  users = [],
  vehicles = [],
  session,
  onReload
}) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ ...initialForm });
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(false);

  // Conductores activos disponibles.
  const activeDrivers = useMemo(() => {
    return users.filter(user =>
      normalized(user.role) === 'conductor' &&
      isActive(user)
    );
  }, [users]);

  // Buscar la unidad seleccionada.
  const selectedVehicle = useMemo(() => {
    return vehicles.find(vehicle =>
      normalized(vehicle.plate) === normalized(form.plate)
    );
  }, [vehicles, form.plate]);

  // Identificar al conductor asignado a una unidad.
  function getAssignedDriver(plate) {
    const vehicle = vehicles.find(item =>
      normalized(item.plate) === normalized(plate)
    );

    if (!vehicle) return '';

    // Si el vehículo trae el nombre del conductor.
    const assignedName = normalized(
      vehicle.assigned_driver ??
      vehicle.driver_name ??
      vehicle.assignedDriver
    );

    if (assignedName) {
      const match = activeDrivers.find(user =>
        normalized(user.full_name) === assignedName
      );

      if (match) return match.full_name;
    }

    // Si el usuario trae el ID de la unidad asignada.
    const assignedUser = activeDrivers.find(user => {
      const vehicleId =
        user.assigned_vehicle_id ??
        user.vehicle_id ??
        user.assignedVehicleId;

      const assignedPlate =
        user.assigned_vehicle_plate ??
        user.vehicle_plate ??
        user.assignedVehiclePlate;

      return (
        (
          vehicleId != null &&
          String(vehicleId) === String(vehicle.id)
        ) ||
        (
          assignedPlate != null &&
          normalized(assignedPlate) === normalized(vehicle.plate)
        )
      );
    });

    return assignedUser?.full_name || '';
  }

  // Calcular los kilómetros recorridos.
  const kmTraveled = useMemo(() => {
    if (form.km_start === '' || form.km_end === '') {
      return null;
    }

    const start = Number(form.km_start);
    const end = Number(form.km_end);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start
    ) {
      return null;
    }

    return Number((end - start).toFixed(2));
  }, [form.km_start, form.km_end]);

  // Filtrar por nombre del conductor.
  const filteredRecords = useMemo(() => {
    const search = normalize(filter);

    if (!search) return records;

    const terms = search.split(/\s+/).filter(Boolean);

    return records.filter(record => {
      const name = normalize(record.driver_name || '');
      return terms.every(term => name.includes(term));
    });
  }, [records, filter]);

  function openForm() {
    const plate = vehicles[0]?.plate || '';

    setForm({
      ...initialForm,
      plate,
      driver: plate ? getAssignedDriver(plate) : ''
    });

    setFailed([]);
    setShowForm(true);
  }

  function handlePlateChange(plate) {
    const assignedDriver = plate ? getAssignedDriver(plate) : '';

    setForm(previous => ({
      ...previous,
      plate,
      driver: assignedDriver
    }));
  }

  async function saveRecord(event) {
    event.preventDefault();

    if (
      !form.plate ||
      !String(form.driver).trim() ||
      form.km_start === '' ||
      form.km_end === ''
    ) {
      await Swal.fire({
        icon: 'warning',
        title: 'Faltan datos',
        text: 'Completa la placa, el conductor y ambos kilometrajes.'
      });
      return;
    }

    const kmStart = Number(form.km_start);
    const kmEnd = Number(form.km_end);
    const gallons = Number(form.gallons || 0);
    const cost = Number(form.cost || 0);

    if (
      ![kmStart, kmEnd, gallons, cost].every(
        value => Number.isFinite(value) && value >= 0
      )
    ) {
      await Swal.fire({
        icon: 'warning',
        title: 'Revisa los números',
        text: 'Los kilometrajes, galones e importe deben ser números válidos.'
      });
      return;
    }

    if (kmEnd < kmStart) {
      await Swal.fire({
        icon: 'warning',
        title: 'Kilometraje incorrecto',
        text: 'El kilometraje de retorno no puede ser menor que el de salida.'
      });
      return;
    }

    setLoading(true);

    try {
      const traveled = Number((kmEnd - kmStart).toFixed(2));

      const result = await api('/driver/records', {
        method: 'POST',
        body: JSON.stringify({
          plate: form.plate,
          driver: form.driver.trim(),
          km: kmEnd,
          km_start: kmStart,
          km_end: kmEnd,
          km_traveled: traveled,
          route: form.route.trim(),
          gallons,
          cost,
          observations: form.observations.trim(),
          failedChecks: failed
        })
      }, session);

      if (onReload) {
        await onReload();
      }

      setShowForm(false);
      setForm({ ...initialForm });
      setFailed([]);

      const statusLabel = {
        red: 'ROJO',
        yellow: 'AMARILLO',
        green: 'VERDE'
      }[result?.status] || result?.status || 'REGISTRADO';

      await Swal.fire({
        icon: 'success',
        title: 'Inspección guardada',
        text: `Kilómetros recorridos: ${traveled} km. Estado: ${statusLabel}.`
      });
    } catch (error) {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: error.message || 'Ocurrió un error al guardar el registro.'
      });
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const columns = [
      ['recorded_at', 'Fecha'],
      ['vehicle_plate', 'Placa'],
      ['account_name', 'Cuenta'],
      ['created_by_name', 'Registrado por'],
      ['created_by_role', 'Rol del registrador'],
      ['driver_name', 'Conductor'],
      ['km_start', 'Kilometraje de salida'],
      ['km_end', 'Kilometraje de retorno'],
      ['km_traveled', 'Kilómetros recorridos'],
      ['route', 'Ruta'],
      ['gallons', 'Galones'],
      ['fuel_cost', 'Importe S/'],
      ['status', 'Estado'],
      ['observations', 'Observaciones']
    ];

    const escapeCsv = value =>
      '"' + String(value ?? '').replace(/"/g, '""') + '"';

    const rows = filteredRecords.map(record => {
      return columns.map(([key]) => {
        let value = record[key];

        if (key === 'km_end' && value == null) {
          value = record.odometer_km ?? '';
        }

        if (key === 'km_traveled' && value == null) {
          const start = Number(record.km_start);
          const end = Number(record.km_end ?? record.odometer_km);

          value =
            record.km_start != null &&
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            end >= start
              ? Number((end - start).toFixed(2))
              : '';
        }

        if (key === 'recorded_at' && value) {
          value = new Date(value).toLocaleString('es-PE');
        }

        if (key === 'created_by_role') {
          value = roleName[value] || value;
        }

        if (key === 'status') {
          value = ({
            green: 'Verde',
            yellow: 'Amarillo',
            red: 'Rojo'
          })[value] || value;
        }

        return escapeCsv(value);
      }).join(';');
    });

    const csv = [
      columns.map(([, label]) => escapeCsv(label)).join(';'),
      ...rows
    ].join('\r\n');

    const url = URL.createObjectURL(
      new Blob(['\ufeff' + csv], {
        type: 'text/csv;charset=utf-8;'
      })
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = 'registros-flota.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Registros de inspección de flota</h1>
          <p>
            Registra la salida y el retorno de cada unidad,
            consulta los kilómetros recorridos y revisa las inspecciones.
          </p>
        </div>

        <div className="record-actions">
          <button
            type="button"
            className="primary"
            onClick={() =>
              showForm ? setShowForm(false) : openForm()
            }
          >
            {showForm ? 'Cancelar' : '+ Nuevo registro'}
          </button>

          <button
            type="button"
            className="outline"
            onClick={exportCsv}
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {showForm && (
        <form className="panel" onSubmit={saveRecord}>
          <h2>Nueva inspección vehicular</h2>

          <p className="muted">
            Usuario registrador:{' '}
            {session?.user?.name ||
              session?.user?.full_name ||
              session?.user?.email ||
              'Usuario'}
            {' · '}
            {roleName[session?.user?.role] ||
              session?.user?.role ||
              ''}
          </p>

          <div className="form-grid">
            <label>
              Placa de la unidad
              <select
                value={form.plate}
                onChange={event =>
                  handlePlateChange(event.target.value)
                }
                required
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
              Nombre del conductor
              <select
                value={form.driver}
                onChange={event =>
                  setForm(previous => ({
                    ...previous,
                    driver: event.target.value
                  }))
                }
                required
              >
                <option value="">Selecciona un conductor</option>

                {activeDrivers.map(user => (
                  <option key={user.id} value={user.full_name}>
                    {user.full_name}
                  </option>
                ))}
              </select>

              {form.plate && !form.driver && (
                <small className="muted">
                  No se encontró la asignación en los datos recibidos.
                  Puedes elegir el conductor manualmente.
                </small>
              )}
            </label>

            <label>
              Kilometraje de salida (km)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.km_start}
                onChange={event =>
                  setForm(previous => ({
                    ...previous,
                    km_start: event.target.value
                  }))
                }
                placeholder="Ej. 125400"
                required
              />
            </label>

            <label>
              Kilometraje de retorno (km)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.km_end}
                onChange={event =>
                  setForm(previous => ({
                    ...previous,
                    km_end: event.target.value
                  }))
                }
                placeholder="Ej. 125575"
                required
              />
            </label>

            <div className="panel">
              <span className="muted">TOTAL DEL RECORRIDO</span>
              <h2 style={{ marginTop: 8, marginBottom: 4 }}>
                {kmTraveled !== null
                  ? `${kmTraveled.toLocaleString('es-PE')} km`
                  : 'Pendiente'}
              </h2>
              <p className="muted">
                Kilometraje de retorno menos kilometraje de salida.
              </p>
            </div>

            <label>
              Zona / ruta
              <input
                value={form.route}
                onChange={event =>
                  setForm(previous => ({
                    ...previous,
                    route: event.target.value
                  }))
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
                  setForm(previous => ({
                    ...previous,
                    gallons: event.target.value
                  }))
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
                  setForm(previous => ({
                    ...previous,
                    cost: event.target.value
                  }))
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
                    setFailed(previous =>
                      event.target.checked
                        ? previous.filter(item => item !== check)
                        : [...previous, check]
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
                setForm(previous => ({
                  ...previous,
                  observations: event.target.value
                }))
              }
              placeholder="Describe fallas, fugas, ruidos o novedades..."
            />
          </label>

          <div className="record-actions">
            <button
              type="submit"
              className="primary"
              disabled={loading}
            >
              {loading ? 'Guardando…' : 'Guardar inspección'}
            </button>

            <button
              type="button"
              className="outline"
              disabled={loading}
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="panel records-panel">
        <div className="record-search">
          <label htmlFor="driverFilter">
            Buscar por nombre del conductor
            <input
              id="driverFilter"
              type="search"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              placeholder="Escribe una parte del nombre..."
              autoComplete="off"
            />
          </label>

          <div className="search-summary">
            <span className="muted">Registros encontrados</span>
            <strong>{filteredRecords.length}</strong>
          </div>

          {filter && (
            <button
              type="button"
              className="outline"
              onClick={() => setFilter('')}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>

        <RecordTable records={filteredRecords} />
      </div>
    </>
  );
}
