
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { requireAuth, allowRoles } from './auth.js';

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Configura JWT_SECRET con al menos 32 caracteres en backend/.env');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '2mb' }));

const adminRoles = ['administrador_general', 'administrador'];

const validRoles = [
  'administrador_general',
  'administrador',
  'conductor'
];

const checklistNames = [
  'Aceite motor',
  'Refrigerante',
  'Frenos',
  'Dirección',
  'Neumáticos',
  'Luces',
  'Fugas visibles',
  'Testigos tablero',
  'Extintor/EPP',
  'Limpieza'
];

const criticalChecks = [
  'Frenos',
  'Dirección',
  'Fugas visibles',
  'Testigos tablero'
];

// ======================================================
// FUNCIONES AUXILIARES
// ======================================================

function validDate(value) {
  if (value === null || value === '') return true;

  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function documentStatus(expirationDate) {
  if (!expirationDate) return 'gray';

  const expiration = String(expirationDate).slice(0, 10);

  // Se usa la fecha del servidor MySQL para evitar diferencias
  // de zona horaria entre el navegador y la base de datos.
  return expiration;
}

function documentStatusFromDays(days) {
  if (days === null || days === undefined) return 'gray';
  if (Number(days) < 0) return 'red';
  if (Number(days) <= 30) return 'yellow';
  return 'green';
}

function getDocumentAlert(days) {
  if (days === null || days === undefined) {
    return 'Registrar fecha de vencimiento';
  }

  const remaining = Number(days);

  if (remaining < 0) {
    return `Documento vencido hace ${Math.abs(remaining)} días`;
  }

  if (remaining === 0) return 'El documento vence hoy';

  if (remaining <= 7) {
    return `ALERTA CRÍTICA: vence en ${remaining} días`;
  }

  if (remaining <= 30) {
    return `Próximo a vencer en ${remaining} días`;
  }

  return 'Documento vigente';
}

// ======================================================
// SALUD DE LA API
// ======================================================

app.get('/api', (_req, res) => {
  res.json({
    message: 'API BALSO Control de Flota funcionando.'
  });
});

// ======================================================
// INICIO DE SESIÓN
// ======================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        message: 'Ingresa correo y contraseña.'
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, full_name, email, password_hash, role, active
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    const user = rows[0];

    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: 'Credenciales incorrectas o usuario desactivado.'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error de inicio de sesión:', error);

    res.status(500).json({
      message: 'No se pudo iniciar sesión.'
    });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ======================================================
// VEHÍCULOS
// ======================================================

app.get('/api/vehicles', requireAuth, async (req, res) => {
  try {
    const sql = `
      SELECT
        v.id,
        v.plate,
        v.brand,
        v.model,
        v.year,
        v.vin,
        v.engine,
        v.owner_name,
        v.site,
        COALESCE(u.full_name, v.assigned_driver) AS assigned_driver,
        v.current_km,
        v.historical_gallons,
        v.historical_fuel_cost,
        v.historical_efficiency,
        v.mechanical_status,
        v.document_status,
        v.notes,
        v.image_data
      FROM vehicles v
      LEFT JOIN driver_assignments da ON da.vehicle_id = v.id
      LEFT JOIN users u ON u.id = da.driver_user_id
      WHERE v.active = 1
      ${req.user.role === 'conductor' ? 'AND da.driver_user_id = ?' : ''}
      ORDER BY v.plate
    `;

    const [rows] = req.user.role === 'conductor'
      ? await pool.execute(sql, [req.user.id])
      : await pool.query(sql);

    res.json(rows);
  } catch (error) {
    console.error('Error consultando vehículos:', error);

    res.status(500).json({
      message: 'Error consultando flota.'
    });
  }
});

// ======================================================
// VEHÍCULOS: REGISTRAR
// ======================================================

app.post(
  '/api/vehicles',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const plate = String(req.body.plate || '')
        .trim()
        .toUpperCase();

      if (!plate) {
        return res.status(400).json({
          message: 'La placa de la unidad es obligatoria.'
        });
      }

      const brand = String(req.body.brand || '').trim() || null;
      const model = String(req.body.model || '').trim() || null;
      const year = req.body.year ? Number(req.body.year) : null;
      const vin = String(req.body.vin || '').trim() || null;
      const engine = String(req.body.engine || '').trim() || null;
      const ownerName = String(req.body.owner_name || '').trim() || null;
      const site = String(req.body.site || '').trim() || null;
      const assignedDriver =
        String(req.body.assigned_driver || '').trim() || null;

      const currentKm = req.body.current_km === '' ||
        req.body.current_km == null
        ? null
        : Number(req.body.current_km);

      const notes = String(req.body.notes || '').trim() || null;
      const imageData = req.body.image_data || null;

      if (
        year !== null &&
        (!Number.isInteger(year) || year < 1900 || year > 2100)
      ) {
        return res.status(400).json({
          message: 'El año de fabricación no es válido.'
        });
      }

      if (
        currentKm !== null &&
        (!Number.isFinite(currentKm) || currentKm < 0)
      ) {
        return res.status(400).json({
          message: 'El kilometraje debe ser un número igual o mayor que cero.'
        });
      }

      const [existing] = await pool.execute(
        'SELECT id FROM vehicles WHERE plate = ? LIMIT 1',
        [plate]
      );

      if (existing.length) {
        return res.status(409).json({
          message: 'Ya existe una unidad registrada con esa placa.'
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO vehicles (
          plate,
          brand,
          model,
          year,
          vin,
          engine,
          owner_name,
          site,
          assigned_driver,
          current_km,
          notes,
          image_data,
          active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          plate,
          brand,
          model,
          year,
          vin,
          engine,
          ownerName,
          site,
          assignedDriver,
          currentKm,
          notes,
          imageData
        ]
      );

      return res.status(201).json({
        id: result.insertId,
        message: 'Unidad vehicular registrada correctamente.'
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: 'Ya existe una unidad registrada con esa placa.'
        });
      }

      console.error('Error registrando vehículo:', error);

      return res.status(500).json({
        message: 'No se pudo registrar la unidad vehicular. Revisa las columnas de la tabla vehicles.'
      });
    }
  }
);  

// ======================================================
// MANTENIMIENTO
// ======================================================

app.get(
  '/api/maintenance',
  requireAuth,
  allowRoles(...adminRoles),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM maintenance_rules ORDER BY vehicle_plate, item'
      );

      res.json(rows);
    } catch (error) {
      console.error('Error consultando mantenimiento:', error);

      res.status(500).json({
        message: 'Error consultando mantenimiento.'
      });
    }
  }
);



