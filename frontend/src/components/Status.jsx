
import React from 'react';

export default function Status({ value }) {
  const statuses = {
    green: { label: 'Correcto', className: 'status-green' },
    yellow: { label: 'Por revisar', className: 'status-yellow' },
    red: { label: 'Alerta', className: 'status-red' }
  };

  const status = statuses[value] || {
    label: value || 'Sin evaluar',
    className: 'status-neutral'
  };

  return (
    <span className={`status ${status.className}`}>
      {status.label}
    </span>
  );
}
