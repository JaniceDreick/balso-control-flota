export const roleName = {
  administrador_general: 'Administrador general',
  administrador: 'Administrador',
  conductor: 'Conductor'
};

export const money = value =>
  'S/ ' + Number(value || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

export const fmt = value =>
  Number(value || 0).toLocaleString('es-PE', {
    maximumFractionDigits: 2
  });

export const normalize = value =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const checks = [
  'Aceite motor', 'Refrigerante', 'Frenos', 'Dirección', 'Neumáticos',
  'Luces', 'Fugas visibles', 'Testigos tablero', 'Extintor/EPP', 'Limpieza'
];