// ======================================================
// BÚSQUEDA WEB DE ESPECIFICACIONES TÉCNICAS
// Devuelve enlaces de búsqueda basados en los datos de la unidad.
// No guarda datos ni afirma que los resultados estén verificados.
// ======================================================
app.get('/api/maintenance/search-web', requireAuth, allowRoles(...adminRoles), async (req, res) => {
  try {
    const plate = String(req.query.plate || '').trim().toUpperCase();
    if (!plate) {
      return res.status(400).json({ message: 'Selecciona una unidad vehicular.' });
    }

    const [rows] = await pool.execute(
      `SELECT plate, brand, model, year, engine
       FROM vehicles
       WHERE UPPER(plate) = ? AND active = 1
       LIMIT 1`,
      [plate]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No se encontró una unidad activa con esa placa.' });
    }

    const vehicle = rows[0];
    const identity = [vehicle.brand, vehicle.model, vehicle.year, vehicle.engine]
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
      .map(value => String(value).trim())
      .join(' ');
    const query = [identity, 'manual técnico especificaciones mantenimiento'].filter(Boolean).join(' ');
    const q = encodeURIComponent(query);
    const pdfQ = encodeURIComponent(`${query} filetype:pdf`);
    const brand = String(vehicle.brand || '').toLowerCase();
    const manufacturerQuery = brand.includes('hyundai')
      ? `site:hyundai.com ${query}`
      : `${vehicle.brand || ''} fabricante manual técnico ${vehicle.model || ''}`.trim();

    return res.json({
      vehicle,
      query,
      sources: [
        { name: 'Buscar en Google', url: `https://www.google.com/search?q=${q}` },
        { name: 'Buscar en Bing', url: `https://www.bing.com/search?q=${q}` },
        { name: 'Buscar manuales PDF', url: `https://www.google.com/search?q=${pdfQ}` },
        { name: 'Buscar fuente del fabricante', url: `https://www.google.com/search?q=${encodeURIComponent(manufacturerQuery)}` }
      ]
    });
  } catch (error) {
    console.error('Error preparando búsqueda web de especificaciones:', error);
    return res.status(500).json({ message: 'No se pudo preparar la búsqueda técnica.' });
  }
});

/* =====================================================
   MANTENIMIENTO: PROGRAMACIÓN Y ALERTAS
   Agregar después de la ruta GET /api/maintenance
===================================================== */

// Alertas automáticas generadas por inspecciones y seguimiento persistente.
app.get('/api/maintenance/alerts', requireAuth, allowRoles(...adminRoles), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT dr.id AS record_id, dr.vehicle_plate, dr.driver_name, dr.recorded_at,
             dr.odometer_km AS current_km, dr.failed_checks, dr.observations, dr.status
      FROM driver_records dr
      INNER JOIN (SELECT vehicle_plate, MAX(id) AS latest_id FROM driver_records GROUP BY vehicle_plate) latest
        ON latest.latest_id = dr.id
      INNER JOIN vehicles v ON v.plate = dr.vehicle_plate AND v.active = 1
      ORDER BY dr.recorded_at DESC
    `);
    const [tracked] = await pool.query('SELECT record_id, vehicle_plate, component, status, notes, updated_at FROM maintenance_alert_tracking');
    const tracking = new Map(tracked.map(t => [`${t.record_id}::${String(t.component).trim().toLowerCase()}`, t]));
    const alerts = [];
    for (const row of rows) {
      let failed = row.failed_checks;
      if (typeof failed === 'string') { try { failed = JSON.parse(failed); } catch { failed = []; } }
      if (!Array.isArray(failed)) failed = [];
      const components = new Map();
      for (const check of failed) {
        const name = typeof check === 'string' ? check : (check?.name || check?.item || check?.component || '');
        if (name) components.set(String(name).trim(), `La inspección detectó una observación en ${String(name).trim()}.`);
      }
      const obs = String(row.observations || '');
      const patterns = [
        ['Frenos', /freno/i], ['Dirección', /direcci[oó]n/i], ['Neumáticos', /neum[aá]tic|llanta/i],
        ['Aceite motor', /aceite/i], ['Refrigerante', /refrigerante|temperatura/i], ['Fugas visibles', /fuga|goteo/i],
        ['Testigos tablero', /testigo|luz de tablero/i], ['Luces', /luces?|faros/i]
      ];
      for (const [name, regex] of patterns) if (regex.test(obs) && !components.has(name)) components.set(name, obs);
      for (const [component, message] of components) {
        const t = tracking.get(`${row.record_id}::${component.toLowerCase()}`);
        const critical = /freno|direcci[oó]n|fuga|testigo/i.test(component);
        alerts.push({
          id: `check-${row.record_id}-${component}`, record_id: Number(row.record_id), vehicle_plate: row.vehicle_plate,
          driver_name: row.driver_name, recorded_at: row.recorded_at, current_km: Number(row.current_km),
          component, priority: critical ? 'red' : 'yellow', title: `${component} requiere revisión`, message,
          recommendation: critical ? 'Revisar antes de continuar operando la unidad.' : 'Programar revisión preventiva.',
          source: 'driver_record', status: t?.status || 'pendiente', notes: t?.notes || '', updated_at: t?.updated_at || null
        });
      }
    }
    alerts.sort((a,b) => (a.priority === b.priority ? new Date(b.recorded_at)-new Date(a.recorded_at) : a.priority === 'red' ? -1 : 1));
    res.json(alerts);
  } catch (error) {
    console.error('Error consultando alertas automáticas:', error);
    res.status(500).json({ message: 'No se pudieron consultar las alertas automáticas.' });
  }
});

app.get('/api/maintenance/alert-tracking', requireAuth, allowRoles(...adminRoles), async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT t.*, u.full_name AS updated_by_name
      FROM maintenance_alert_tracking t LEFT JOIN users u ON u.id = t.updated_by_user_id
      ORDER BY t.updated_at DESC`);
    res.json(rows);
  } catch (error) {
    console.error('Error consultando seguimiento de alertas:', error);
    res.status(500).json({ message: 'No se pudo consultar el historial de alertas.' });
  }
});

app.patch('/api/maintenance/alert-tracking', requireAuth, allowRoles(...adminRoles), async (req, res) => {
  try {
    const recordId = Number(req.body.record_id);
    const vehiclePlate = String(req.body.vehicle_plate || '').trim().toUpperCase();
    const component = String(req.body.component || '').trim();
    const status = String(req.body.status || 'pendiente');
    const notes = String(req.body.notes || '').trim() || null;
    const allowed = ['pendiente', 'programado', 'en_mantenimiento', 'resuelta'];
    if (!Number.isInteger(recordId) || recordId < 1 || !vehiclePlate || !component || !allowed.includes(status)) {
      return res.status(400).json({ message: 'Los datos de seguimiento de la alerta no son válidos.' });
    }
    const [records] = await pool.execute('SELECT id FROM driver_records WHERE id = ? AND vehicle_plate = ? LIMIT 1', [recordId, vehiclePlate]);
    if (!records.length) return res.status(404).json({ message: 'No se encontró el registro de inspección relacionado con la alerta.' });
    await pool.execute(`INSERT INTO maintenance_alert_tracking
      (record_id, vehicle_plate, component, status, notes, updated_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE vehicle_plate = VALUES(vehicle_plate), status = VALUES(status), notes = VALUES(notes), updated_by_user_id = VALUES(updated_by_user_id), updated_at = CURRENT_TIMESTAMP`,
      [recordId, vehiclePlate, component, status, notes, req.user.id]);
    res.json({ message: 'Seguimiento de alerta guardado correctamente.' });
  } catch (error) {
    console.error('Error guardando seguimiento de alerta:', error);
    res.status(500).json({ message: 'No se pudo guardar el seguimiento de la alerta. Verifica que el ENUM status admita el estado programado.' });
  }
});

