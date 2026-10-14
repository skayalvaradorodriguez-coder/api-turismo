-- 005_fuentes.sql : fuentes de informacion y sus estructuras
-- Se ejecuta con un usuario administrador (root), NO con el usuario de la aplicacion.
-- Es seguro ejecutarlo mas de una vez (no borra datos).

USE web_turismo;

-- ---------------------------------------------------------------
-- fuentes
-- Una fila por cada origen de datos. Agregar una fuente nueva
-- es insertar una fila, no crear tablas.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuentes (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo                   VARCHAR(40)     NOT NULL,
  nombre                   VARCHAR(150)    NOT NULL,
  institucion              VARCHAR(150)    NOT NULL,
  descripcion              TEXT            NULL,
  tipo_fuente              VARCHAR(40)     NULL,
  mecanismo_acceso         VARCHAR(40)     NULL,
  frecuencia_actualizacion VARCHAR(60)     NULL,
  procedencia              TEXT            NULL,
  licencia_uso             VARCHAR(200)    NULL,
  responsable              VARCHAR(150)    NULL,
  estado                   VARCHAR(20)     NOT NULL DEFAULT 'activa',
  creado_por               BIGINT UNSIGNED NOT NULL,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fuentes_codigo (codigo),
  KEY ix_fuentes_estado (estado),
  KEY ix_fuentes_creado_por (creado_por),
  CONSTRAINT fk_fuentes_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id),
  CONSTRAINT chk_fuentes_estado CHECK (estado IN ('activa', 'inactiva'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- estructuras
-- Forma en que una fuente organiza sus datos (por ejemplo, la
-- version de un cuestionario). Las columnas concretas se definiran
-- cuando se analicen los archivos reales.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estructuras (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fuente_id   BIGINT UNSIGNED NOT NULL,
  nombre      VARCHAR(150)    NOT NULL,
  version     VARCHAR(40)     NOT NULL DEFAULT '1',
  descripcion TEXT            NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_estructuras_fuente_nombre_version (fuente_id, nombre, version),
  CONSTRAINT fk_estructuras_fuente FOREIGN KEY (fuente_id) REFERENCES fuentes (id)
) ENGINE=InnoDB;