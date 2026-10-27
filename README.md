# BALSO · Control de Flota — versión con base de datos

Este proyecto reemplaza el almacenamiento `localStorage` del prototipo por una API Express y una base MySQL. Conserva como datos iniciales las 9 unidades y las 15 reglas de mantenimiento incluidas en el HTML original. Los registros nuevos del conductor se guardan en MySQL y son visibles para los administradores.

## Roles
- `administrador_general`: acceso a todo, incluida la gestión de usuarios y asignación de roles.
- `administrador`: panel administrativo (flota, registros, mantenimiento y documentos); no puede crear administradores generales ni gestionar usuarios.
- `conductor`: únicamente ve su pantalla de registro, sin menús ni panel administrativo.

## Requisitos
- Node.js 20 o superior
- MySQL 8+ o MariaDB 10.4+
- MySQL Workbench (opcional, para ejecutar el SQL visualmente)

## 1. Crear la base de datos
En MySQL Workbench abre y ejecuta `backend/sql/schema.sql`. Luego ejecuta `backend/sql/seed.sql`.
El seed incluye las unidades y reglas técnicas del prototipo. Los datos históricos que en el HTML estaban resumidos como totales KPI no se convierten en registros individuales porque el prototipo no contiene el detalle original de cada abastecimiento.

## 2. Configurar API
En una terminal:
```bash
cd backend
npm install
```
Copia `.env.example` como `.env` y configura las credenciales de tu MySQL:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=balso_flota
JWT_SECRET=reemplaza_esto_por_una_clave_larga_aleatoria
```
No subas `.env` a Git.

Crea el primer administrador general:
```bash
npm run crear-admin
```
El comando pide correo, nombre y contraseña. No existe una contraseña universal por defecto.

Arranca la API:
```bash
npm run dev
```
Comprueba `http://localhost:3000/api/health`.

## 3. Ejecutar frontend
En otra terminal:
```bash
cd frontend
npm install
```
Copia `frontend/.env.example` a `frontend/.env`:
```env
VITE_API_URL=http://localhost:3000/api
```
Luego:
```bash
npm run dev
```
Abre la dirección que muestra Vite.

## 4. Importante antes de producción
- Cambia `JWT_SECRET` por un secreto largo y privado.
- Usa HTTPS y una base de datos administrada con copias de seguridad.
- Revisa los datos maestros importados: el HTML contiene algunos campos pendientes de confirmar (propietario, documentos, modelo y kilometraje).
- Los estados de documentos del prototipo son una fotografía de la información disponible cuando se creó el HTML; no representan una consulta actual a SUNARP, SBS, MTC o SUTRAN.
- Antes de publicar, restringe CORS al dominio real del frontend y añade políticas de respaldo/retención.