// Consultar mantenimientos programados y calcular alertas
app.get(
  '/api/maintenance/schedules',
  requireAuth,
  allowRoles(...adminRoles),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          s.*,
          v.brand,
          v.model,
          v.current_km,
          DATEDIFF(s.next_service_date, CURDATE()) AS days_remaining,
          (s.next_service_km - v.current_km) AS km_remaining
        FROM maintenance_schedules s
        INNER JOIN vehicles v ON v.plate = s.vehicle_plate
        WHERE s.active = 1
        ORDER BY s.next_service_date ASC, s.next_service_km ASC
      `);

      const schedules = rows.map(item => {
        const days = item.days_remaining == null
          ? null
          : Number(item.days_remaining);

        const kmRemaining = item.km_remaining == null
          ? null
          : Number(item.km_remaining);

        let alertStatus = 'green';
        let alertMessage = 'Mantenimiento al día';

        const overdueByKm =
          kmRemaining !== null && kmRemaining <= 0;

        const overdueByDate =
          days !== null && days <= 0;

        const soonByKm =
          kmRemaining !== null && kmRemaining <= 500;

        const soonByDate =
          days !== null && days <= 30;

        if (overdueByKm || overdueByDate) {
          alertStatus = 'red';
          alertMessage = 'Mantenimiento vencido';
        } else if (soonByKm || soonByDate) {
          alertStatus = 'yellow';
          alertMessage = 'Mantenimiento próximo';
        }

        return {
          ...item,
          current_km: Number(item.current_km),
          km_remaining: kmRemaining,
          days_remaining: days,
          alert_status: alertStatus,
          alert_message: alertMessage
        };
      });

      res.json(schedules);
    } catch (error) {
      console.error('Error consultando programación:', error);

      res.status(500).json({
        message: 'No se pudo consultar la programación de mantenimiento.'
      });
    }
  }
);


// Programar un mantenimiento
app.post(
  '/api/maintenance/schedules',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const vehiclePlate = String(req.body.vehicle_plate || '')
        .trim()
        .toUpperCase();

      const maintenanceName = String(
        req.body.maintenance_name || ''
      ).trim();

      const description =
        String(req.body.description || '').trim() || null;

      const intervalKm =
        req.body.interval_km === '' ||
        req.body.interval_km == null
          ? null
          : Number(req.body.interval_km);

      const intervalDays =
        req.body.interval_days === '' ||
        req.body.interval_days == null
          ? null
          : Number(req.body.interval_days);

      const lastServiceKm =
        req.body.last_service_km === '' ||
        req.body.last_service_km == null
          ? null
          : Number(req.body.last_service_km);

      const lastServiceDate = req.body.last_service_date || null;

      let nextServiceKm =
        req.body.next_service_km === '' ||
        req.body.next_service_km == null
          ? null
          : Number(req.body.next_service_km);

      let nextServiceDate = req.body.next_service_date || null;

      if (!vehiclePlate || !maintenanceName) {
        return res.status(400).json({
          message: 'Selecciona la unidad e indica el mantenimiento.'
        });
      }

      if (
        ![intervalKm, intervalDays, lastServiceKm, nextServiceKm]
          .every(value => value === null ||
            (Number.isFinite(value) && value >= 0))
      ) {
        return res.status(400).json({
          message: 'Los intervalos y kilometrajes deben ser números válidos.'
        });
      }

      if (
        !validDate(lastServiceDate) ||
        !validDate(nextServiceDate)
      ) {
        return res.status(400).json({
          message: 'Las fechas del mantenimiento no son válidas.'
        });
      }

      if (
        intervalKm === null &&
        intervalDays === null &&
        nextServiceKm === null &&
        !nextServiceDate
      ) {
        return res.status(400).json({
          message: 'Indica un intervalo o una fecha para el próximo servicio.'
        });
      }

      if (
        nextServiceKm === null &&
        intervalKm !== null &&
        lastServiceKm !== null
      ) {
        nextServiceKm = lastServiceKm + intervalKm;
      }

      if (
        !nextServiceDate &&
        intervalDays !== null &&
        lastServiceDate
      ) {
        const date = new Date(`${lastServiceDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + intervalDays);
        nextServiceDate = date.toISOString().slice(0, 10);
      }

      const [vehicles] = await pool.execute(
        'SELECT plate FROM vehicles WHERE plate = ? AND active = 1',
        [vehiclePlate]
      );

      if (!vehicles.length) {
        return res.status(400).json({
          message: 'La unidad no existe o está inactiva.'
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO maintenance_schedules (
          vehicle_plate,
          maintenance_name,
          description,
          interval_km,
          interval_days,
          last_service_km,
          last_service_date,
          next_service_km,
          next_service_date,
          active,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          vehiclePlate,
          maintenanceName,
          description,
          intervalKm,
          intervalDays,
          lastServiceKm,
          lastServiceDate,
          nextServiceKm,
          nextServiceDate,
          req.user.id
        ]
      );

      const alertRecordId = req.body.alert_record_id ? Number(req.body.alert_record_id) : null;
      const alertComponent = String(req.body.alert_component || '').trim();
      if (alertRecordId && alertComponent) {
        await pool.execute(`INSERT INTO maintenance_alert_tracking
          (record_id, vehicle_plate, component, status, notes, updated_by_user_id)
          VALUES (?, ?, ?, 'programado', ?, ?)
          ON DUPLICATE KEY UPDATE vehicle_plate = VALUES(vehicle_plate), status = 'programado',
          notes = COALESCE(VALUES(notes), notes), updated_by_user_id = VALUES(updated_by_user_id), updated_at = CURRENT_TIMESTAMP`,
          [alertRecordId, vehiclePlate, alertComponent, req.body.alert_notes || null, req.user.id]);
      }

      res.status(201).json({
        id: result.insertId,
        message: 'Mantenimiento programado correctamente.'
      });
    } catch (error) {
      console.error('Error programando mantenimiento:', error);

      res.status(500).json({
        message: 'No se pudo programar el mantenimiento.'
      });
    }
  }
);


