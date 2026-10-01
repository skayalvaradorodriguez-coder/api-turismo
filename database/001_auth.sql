-- 001_auth.sql : base de datos y tablas minimas para autenticacion
-- Se ejecuta con un usuario administrador (root), NO con el usuario de la aplicacion.
-- Es seguro ejecutarlo mas de una vez (no borra datos).

CREATE DATABASE IF NOT EXISTS web_turismo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE web_turismo;

-- ---------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo     VARCHAR(30)      NOT NULL,
  nombre     VARCHAR(60)      NOT NULL,
  created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- usuarios
-- password_hash es NULL para cuentas creadas solo con Google.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nombres             VARCHAR(100)     NOT NULL,
  apellidos           VARCHAR(100)     NOT NULL,
  email               VARCHAR(190)     NOT NULL,
  password_hash       VARCHAR(255)     NULL,
  google_sub          VARCHAR(64)      NULL,
  rol_id              TINYINT UNSIGNED NOT NULL,
  activo              TINYINT(1)       NOT NULL DEFAULT 1,
  email_verificado_at DATETIME         NULL,
  intentos_fallidos   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta     DATETIME         NULL,
  ultimo_login_at     DATETIME         NULL,
  created_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_google_sub (google_sub),
  KEY ix_usuarios_rol (rol_id),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles (id),
  CONSTRAINT chk_usuarios_credencial CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- datos iniciales: roles
-- ---------------------------------------------------------------
INSERT IGNORE INTO roles (codigo, nombre) VALUES
  ('super_admin', 'Super administrador'),
  ('usuario',     'Usuario');