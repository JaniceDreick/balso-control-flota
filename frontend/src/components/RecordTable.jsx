
import React from 'react';
import Status from './Status';
import { fmt, money } from '../utils/formatters';

export default function RecordTable({ records = [], driver = false }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Placa</th>
            {!driver && <th>Registrado por</th>}
            <th>Conductor</th>
            <th>Km</th>
            <th>Ruta</th>
            <th>Galones</th>
            <th>Importe</th>
            <th>Estado</th>
            <th>Observaciones</th>
          </tr>
        </thead>

        <tbody>
          {records.map(record => (
            <tr key={record.id}>
              <td>
                {record.recorded_at
                  ? new Date(record.recorded_at).toLocaleString('es-PE')
                  : '-'}
              </td>
              <td>{record.vehicle_plate || '-'}</td>
              {!driver && (
                <td>
                  {record.created_by_name || record.account_name || '-'}
                </td>
              )}
              <td>{record.driver_name || '-'}</td>
              <td>{fmt(record.odometer_km)}</td>
              <td>{record.route || '-'}</td>
              <td>{fmt(record.gallons)}</td>
              <td>{money(record.fuel_cost)}</td>
              <td>
                <Status value={record.status} />
              </td>
              <td>
                {record.observations || '-'}
                {Array.isArray(record.failed_checks) &&
                  record.failed_checks.length > 0 && (
                    <div className="muted">
                      No conformes: {record.failed_checks.join(', ')}
                    </div>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {records.length === 0 && (
        <p className="muted empty-records">
          No se encontraron registros.
        </p>
      )}
    </div>
  );
}