// Editar un mantenimiento programado
app.patch(
  '/api/maintenance/schedules/:id',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: 'Identificador de mantenimiento no válido.'
        });
      }

      const [rows] = await pool.execute(
        'SELECT * FROM maintenance_schedules WHERE id = ?',
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          message: 'Mantenimiento programado no encontrado.'
        });
      }

      const old = rows[0];

      const vehiclePlate = req.body.vehicle_plate !== undefined
        ? String(req.body.vehicle_plate || '').trim().toUpperCase()
        : old.vehicle_plate;

      const maintenanceName = req.body.maintenance_name !== undefined
        ? String(req.body.maintenance_name || '').trim()
        : old.maintenance_name;

      const description = req.body.description !== undefined
        ? String(req.body.description || '').trim() || null
        : old.description;

      const intervalKm = req.body.interval_km !== undefined
        ? (req.body.interval_km === '' || req.body.interval_km === null
            ? null : Number(req.body.interval_km))
        : old.interval_km;

      const intervalDays = req.body.interval_days !== undefined
        ? (req.body.interval_days === '' || req.body.interval_days === null
            ? null : Number(req.body.interval_days))
        : old.interval_days;

      const lastServiceKm = req.body.last_service_km !== undefined
        ? (req.body.last_service_km === '' || req.body.last_service_km === null
            ? null : Number(req.body.last_service_km))
        : old.last_service_km;

      const lastServiceDate = req.body.last_service_date !== undefined
        ? (req.body.last_service_date || null)
        : old.last_service_date
          ? String(old.last_service_date).slice(0, 10)
          : null;

      const nextServiceKm = req.body.next_service_km !== undefined
        ? (req.body.next_service_km === '' || req.body.next_service_km === null
            ? null : Number(req.body.next_service_km))
        : old.next_service_km;

      const nextServiceDate = req.body.next_service_date !== undefined
        ? (req.body.next_service_date || null)
        : old.next_service_date
          ? String(old.next_service_date).slice(0, 10)
          : null;

      const active = req.body.active !== undefined
        ? (req.body.active ? 1 : 0)
        : Number(old.active);

      if (!vehiclePlate || !maintenanceName) {
        return res.status(400).json({
          message: 'La placa y el nombre del mantenimiento son obligatorios.'
        });
      }

      if (
        ![intervalKm, intervalDays, lastServiceKm, nextServiceKm]
          .every(value => value === null ||
            (Number.isFinite(Number(value)) && Number(value) >= 0))
      ) {
        return res.status(400).json({
          message: 'Los intervalos y kilometrajes no son válidos.'
        });
      }

      if (
        !validDate(lastServiceDate) ||
        !validDate(nextServiceDate)
      ) {
        return res.status(400).json({
          message: 'Las fechas del mantenimiento no son válidas.'
        });
      }

      const [vehicles] = await pool.execute(
        'SELECT plate FROM vehicles WHERE plate = ? AND active = 1',
        [vehiclePlate]
      );

      if (!vehicles.length) {
        return res.status(400).json({
          message: 'La unidad no existe o está inactiva.'
        });
      }

      await pool.execute(
        `UPDATE maintenance_schedules
         SET vehicle_plate = ?,
             maintenance_name = ?,
             description = ?,
             interval_km = ?,
             interval_days = ?,
             last_service_km = ?,
             last_service_date = ?,
             next_service_km = ?,
             next_service_date = ?,
             active = ?
         WHERE id = ?`,
        [
          vehiclePlate,
          maintenanceName,
          description,
          intervalKm,
          intervalDays,
          lastServiceKm,
          lastServiceDate,
          nextServiceKm,
          nextServiceDate,
          active,
          id
        ]
      );

      res.json({
        message: 'Programación de mantenimiento actualizada correctamente.'
      });
    } catch (error) {
      console.error('Error editando programación:', error);

      res.status(500).json({
        message: 'No se pudo actualizar la programación.'
      });
    }
  }
);


// Consultar historial de servicios realizados
app.get(
  '/api/maintenance/history',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const plate = req.query.plate
        ? String(req.query.plate).trim().toUpperCase()
        : null;

      let sql = `
        SELECT
          h.*,
          u.full_name AS registered_by_name
        FROM maintenance_history h
        LEFT JOIN users u ON u.id = h.registered_by_user_id
      `;

      const params = [];

      if (plate) {
        sql += ' WHERE h.vehicle_plate = ?';
        params.push(plate);
      }

      sql += ' ORDER BY h.service_date DESC, h.id DESC LIMIT 1000';

      const [rows] = await pool.execute(sql, params);
      res.json(rows);
    } catch (error) {
      console.error('Error consultando historial de mantenimiento:', error);

      res.status(500).json({
        message: 'No se pudo consultar el historial de mantenimiento.'
      });
    }
  }
);


