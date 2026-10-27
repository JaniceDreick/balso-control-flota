import React, { useState, useEffect } from 'react';
import Status from '../components/Status';
import { fmt, money } from '../utils/formatters';

export default function Dashboard({ vehicles = [], records = [] }) {
  const kpis = [
    ['Unidades activas', vehicles.length],
    [
      'Costo combustible histórico',
      money(
        vehicles.reduce(
          (s, v) => s + Number(v.historical_fuel_cost || 0),
          0
        )
      )
    ],
    [
      'Galones históricos',
      fmt(
        vehicles.reduce(
          (s, v) => s + Number(v.historical_gallons || 0),
          0
        )
      )
    ],
    ['Registros de conductores', records.length],
    [
      'Alertas mecánicas',
      vehicles.filter(v =>
        ['red', 'yellow'].includes(v.mechanical_status)
      ).length
    ],
    [
      'Alertas documentales',
      vehicles.filter(v =>
        ['red', 'yellow'].includes(v.document_status)
      ).length
    ]
  ];

  const alerts = vehicles.filter(v =>
    ['red', 'yellow'].includes(v.mechanical_status) ||
    ['red', 'yellow'].includes(v.document_status)
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Resumen de flota</h1>
          <p>
            Indicadores calculados con la información almacenada en MySQL.
          </p>
        </div>
      </div>

      <div className="kpis">
        {kpis.map(([label, value]) => (
          <div className="panel kpi" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Estado de flota</h2>

          {vehicles.map(v => (
            <div className="vehicle-line" key={v.plate}>
              <b>{v.plate}</b>
              <span>{v.brand} {v.model}</span>
              <Status value={v.mechanical_status} />
            </div>
          ))}

          {vehicles.length === 0 && (
            <p className="muted">No hay unidades registradas.</p>
          )}
        </div>

        <div className="panel">
          <h2>Alertas prioritarias</h2>

          {alerts.map(v => (
            <div className="alert" key={v.plate}>
              <b>{v.plate}</b>
              <p>{v.notes || 'Revisar estado mecánico/documental.'}</p>
            </div>
          ))}

          {alerts.length === 0 && (
            <p className="muted">
              No hay alertas prioritarias registradas.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
