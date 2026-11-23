# api-turismo

API REST de la **Plataforma Turística Inteligente de Santa Elena** (Trabajo de Integración Curricular, Ingeniería de Software).
Gestiona usuarios y roles, fuentes de información, cargas de archivos (los originales nunca se modifican), metadatos, la bitácora de operaciones y
el resultado del procesamiento. **Es la única dueña de la base de datos.**

Node.js + Express 5 + TypeScript + MySQL/MariaDB (XAMPP).

```
Navegador -> web-turismo -> api-turismo -> procesamiento-turismo (validar y normalizar archivos)
                                |
                             MySQL (web_turismo)
```
Repositorios relacionados: [`web-turismo`](https://github.com/skayalvaradorodriguez-coder/web-turismo) (interfaz) y [`procesamiento-turismo`](https://github.com/skayalvaradorodriguez-coder/procesamiento-turismo) (servicio de procesamiento en Python).

## Requisitos
- Node.js 20 o superior.
- XAMPP con MySQL/MariaDB encendido.
- Para validar y procesar archivos: el servicio `procesamiento-turismo` en marcha.

## Puesta en marcha (PowerShell)

### 1. Base de datos
Con MySQL encendido en XAMPP, ejecuta **en orden** los scripts de `database/` con el usuario `root`. Son seguros de repetir: no borran datos.
```powershell
cd C:\Tesis\api-turismo
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root < database\001_auth.sql"
# repite con 002, 003, 004, 005, 006, 007, 009, 010, 011 y 012
```
Antes de ejecutar `008_permisos.sql`, crea el usuario de la aplicación (cambia la contraseña por una propia y larga):
```sql
CREATE USER IF NOT EXISTS 'turismo_app'@'localhost' IDENTIFIED BY 'tu-contraseña';
CREATE USER IF NOT EXISTS 'turismo_app'@'127.0.0.1' IDENTIFIED BY 'tu-contraseña';
```
Después ejecuta `008_permisos.sql`. **Vuelve a ejecutarlo cada vez que se agregue una tabla**: es la lista completa de lo que la API puede hacer (nunca borra filas ni altera tablas).

| Script | Contenido |
|---|---|
| `001`–`004` | Usuarios, tokens de un solo uso, sesiones y acceso con Google. |
| `005` | Fuentes de información y sus estructuras. |
| `006` | Cargas, archivos originales y metadatos. |
| `007` | Bitácora (solo se agrega). |
| `008` | Permisos mínimos del usuario `turismo_app`. |
| `009` | Procesamientos y hallazgos. |
| `010` | Roles definitivos: `super_admin`, `admin`, `investigador`, `externo`. |
| `011` | Retiro del Catastro Turístico del alcance. |
| `012` | Registros procesados y hallazgos de tipo `cambio`. |

`database/tests/` tiene pruebas en SQL de algunas migraciones (terminan con `ROLLBACK`, no dejan datos).

### 2. Variables de entorno
```powershell
Copy-Item .env.example .env
```
Completa `.env`. Nunca se sube a git.

| Variable | Para qué sirve |
|---|---|
| `PORT`, `FRONTEND_URL` | Puerto de la API y dirección de la interfaz (CORS). |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a MySQL con el usuario `turismo_app`. |
| `JWT_SECRET` | Firma de la sesión (mínimo 32 caracteres). |
| `SESSION_MINUTES`, `COOKIE_SECURE` | Duración de la sesión; `true` solo con HTTPS. |
| `GOOGLE_CLIENT_ID` | Acceso con Google (vacío = desactivado). |
| `SMTP_*`, `MAIL_FROM` | Correo (obligatorio en producción; en desarrollo se usa un correo de pruebas). |
| `STORAGE_DIR`, `MAX_UPLOAD_MB` | Carpeta de archivos originales (fuera de git) y tamaño máximo. |
| `PROCESAMIENTO_URL` | Dirección del servicio de procesamiento (por defecto `http://127.0.0.1:8001`). |
| `PROCESAMIENTO_CLAVE` | Debe ser **igual** a `INTERNAL_API_KEY` del servicio (mínimo 32 caracteres). Sin ella, validar y procesar responden "no configurado". |
| `PROCESAMIENTO_TIMEOUT_SEG` | Tiempo máximo de espera al servicio (por defecto 120). |

### 3. Instalar y arrancar
```powershell
npm install
npm run seed:admin    # crea el primer super_admin (pide nombres, correo y contraseña)
npm run dev
```
La API queda en `http://localhost:3000/api/v1`. Comprobación: `GET /api/v1/health`.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca con recarga automática. |
| `npm run build` / `npm start` | Compila y ejecuta la versión compilada. |
| `npm test` | Pruebas (vitest). Algunas usan la base real: necesitan MySQL encendido y al menos un usuario creado. |
| `npm run typecheck` | Revisa los tipos de la API y de las pruebas. |
| `npm run seed:admin` | Crea un super administrador. |

## Roles
| Rol | Puede |
|---|---|
| `super_admin` | Todo: fuentes, cargas, procesamiento y gestión de usuarios. Es el único que asigna o quita el rol `admin` y que activa o desactiva a un administrador. |
| `admin` | Gestionar fuentes y cargas, validar y procesar archivos, y cambiar el rol y el estado de usuarios (no los de un `admin` ni los de un `super_admin`, que no se modifica desde la plataforma). |
| `investigador` | Consultar fuentes, cargas, procesamientos y hallazgos. |
| `externo` | Sin acceso a la información interna. |

## Cargas y procesamiento
Una **carga** es una entrega de datos de una fuente (por ejemplo, un feriado). Estados: `recibida` → `validada` → `procesada` → `publicada` (o `rechazada`). El nivel de ingreso indica hasta dónde llegó: 1 guardada y catalogada, 2 procesada, 3 integrada.

`POST /api/v1/cargas/:id/procesamientos` con `{ "tipo": "validacion" | "procesamiento", "archivoId": N }` envía el archivo al servicio de procesamiento y guarda en una sola transacción:
- los **hallazgos** (errores y alertas);
- los **cambios** aplicados, con valor original y valor nuevo (trazabilidad);
- los **registros** normalizados, ligados al procesamiento que los generó;
- una anotación en la **bitácora**.

Procesar exige que la carga esté validada. El archivo original no se modifica nunca. El contrato completo entre la API y el servicio está en el documento `contrato-api-procesamiento` del proyecto.

## Endpoints principales
Prefijo `/api/v1`. Salvo autenticación, todos exigen sesión.

| Grupo | Rutas |
|---|---|
| Autenticación | `POST /auth/login`, `/auth/logout`, `GET /auth/me`, registro, verificación de correo, recuperación de contraseña, acceso con Google. |
| Usuarios | `GET /usuarios`, `GET /usuarios/:id`, `PATCH /usuarios/:id/rol`, `PATCH /usuarios/:id/estado`. |
| Fuentes | `GET /fuentes`, `GET /fuentes/:id`, `POST /fuentes`, `PUT /fuentes/:id`, `PATCH /fuentes/:id/estado`. |
| Cargas | `GET /cargas`, `GET /cargas/:id`, `POST /cargas` (con archivo), `POST /cargas/:id/archivos`, `PATCH /cargas/:id/metadatos`, `POST /cargas/:id/rechazo`, descarga del original. |
| Procesamiento | `POST /cargas/:id/procesamientos`, `GET /cargas/:id/procesamientos`, `GET /cargas/:id/procesamientos/:procesamientoId/hallazgos`. |

## Prueba de punta a punta
Con la API y el servicio de procesamiento encendidos, desde esta carpeta:
```powershell
powershell -ExecutionPolicy Bypass -File .\tests\manual\probar-procesamiento.ps1 -Archivo "C:\ruta\archivo.csv"
```
Pide el correo y la contraseña por teclado (no quedan guardados), crea la carga con el archivo, la valida, la procesa y muestra el resumen. Escribe `nueva` en la pregunta de la fuente para crear la fuente "Observatorio UPSE" la primera vez.

## Seguridad
- Contraseñas con argon2id; sesión en cookie `httpOnly`; bloqueo temporal tras intentos fallidos; límites de peticiones por IP.
- Entradas validadas con zod en cada ruta; consultas SQL siempre parametrizadas.
- Roles revisados en el servidor **antes** de recibir un archivo.
- El usuario de base de datos de la aplicación solo tiene los permisos mínimos: los originales, la bitácora y lo procesado solo se agregan.
- Los archivos originales se guardan con un nombre generado por el sistema (el del usuario nunca se usa como ruta), con su huella SHA-256 y verificando su contenido.
- La clave del servicio de procesamiento vive en el `.env`, nunca en el repositorio.
- Las operaciones importantes quedan en la bitácora.