// Registrar un servicio realizado y actualizar su programación
app.post(
  '/api/maintenance/history',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    let conn;

    try {
      const scheduleId = req.body.schedule_id
        ? Number(req.body.schedule_id)
        : null;

      const vehiclePlate = String(req.body.vehicle_plate || '')
        .trim()
        .toUpperCase();

      const maintenanceName = String(
        req.body.maintenance_name || ''
      ).trim();

      const serviceDate = req.body.service_date || '';
      const serviceKm = Number(req.body.service_km);
      const cost = Number(req.body.cost ?? 0);

      const description =
        String(req.body.description || '').trim() || null;

      const workshop =
        String(req.body.workshop || '').trim() || null;

      const observations =
        String(req.body.observations || '').trim() || null;

      let nextServiceKm =
        req.body.next_service_km === '' ||
        req.body.next_service_km == null
          ? null
          : Number(req.body.next_service_km);

      let nextServiceDate = req.body.next_service_date || null;

      if (
        !vehiclePlate ||
        !maintenanceName ||
        !validDate(serviceDate) ||
        !serviceDate ||
        !Number.isFinite(serviceKm) ||
        serviceKm < 0 ||
        !Number.isFinite(cost) ||
        cost < 0
      ) {
        return res.status(400).json({
          message: 'Revisa la unidad, el servicio, la fecha, el kilometraje y el costo.'
        });
      }

      if (
        (nextServiceKm !== null &&
          (!Number.isFinite(nextServiceKm) || nextServiceKm < serviceKm)) ||
        !validDate(nextServiceDate)
      ) {
        return res.status(400).json({
          message: 'El próximo kilometraje o la próxima fecha no son válidos.'
        });
      }

      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [vehicles] = await conn.execute(
        'SELECT plate, current_km FROM vehicles WHERE plate = ? AND active = 1 FOR UPDATE',
        [vehiclePlate]
      );

      if (!vehicles.length) {
        await conn.rollback();

        return res.status(400).json({
          message: 'La unidad no existe o está inactiva.'
        });
      }

      let schedule = null;

      if (scheduleId !== null) {
        if (!Number.isInteger(scheduleId) || scheduleId < 1) {
          await conn.rollback();

          return res.status(400).json({
            message: 'Programación de mantenimiento no válida.'
          });
        }

        const [schedules] = await conn.execute(
          'SELECT * FROM maintenance_schedules WHERE id = ? AND vehicle_plate = ? FOR UPDATE',
          [scheduleId, vehiclePlate]
        );

        if (!schedules.length) {
          await conn.rollback();

          return res.status(400).json({
            message: 'La programación no corresponde a la unidad seleccionada.'
          });
        }

        schedule = schedules[0];

        if (nextServiceKm === null && schedule.interval_km !== null) {
          nextServiceKm = serviceKm + Number(schedule.interval_km);
        }

        if (!nextServiceDate && schedule.interval_days !== null) {
          const date = new Date(`${serviceDate}T00:00:00Z`);
          date.setUTCDate(
            date.getUTCDate() + Number(schedule.interval_days)
          );
          nextServiceDate = date.toISOString().slice(0, 10);
        }
      }

      const [result] = await conn.execute(
        `INSERT INTO maintenance_history (
          schedule_id,
          vehicle_plate,
          maintenance_name,
          service_date,
          service_km,
          description,
          workshop,
          cost,
          observations,
          next_service_km,
          next_service_date,
          registered_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          scheduleId,
          vehiclePlate,
          maintenanceName,
          serviceDate,
          serviceKm,
          description,
          workshop,
          cost,
          observations,
          nextServiceKm,
          nextServiceDate,
          req.user.id
        ]
      );

      if (scheduleId !== null) {
        await conn.execute(
          `UPDATE maintenance_schedules
           SET last_service_km = ?,
               last_service_date = ?,
               next_service_km = ?,
               next_service_date = ?
           WHERE id = ?`,
          [
            serviceKm,
            serviceDate,
            nextServiceKm,
            nextServiceDate,
            scheduleId
          ]
        );
      }

      await conn.execute(
        `UPDATE vehicles
         SET current_km = GREATEST(COALESCE(current_km, 0), ?)
         WHERE plate = ?`,
        [serviceKm, vehiclePlate]
      );

      // Si se registró el servicio de una programación, cerrar la alerta de igual componente.
      if (scheduleId !== null && schedule) {
        await conn.execute(
          `UPDATE maintenance_alert_tracking
           SET status = 'resuelta', updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE vehicle_plate = ? AND LOWER(component) = LOWER(?) AND status IN ('programado', 'en_mantenimiento', 'pendiente')`,
          [req.user.id, vehiclePlate, schedule.maintenance_name]
        );
      }

      await conn.commit();

      res.status(201).json({
        id: result.insertId,
        message: 'Servicio registrado correctamente.'
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error('Error revirtiendo servicio:', rollbackError);
        }
      }

      console.error('Error registrando servicio:', error);

      res.status(500).json({
        message: 'No se pudo registrar el servicio de mantenimiento.'
      });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ======================================================
// DOCUMENTOS: CONSULTAR CON ALERTAS AUTOMÁTICAS
// ======================================================

app.get(
  '/api/documents',
  requireAuth,
  allowRoles(...adminRoles),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          d.*,
          u.full_name AS responsible_name,
          DATEDIFF(d.expiration_date, CURDATE()) AS days_remaining
        FROM vehicle_documents d
        LEFT JOIN users u ON u.id = d.responsible_user_id
        ORDER BY
          CASE
            WHEN d.expiration_date IS NOT NULL
              AND d.expiration_date < CURDATE() THEN 0
            WHEN d.expiration_date IS NOT NULL
              AND d.expiration_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1
            WHEN d.expiration_date IS NOT NULL
              AND d.expiration_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 2
            ELSE 3
          END,
          d.expiration_date ASC,
          d.vehicle_plate ASC
      `);

      const documents = rows.map(doc => {
        const days = doc.days_remaining === null
          ? null
          : Number(doc.days_remaining);

        const status = documentStatusFromDays(days);

        return {
          ...doc,
          status,
          calculated_status: status,
          expiration_alert: getDocumentAlert(days)
        };
      });

      res.json(documents);
    } catch (error) {
      console.error('Error consultando documentos:', error);

      res.status(500).json({
        message: 'Error consultando documentos. Comprueba que existan las columnas issue_date y expiration_date.'
      });
    }
  }
);

// ======================================================
// DOCUMENTOS: REGISTRAR
// ======================================================

app.post(
  '/api/documents',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const vehiclePlate = String(req.body.vehicle_plate || '')
        .trim()
        .toUpperCase();

      const documentName = String(req.body.document_name || '').trim();
      const issueDate = req.body.issue_date || null;
      const expirationDate = req.body.expiration_date || null;
      const actionRequired =
        String(req.body.action_required || '').trim() || null;
      const evidenceUrl =
        String(req.body.evidence_url || '').trim() || null;

      if (!vehiclePlate || !documentName) {
        return res.status(400).json({
          message: 'Selecciona una unidad e indica el nombre del documento.'
        });
      }

      if (
        !validDate(issueDate) ||
        !validDate(expirationDate)
      ) {
        return res.status(400).json({
          message: 'Las fechas no tienen un formato válido.'
        });
      }

      if (
        issueDate &&
        expirationDate &&
        expirationDate < issueDate
      ) {
        return res.status(400).json({
          message: 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.'
        });
      }

      const [vehicles] = await pool.execute(
        'SELECT plate FROM vehicles WHERE plate = ? LIMIT 1',
        [vehiclePlate]
      );

      if (!vehicles.length) {
        return res.status(400).json({
          message: 'La placa indicada no existe.'
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO vehicle_documents (
          vehicle_plate,
          document_name,
          issue_date,
          expiration_date,
          status,
          action_required,
          checked_at,
          evidence_url,
          responsible_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
        [
          vehiclePlate,
          documentName,
          issueDate,
          expirationDate,
          documentStatusFromDays(
            expirationDate
              ? Math.round(
                  (Date.parse(`${expirationDate}T00:00:00Z`) -
                   Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
                  86400000
                )
              : null
          ),
          actionRequired,
          evidenceUrl,
          req.user.id
        ]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Documento registrado correctamente.'
      });
    } catch (error) {
      console.error('Error registrando documento:', error);

      res.status(500).json({
        message: 'No se pudo registrar el documento.'
      });
    }
  }
);

// ======================================================
// DOCUMENTOS: EDITAR
// ======================================================

app.patch(
  '/api/documents/:id',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: 'Identificador de documento no válido.'
        });
      }

      const [existingRows] = await pool.execute(
        'SELECT * FROM vehicle_documents WHERE id = ? LIMIT 1',
        [id]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          message: 'Documento no encontrado.'
        });
      }

      const existing = existingRows[0];

      const vehiclePlate = req.body.vehicle_plate !== undefined
        ? String(req.body.vehicle_plate || '').trim().toUpperCase()
        : existing.vehicle_plate;

      const documentName = req.body.document_name !== undefined
        ? String(req.body.document_name || '').trim()
        : existing.document_name;

      const issueDate = req.body.issue_date !== undefined
        ? (req.body.issue_date || null)
        : existing.issue_date
          ? String(existing.issue_date).slice(0, 10)
          : null;

      const expirationDate = req.body.expiration_date !== undefined
        ? (req.body.expiration_date || null)
        : existing.expiration_date
          ? String(existing.expiration_date).slice(0, 10)
          : null;

      const actionRequired = req.body.action_required !== undefined
        ? String(req.body.action_required || '').trim() || null
        : existing.action_required;

      const evidenceUrl = req.body.evidence_url !== undefined
        ? String(req.body.evidence_url || '').trim() || null
        : existing.evidence_url;

      if (!vehiclePlate || !documentName) {
        return res.status(400).json({
          message: 'La placa y el nombre del documento son obligatorios.'
        });
      }

      if (
        !validDate(issueDate) ||
        !validDate(expirationDate)
      ) {
        return res.status(400).json({
          message: 'Las fechas no tienen un formato válido.'
        });
      }

      if (
        issueDate &&
        expirationDate &&
        expirationDate < issueDate
      ) {
        return res.status(400).json({
          message: 'La fecha de vencimiento no puede ser anterior a la fecha de emisión.'
        });
      }

      const [vehicles] = await pool.execute(
        'SELECT plate FROM vehicles WHERE plate = ? LIMIT 1',
        [vehiclePlate]
      );

      if (!vehicles.length) {
        return res.status(400).json({
          message: 'La placa indicada no existe.'
        });
      }

      const [dateRows] = await pool.execute(
        'SELECT DATEDIFF(?, CURDATE()) AS days_remaining',
        [expirationDate]
      );

      const days = expirationDate
        ? Number(dateRows[0].days_remaining)
        : null;

      const status = documentStatusFromDays(days);

      await pool.execute(
        `UPDATE vehicle_documents
         SET
           vehicle_plate = ?,
           document_name = ?,
           issue_date = ?,
           expiration_date = ?,
           status = ?,
           action_required = ?,
           evidence_url = ?,
           checked_at = CURDATE(),
           responsible_user_id = ?
         WHERE id = ?`,
        [
          vehiclePlate,
          documentName,
          issueDate,
          expirationDate,
          status,
          actionRequired,
          evidenceUrl,
          req.user.id,
          id
        ]
      );

      res.json({
        message: 'Documento actualizado correctamente.'
      });
    } catch (error) {
      console.error('Error actualizando documento:', error);

      res.status(500).json({
        message: 'No se pudo actualizar el documento.'
      });
    }
  }
);

