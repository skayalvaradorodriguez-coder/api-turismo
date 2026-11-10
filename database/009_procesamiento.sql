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
