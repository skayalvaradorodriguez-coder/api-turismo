-- 006_cargas.sql : cargas de datos, archivos originales y metadatos
-- Se ejecuta con un usuario administrador (root), NO con el usuario de la aplicacion.
-- Es seguro ejecutarlo mas de una vez (no borra datos).

USE web_turismo;

-- ---------------------------------------------------------------
-- cargas
-- Una entrega de datos de una fuente.
-- nivel_ingreso: 1 = guardada y catalogada, 2 = procesada, 3 = integrada.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargas (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  fuente_id      BIGINT UNSIGNED  NOT NULL,
  estructura_id  BIGINT UNSIGNED  NULL,
  descripcion    TEXT             NULL,
  periodo_desde  DATE             NULL,
  periodo_hasta  DATE             NULL,
  nivel_ingreso  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  estado         VARCHAR(20)      NOT NULL DEFAULT 'recibida',
  motivo_rechazo TEXT             NULL,
  cargado_por    BIGINT UNSIGNED  NOT NULL,
  publicada_por  BIGINT UNSIGNED  NULL,
  publicada_at   DATETIME         NULL,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cargas_fuente (fuente_id),
  KEY ix_cargas_estructura (estructura_id),
  KEY ix_cargas_estado (estado),
  KEY ix_cargas_cargado_por (cargado_por),
  KEY ix_cargas_publicada_por (publicada_por),
  CONSTRAINT fk_cargas_fuente      FOREIGN KEY (fuente_id)     REFERENCES fuentes (id),
  CONSTRAINT fk_cargas_estructura  FOREIGN KEY (estructura_id) REFERENCES estructuras (id),
  CONSTRAINT fk_cargas_cargado_por FOREIGN KEY (cargado_por)   REFERENCES usuarios (id),
  CONSTRAINT fk_cargas_publicada_por FOREIGN KEY (publicada_por) REFERENCES usuarios (id),
  CONSTRAINT chk_cargas_estado CHECK (estado IN ('recibida', 'validada', 'procesada', 'publicada', 'rechazada')),
  CONSTRAINT chk_cargas_nivel  CHECK (nivel_ingreso IN (1, 2, 3)),
  CONSTRAINT chk_cargas_periodo CHECK (periodo_hasta IS NULL OR periodo_desde IS NULL OR periodo_hasta >= periodo_desde)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- archivos_originales
-- Archivo tal como llego. Nunca se modifica ni se borra.
-- nombre_almacenado lo genera el sistema (no se usa el nombre del usuario
-- como ruta). vigente_clave garantiza un solo archivo vigente por
-- (carga, nombre_original); los reemplazados quedan con vigente = 0.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archivos_originales (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carga_id          BIGINT UNSIGNED NOT NULL,
  nombre_original   VARCHAR(255)    NOT NULL,
  nombre_almacenado VARCHAR(120)    NOT NULL,
  tipo_mime         VARCHAR(100)    NOT NULL,
  tamano_bytes      BIGINT UNSIGNED NOT NULL,
  sha256            CHAR(64)        NOT NULL,
  version           INT UNSIGNED    NOT NULL DEFAULT 1,
  vigente           TINYINT(1)      NOT NULL DEFAULT 1,
  vigente_clave     VARCHAR(300) AS (IF(vigente = 1, CONCAT(carga_id, '|', nombre_original), NULL)) VIRTUAL,
  subido_por        BIGINT UNSIGNED NOT NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_archivos_almacenado (nombre_almacenado),
  UNIQUE KEY uq_archivos_carga_sha (carga_id, sha256),
  UNIQUE KEY uq_archivos_version (carga_id, nombre_original, version),
  UNIQUE KEY uq_archivos_vigente (vigente_clave),
  KEY ix_archivos_subido_por (subido_por),
  CONSTRAINT fk_archivos_carga      FOREIGN KEY (carga_id)   REFERENCES cargas (id),
  CONSTRAINT fk_archivos_subido_por FOREIGN KEY (subido_por) REFERENCES usuarios (id),
  CONSTRAINT chk_archivos_vigente CHECK (vigente IN (0, 1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- carga_metadatos
-- Metadatos flexibles (clave / valor) de cada carga.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carga_metadatos (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carga_id   BIGINT UNSIGNED NOT NULL,
  clave      VARCHAR(80)     NOT NULL,
  valor      TEXT            NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carga_metadatos_clave (carga_id, clave),
  CONSTRAINT fk_carga_metadatos_carga FOREIGN KEY (carga_id) REFERENCES cargas (id)
) ENGINE=InnoDB;