// ======================================================
// INSPECCIONES: CONSULTAR TODAS (ADMINISTRADORES)
// ======================================================

app.get(
  '/api/records',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    try {
      const { from, to, plate } = req.query;

      let sql = `
        SELECT
          r.*,
          creator.full_name AS created_by_name,
          r.created_by_role,
          u.full_name AS account_name
        FROM driver_records r
        LEFT JOIN users creator ON creator.id = r.created_by_user_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE 1 = 1
      `;

      const params = [];

      if (from) {
        sql += ' AND r.recorded_at >= ?';
        params.push(`${from} 00:00:00`);
      }

      if (to) {
        sql += ' AND r.recorded_at < DATE_ADD(?, INTERVAL 1 DAY)';
        params.push(`${to} 00:00:00`);
      }

      if (plate) {
        sql += ' AND r.vehicle_plate = ?';
        params.push(String(plate).trim().toUpperCase());
      }

      sql += ' ORDER BY r.recorded_at DESC LIMIT 500';

      const [rows] = await pool.execute(sql, params);

      res.json(rows);
    } catch (error) {
      console.error('Error consultando inspecciones:', error);

      res.status(500).json({
        message: 'Error consultando registros.'
      });
    }
  }
);

// ======================================================
// INSPECCIONES: CONSULTAR REGISTROS DEL CONDUCTOR
// ======================================================

app.get(
  '/api/driver/records',
  requireAuth,
  allowRoles(...validRoles),
  async (req, res) => {
    try {
      let sql = `
        SELECT
          r.*,
          creator.full_name AS created_by_name,
          r.created_by_role
        FROM driver_records r
        LEFT JOIN users creator ON creator.id = r.created_by_user_id
      `;

      const params = [];

      if (req.user.role === 'conductor') {
        sql += ' WHERE r.user_id = ?';
        params.push(req.user.id);
      }

      sql += ' ORDER BY r.recorded_at DESC LIMIT 500';

      const [rows] = await pool.execute(sql, params);

      res.json(rows);
    } catch (error) {
      console.error('Error consultando registros del conductor:', error);

      res.status(500).json({
        message: 'Error consultando registros.'
      });
    }
  }
);

// ======================================================
// INSPECCIONES: REGISTRAR
// ======================================================

app.post(
  '/api/driver/records',
  requireAuth,
  allowRoles(...validRoles),
  async (req, res) => {
    const body = req.body || {};

    const plate = String(body.plate || '').trim().toUpperCase();
    const km = Number(body.km);
    const gallons = Number(body.gallons ?? 0);
    const cost = Number(body.cost ?? 0);
    const requestedDriver = String(body.driver || '').trim();
    const route = String(body.route || '').trim() || null;
    const observations = String(body.observations || '').trim() || null;

    if (
      !plate ||
      !Number.isFinite(km) ||
      km < 0 ||
      !Number.isFinite(gallons) ||
      gallons < 0 ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      return res.status(400).json({
        message: 'Revisa la placa, el kilometraje, los galones y el importe.'
      });
    }

    const failed = Array.isArray(body.failedChecks)
      ? [...new Set(
          body.failedChecks.filter(item => checklistNames.includes(item))
        )]
      : [];

    const status = failed.some(item => criticalChecks.includes(item))
      ? 'red'
      : failed.length
        ? 'yellow'
        : 'green';

    let conn;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [vehicles] = await conn.execute(
        `SELECT
          v.id,
          v.plate,
          v.current_km,
          da.driver_user_id,
          assigned.full_name AS assigned_driver_name,
          assigned.active AS assigned_driver_active
         FROM vehicles v
         LEFT JOIN driver_assignments da ON da.vehicle_id = v.id
         LEFT JOIN users assigned ON assigned.id = da.driver_user_id
         WHERE v.plate = ? AND v.active = 1
         FOR UPDATE`,
        [plate]
      );

      if (!vehicles.length) {
        await conn.rollback();

        return res.status(400).json({
          message: 'La unidad no existe o está inactiva.'
        });
      }

      const vehicle = vehicles[0];

      if (req.user.role === 'conductor') {
        if (
          Number(vehicle.driver_user_id) !== Number(req.user.id) ||
          Number(vehicle.assigned_driver_active) !== 1
        ) {
          await conn.rollback();

          return res.status(403).json({
            message: 'Solo puedes registrar la unidad que tienes asignada.'
          });
        }
      }

      let driverName = vehicle.assigned_driver_name
        ? String(vehicle.assigned_driver_name).trim()
        : '';

      if (req.user.role !== 'conductor') {
        if (!driverName) driverName = requestedDriver;

        if (!driverName) {
          await conn.rollback();

          return res.status(400).json({
            message: 'Ingresa el nombre del conductor de esta unidad.'
          });
        }
      } else {
        driverName = String(req.user.name || '').trim();
      }

      if (!driverName) {
        await conn.rollback();

        return res.status(400).json({
          message: 'No se pudo determinar el conductor.'
        });
      }

      const [result] = await conn.execute(
        `INSERT INTO driver_records (
          user_id,
          created_by_user_id,
          created_by_role,
          vehicle_plate,
          driver_name,
          odometer_km,
          route,
          gallons,
          fuel_cost,
          observations,
          status,
          failed_checks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          req.user.id,
          req.user.role,
          plate,
          driverName,
          km,
          route,
          gallons,
          cost,
          observations,
          status,
          JSON.stringify(failed)
        ]
      );

      for (const item of checklistNames) {
        await conn.execute(
          `INSERT INTO record_checklist (record_id, item_name, passed)
           VALUES (?, ?, ?)`,
          [result.insertId, item, failed.includes(item) ? 0 : 1]
        );
      }

      await conn.execute(
        `UPDATE vehicles
         SET
           current_km = GREATEST(COALESCE(current_km, 0), ?),
           mechanical_status = CASE
             WHEN ? = 'red' THEN 'red'
             WHEN ? = 'yellow' AND mechanical_status <> 'red' THEN 'yellow'
             ELSE mechanical_status
           END
         WHERE id = ?`,
        [km, status, status, vehicle.id]
      );

      await conn.commit();

      res.status(201).json({
        message: 'Inspección registrada correctamente.',
        id: result.insertId,
        status,
        driver_name: driverName,
        created_by_name: req.user.name,
        created_by_role: req.user.role
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error('Error revirtiendo transacción:', rollbackError);
        }
      }

      console.error('Error registrando inspección:', error);

      res.status(500).json({
        message: 'No se pudo guardar la inspección.'
      });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ======================================================
// USUARIOS: CONSULTAR
// ======================================================

app.get(
  '/api/users',
  requireAuth,
  allowRoles(...adminRoles),
  async (_req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          u.id,
          u.full_name,
          u.dni,
          u.email,
          u.role,
          u.active,
          u.created_at,
          da.vehicle_id AS assigned_vehicle_id,
          v.plate AS assigned_vehicle_plate
        FROM users u
        LEFT JOIN driver_assignments da ON da.driver_user_id = u.id
        LEFT JOIN vehicles v ON v.id = da.vehicle_id
        ORDER BY u.full_name
      `);

      res.json(rows);
    } catch (error) {
      console.error('Error consultando usuarios:', error);

      res.status(500).json({
        message: 'Error consultando usuarios.'
      });
    }
  }
);

