# Diagnóstico — api-turismo

> Resumen del estado del repositorio para colaboradores. Actualizado al **2026-11-25** (commit `8d705dd`).
> Autora de todos los commits: `skayalvaradorodriguez-coder` · 46 commits · rama única `main`.

## Qué es
API REST (Node.js + Express 5 + TypeScript + MySQL/MariaDB) de la Plataforma Turística Inteligente de Santa Elena.
Es la **única dueña de la base de datos**. La web le habla a ella y ella le habla al servicio de Python (`procesamiento-turismo`).

## Qué está hecho

| Área | Estado | Dónde |
|---|---|---|
| Login con contraseña (argon2id, cookie httpOnly, bloqueo por intentos) | Hecho | `src/modules/auth/auth.*` |
| Registro con verificación de correo y reenvío | Hecho | `src/modules/auth/registro.*` |
| Recuperar / restablecer contraseña (enlace de un solo uso) | Hecho | `src/modules/auth/recuperacion.*` |
| Login con Google (nonce, vinculación de cuentas) | Hecho | `src/modules/auth/google.*` |
| Usuarios: listar, ver, cambiar rol y estado | Hecho | `src/modules/usuarios/` |
| Fuentes de información (CRUD + activar/desactivar) | Hecho | `src/modules/fuentes/` |
| Cargas de archivos (subida segura, metadatos, descarga del original, rechazo) | Hecho | `src/modules/cargas/` |
| Validar y procesar cargas llamando al servicio de Python | Hecho | `src/modules/procesamiento/` |
| Bitácora de solo agregar (triggers) | Hecho | `src/modules/auditoria/`, `database/007` |
| Indicadores por carga (turistas, hoteles, Carnaval, Semana Santa…) | Hecho | `src/modules/indicadores/` |
| Publicar / retirar publicación de una carga | Hecho | `cargas.routes.ts` |
| API pública (sin sesión) de cargas publicadas e indicadores | Hecho | `src/modules/publico/` |

Roles: `super_admin`, `admin` (gestión) · `investigador` (consulta) · `externo`.

### Endpoints (prefijo `/api/v1`)
- **Auth:** `POST /login`, `GET /me`, `POST /logout`, `POST /registro`, `POST /verificar-email`, `POST /reenviar-verificacion`, `POST /recuperar`, `POST /validar-recuperacion`, `POST /restablecer`, `POST /google/nonce`, `POST /google`
- **Fuentes:** `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id/estado`
- **Cargas:** `GET /`, `GET /:id`, `GET /:id/archivos/:archivoId/descarga`, `POST /`, `POST /:id/archivos`, `PATCH /:id/metadatos`, `POST /:id/rechazo`, `POST|DELETE /:id/publicacion`
- **Procesamiento:** `POST|GET /:id/procesamientos`, `GET /:id/procesamientos/:procesamientoId/hallazgos`
- **Indicadores:** `GET /:id/indicadores`
- **Usuarios:** `GET /`, `GET /:id`, `PATCH /:id/rol`, `PATCH /:id/estado`
- **Público:** `GET /cargas`, `GET /cargas/:id/indicadores`

### Base de datos (`database/`)
Migraciones `001` a `012`. Hay que ejecutarlas en orden y volver a ejecutar `008_permisos.sql` cada vez que se agrega una tabla.
La `011` retiró el **Catastro Turístico** del alcance (ya no forma parte del proyecto).

## Línea de tiempo
- **30 sep – 6 oct:** base del servidor, seguridad y todo el módulo de autenticación (contraseña, registro, recuperación, Google) con pruebas.
- **14 – 19 oct:** fuentes, cargas, bitácora, permisos mínimos en la BD, usuarios y roles definitivos. Primer procesamiento (Catastro, hecho dentro de la API).
- **10 nov:** se retira el Catastro.
- **23 nov:** el procesamiento pasa al servicio de Python (migración `012`) y se escribe el README.
- **24 – 25 nov:** indicadores, publicación de cargas, API pública y catálogo de Semana Santa.

## Pruebas
~36 archivos en `tests/` (Vitest + Supertest). Algunas pruebas de repositorio usan **la base real**: necesitan MySQL encendido.
Pruebas SQL en `database/tests/` (terminan en `ROLLBACK`).
Comandos: `npm test`, `npm run typecheck`.

## Observaciones
- El **README no cubre lo de los últimos dos días**: indicadores, publicación, API pública y Semana Santa no aparecen.
- En `src/config/roles.ts` hay un comentario viejo que dice que `admin` e `investigador` "se crean cuando se construya el módulo de Usuarios". Ese módulo ya existe.
- El contrato con el servicio de Python se valida con zod en `procesamiento.cliente.ts`. El código menciona un documento `arquitectura/contrato-api-procesamiento` que **no está en el repo**.
