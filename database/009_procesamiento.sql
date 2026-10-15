USE web_turismo;

-- Cada ejecucion de validar o procesar sobre una carga queda registrada aqui
CREATE TABLE IF NOT EXISTS procesamientos (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    carga_id      BIGINT UNSIGNED NOT NULL,
    archivo_id    BIGINT UNSIGNED NOT NULL,
    tipo          VARCHAR(20)  NOT NULL,
    estado        VARCHAR(20)  NOT NULL DEFAULT 'en_curso',
    total_filas   INT UNSIGNED NOT NULL DEFAULT 0,
    total_errores INT UNSIGNED NOT NULL DEFAULT 0,
    total_alertas INT UNSIGNED NOT NULL DEFAULT 0,
    mensaje_error VARCHAR(500) NULL,
    ejecutado_por BIGINT UNSIGNED NOT NULL,
    iniciado_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY ix_procesamientos_carga (carga_id),
    CONSTRAINT fk_procesamientos_carga   FOREIGN KEY (carga_id)      REFERENCES cargas (id),
    CONSTRAINT fk_procesamientos_archivo FOREIGN KEY (archivo_id)    REFERENCES archivos_originales (id),
    CONSTRAINT fk_procesamientos_usuario FOREIGN KEY (ejecutado_por) REFERENCES usuarios (id),
    CONSTRAINT chk_procesamientos_tipo   CHECK (tipo IN ('validacion', 'procesamiento')),
    CONSTRAINT chk_procesamientos_estado CHECK (estado IN ('en_curso', 'completado', 'fallido'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Problemas encontrados en el archivo. No se modifican ni se borran
CREATE TABLE IF NOT EXISTS hallazgos (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    procesamiento_id BIGINT UNSIGNED NOT NULL,
    fila             INT UNSIGNED NULL,
    columna          VARCHAR(80)  NULL,
    regla            VARCHAR(60)  NOT NULL,
    severidad        VARCHAR(10)  NOT NULL,
    mensaje          VARCHAR(300) NOT NULL,
    valor_original   VARCHAR(300) NULL,
    valor_corregido  VARCHAR(300) NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_hallazgos_procesamiento (procesamiento_id, severidad),
    KEY ix_hallazgos_regla (regla),
    CONSTRAINT fk_hallazgos_procesamiento FOREIGN KEY (procesamiento_id) REFERENCES procesamientos (id),
    CONSTRAINT chk_hallazgos_severidad CHECK (severidad IN ('error', 'alerta'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registros del Catastro Turistico ya procesados. Datos sensibles: ruc y propietario
CREATE TABLE IF NOT EXISTS catastro_establecimientos (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    carga_id            BIGINT UNSIGNED NOT NULL,
    archivo_id          BIGINT UNSIGNED NOT NULL,
    fila_origen         INT UNSIGNED NOT NULL,
    numero_registro     VARCHAR(40)  NOT NULL,
    ruc                 CHAR(13)     NOT NULL,
    nombre_comercial    VARCHAR(120) NULL,
    actividad           VARCHAR(80)  NOT NULL,
    clasificacion       VARCHAR(80)  NOT NULL,
    categoria           VARCHAR(40)  NOT NULL,
    categoria_original  VARCHAR(40)  NOT NULL,
    categoria_simbolo   VARCHAR(10)  NULL,
    categoria_nivel     TINYINT UNSIGNED NULL,
    propietario         VARCHAR(120) NULL,
    provincia           VARCHAR(40)  NOT NULL,
    canton              VARCHAR(40)  NOT NULL,
    parroquia           VARCHAR(60)  NOT NULL,
    parroquia_original  VARCHAR(60)  NOT NULL,
    estado_registro     VARCHAR(40)  NOT NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_catastro_carga_registro (carga_id, numero_registro),
    UNIQUE KEY uq_catastro_carga_fila (carga_id, fila_origen),
    KEY ix_catastro_canton_parroquia (canton, parroquia),
    KEY ix_catastro_clasificacion (clasificacion),
    CONSTRAINT fk_catastro_carga   FOREIGN KEY (carga_id)   REFERENCES cargas (id),
    CONSTRAINT fk_catastro_archivo FOREIGN KEY (archivo_id) REFERENCES archivos_originales (id),
    CONSTRAINT chk_catastro_simbolo CHECK (categoria_simbolo IS NULL OR categoria_simbolo IN ('estrellas','tenedores','copas','tazas','unica')),
    CONSTRAINT chk_catastro_nivel   CHECK (categoria_nivel IS NULL OR categoria_nivel BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