// ======================================================
// USUARIOS: CREAR
// ======================================================

app.post(
  '/api/users',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    let conn;

    try {
      const name = String(req.body.full_name || '').trim();
      const dni = String(req.body.dni || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const requestedRole = String(req.body.role || 'conductor');

      const role = req.user.role === 'administrador'
        ? 'conductor'
        : requestedRole;

      const vehicleId = req.body.assigned_vehicle_id
        ? Number(req.body.assigned_vehicle_id)
        : null;

      if (!name || !dni || !email || password.length < 10) {
        return res.status(400).json({
          message: 'Nombre, DNI y correo son obligatorios; la contraseña debe tener al menos 10 caracteres.'
        });
      }

      if (!/^\d{8,12}$/.test(dni)) {
        return res.status(400).json({
          message: 'El DNI debe contener entre 8 y 12 dígitos.'
        });
      }

      if (!validRoles.includes(role)) {
        return res.status(400).json({
          message: 'Rol no válido.'
        });
      }

      if (req.user.role === 'administrador' && role !== 'conductor') {
        return res.status(403).json({
          message: 'El administrador solo puede crear conductores.'
        });
      }

      if (role === 'conductor' && !vehicleId) {
        return res.status(400).json({
          message: 'Selecciona la unidad vehicular del conductor.'
        });
      }

      if (role !== 'conductor' && vehicleId) {
        return res.status(400).json({
          message: 'Solo los conductores pueden tener una unidad asignada.'
        });
      }

      conn = await pool.getConnection();
      await conn.beginTransaction();

      if (vehicleId) {
        const [vehicles] = await conn.execute(
          'SELECT id FROM vehicles WHERE id = ? AND active = 1 FOR UPDATE',
          [vehicleId]
        );

        if (!vehicles.length) {
          await conn.rollback();

          return res.status(400).json({
            message: 'La unidad seleccionada no existe o está inactiva.'
          });
        }

        const [assignments] = await conn.execute(
          'SELECT driver_user_id FROM driver_assignments WHERE vehicle_id = ? FOR UPDATE',
          [vehicleId]
        );

        if (assignments.length) {
          await conn.rollback();

          return res.status(409).json({
            message: 'Esa unidad ya está asignada a otro conductor.'
          });
        }
      }

      const [result] = await conn.execute(
        `INSERT INTO users (
          full_name, dni, email, password_hash, role
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          name,
          dni,
          email,
          await bcrypt.hash(password, 12),
          role
        ]
      );

      if (vehicleId) {
        await conn.execute(
          'INSERT INTO driver_assignments (driver_user_id, vehicle_id) VALUES (?, ?)',
          [result.insertId, vehicleId]
        );
      }

      await conn.commit();

      res.status(201).json({
        id: result.insertId,
        message: 'Usuario creado correctamente.'
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error(rollbackError);
        }
      }

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: 'El correo, DNI o unidad ya está registrado o asignado.'
        });
      }

      console.error('Error creando usuario:', error);

      res.status(500).json({
        message: 'No se pudo crear el usuario.'
      });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ======================================================
// USUARIOS: EDITAR, CAMBIAR ROL, ASIGNACIÓN Y ESTADO
// ======================================================

app.patch(
  '/api/users/:id',
  requireAuth,
  allowRoles(...adminRoles),
  async (req, res) => {
    let conn;

    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          message: 'Identificador de usuario no válido.'
        });
      }

      if (id === Number(req.user.id) && req.body.active === false) {
        return res.status(400).json({
          message: 'No puedes desactivar tu propia cuenta.'
        });
      }

      const [existingRows] = await pool.execute(
        'SELECT id, role FROM users WHERE id = ?',
        [id]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          message: 'Usuario no encontrado.'
        });
      }

      const existing = existingRows[0];
      const fields = [];
      const params = [];

      if (req.body.full_name !== undefined) {
        const value = String(req.body.full_name || '').trim();

        if (!value) {
          return res.status(400).json({
            message: 'El nombre es obligatorio.'
          });
        }

        fields.push('full_name = ?');
        params.push(value);
      }

      if (req.body.dni !== undefined) {
        const value = String(req.body.dni || '').trim();

        if (!/^\d{8,12}$/.test(value)) {
          return res.status(400).json({
            message: 'El DNI debe contener entre 8 y 12 dígitos.'
          });
        }

        fields.push('dni = ?');
        params.push(value);
      }

      if (req.body.email !== undefined) {
        const value = String(req.body.email || '').trim().toLowerCase();

        if (!value) {
          return res.status(400).json({
            message: 'El correo es obligatorio.'
          });
        }

        fields.push('email = ?');
        params.push(value);
      }

      if (req.body.password) {
        const password = String(req.body.password);

        if (password.length < 10) {
          return res.status(400).json({
            message: 'La contraseña debe tener al menos 10 caracteres.'
          });
        }

        fields.push('password_hash = ?');
        params.push(await bcrypt.hash(password, 12));
      }

      if (typeof req.body.active === 'boolean') {
        if (req.user.role !== 'administrador_general') {
          return res.status(403).json({
            message: 'Solo el administrador general puede activar o desactivar usuarios.'
          });
        }

        fields.push('active = ?');
        params.push(req.body.active);
      }

      if (req.body.role !== undefined) {
        if (req.user.role !== 'administrador_general') {
          return res.status(403).json({
            message: 'Solo el administrador general puede cambiar roles.'
          });
        }

        if (!validRoles.includes(req.body.role)) {
          return res.status(400).json({
            message: 'Rol no válido.'
          });
        }

        if (
          Number(req.user.id) === id &&
          req.body.role !== 'administrador_general'
        ) {
          return res.status(400).json({
            message: 'No puedes quitarte tu propio rol de administrador general.'
          });
        }

        fields.push('role = ?');
        params.push(req.body.role);
      }

      const hasAssignment = Object.prototype.hasOwnProperty.call(
        req.body,
        'assigned_vehicle_id'
      );

      const vehicleId = req.body.assigned_vehicle_id
        ? Number(req.body.assigned_vehicle_id)
        : null;

      const finalRole = req.body.role !== undefined
        ? req.body.role
        : existing.role;

      if (finalRole === 'conductor' && hasAssignment && !vehicleId) {
        return res.status(400).json({
          message: 'Selecciona una unidad vehicular para el conductor.'
        });
      }

      if (finalRole !== 'conductor' && hasAssignment && vehicleId) {
        return res.status(400).json({
          message: 'Solo los conductores pueden tener una unidad asignada.'
        });
      }

      conn = await pool.getConnection();
      await conn.beginTransaction();

      if (fields.length) {
        params.push(id);

        await conn.execute(
          `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
          params
        );
      }

      if (existing.role === 'conductor' && finalRole !== 'conductor') {
        await conn.execute(
          'DELETE FROM driver_assignments WHERE driver_user_id = ?',
          [id]
        );
      }

      if (hasAssignment && finalRole === 'conductor' && vehicleId) {
        const [vehicles] = await conn.execute(
          'SELECT id FROM vehicles WHERE id = ? AND active = 1 FOR UPDATE',
          [vehicleId]
        );

        if (!vehicles.length) {
          await conn.rollback();

          return res.status(400).json({
            message: 'La unidad seleccionada no existe o está inactiva.'
          });
        }

        const [assignments] = await conn.execute(
          `SELECT driver_user_id
           FROM driver_assignments
           WHERE vehicle_id = ? AND driver_user_id <> ?
           FOR UPDATE`,
          [vehicleId, id]
        );

        if (assignments.length) {
          await conn.rollback();

          return res.status(409).json({
            message: 'Esa unidad ya está asignada a otro conductor.'
          });
        }

        await conn.execute(
          'DELETE FROM driver_assignments WHERE driver_user_id = ?',
          [id]
        );

        await conn.execute(
          'INSERT INTO driver_assignments (driver_user_id, vehicle_id) VALUES (?, ?)',
          [id, vehicleId]
        );
      }

      if (!fields.length && !hasAssignment) {
        await conn.rollback();

        return res.status(400).json({
          message: 'No hay cambios válidos.'
        });
      }

      await conn.commit();

      res.json({
        message: 'Cambios guardados correctamente.'
      });
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (rollbackError) {
          console.error(rollbackError);
        }
      }

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: 'El correo, DNI o unidad ya está registrado o asignado.'
        });
      }

      console.error('Error actualizando usuario:', error);

      res.status(500).json({
        message: 'No se pudo actualizar el usuario.'
      });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ======================================================
// RECUPERACIÓN DE CONTRASEÑA: SOLICITAR CORREO
// ======================================================

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: 'Ingresa tu correo electrónico.'
      });
    }

    const [users] = await pool.execute(
      `SELECT id, email, full_name
       FROM users
       WHERE email = ? AND active = 1
       LIMIT 1`,
      [email]
    );

    const message =
      'Si el correo está registrado, recibirás un enlace para recuperar tu contraseña.';

    if (!users.length) {
      return res.json({ message });
    }

    if (
      !process.env.MAIL_HOST ||
      !process.env.MAIL_USER ||
      !process.env.MAIL_PASS ||
      !process.env.FRONTEND_URL
    ) {
      console.error('Falta configurar el correo SMTP en backend/.env');

      return res.status(500).json({
        message: 'El servicio de recuperación no está configurado.'
      });
    }

    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    await pool.execute(
      `DELETE FROM password_reset_tokens
       WHERE user_id = ? OR expires_at < NOW()`,
      [user.id]
    );

    await pool.execute(
      `INSERT INTO password_reset_tokens
        (user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW())`,
      [user.id, tokenHash]
    );

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    const resetUrl =
      `${process.env.FRONTEND_URL.replace(/\/$/, '')}/?resetToken=${token}`;

    const safeName = String(user.full_name).replace(/[&<>"']/g, '');

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: user.email,
      subject: 'Recuperación de contraseña - BALSO Control de Flota',
      text:
        `Hola ${user.full_name},\n\n` +
        `Para crear una nueva contraseña, abre este enlace:\n${resetUrl}\n\n` +
        'El enlace caduca en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.',
      html: `
        <h2>BALSO Control de Flota</h2>
        <p>Hola ${safeName},</p>
        <p>Recibimos una solicitud para recuperar tu contraseña.</p>
        <p><a href="${resetUrl}">Crear una nueva contraseña</a></p>
        <p>Este enlace caduca en 30 minutos.</p>
        <p>Si no solicitaste este cambio, ignora este mensaje.</p>
      `
    });

    res.json({ message });
  } catch (error) {
    console.error('Error solicitando recuperación:', error);

    res.status(500).json({
      message: 'No se pudo enviar el correo de recuperación.'
    });
  }
});

// ======================================================
// RECUPERACIÓN DE CONTRASEÑA: CAMBIAR CONTRASEÑA
// ======================================================

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');

  if (!token || !password) {
    return res.status(400).json({
      message: 'El token y la nueva contraseña son obligatorios.'
    });
  }

  if (password.length < 10) {
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 10 caracteres.'
    });
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [tokens] = await conn.execute(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ?
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
         AND u.active = 1
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (!tokens.length) {
      await conn.rollback();

      return res.status(400).json({
        message: 'El enlace es inválido o ha caducado. Solicita uno nuevo.'
      });
    }

    const reset = tokens[0];
    const passwordHash = await bcrypt.hash(password, 12);

    await conn.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, reset.user_id]
    );

    await conn.execute(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [reset.user_id]
    );

    await conn.commit();

    res.json({
      message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.'
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(rollbackError);
      }
    }

    console.error('Error cambiando contraseña:', error);

    res.status(500).json({
      message: 'No se pudo actualizar la contraseña.'
    });
  } finally {
    if (conn) conn.release();
  }
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`API BALSO lista en puerto ${PORT}`);
});
