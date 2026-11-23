-- 012_registros_procesados.sql : registros resultantes del procesamiento y trazabilidad de cambios
-- Se ejecuta con un usuario administrador (root). Es seguro ejecutarlo mas de una vez.
--
-- 1) hallazgos admite un tercer tipo, "cambio": una transformacion aplicada a un dato
--    (queda el valor original y el valor nuevo). Asi la trazabilidad usa la misma tabla.
-- 2) registros_procesados guarda cada registro que salio del procesamiento, ligado a la
--    ejecucion que lo genero. El archivo original no se modifica nunca.
-- Despues de ejecutar este script, vuelve a ejecutar 008_permisos.sql.

USE web_turismo;

ALTER TABLE hallazgos DROP CONSTRAINT IF EXISTS chk_hallazgos_severidad;
ALTER TABLE hallazgos ADD CONSTRAINT chk_hallazgos_severidad CHECK (severidad IN ('error', 'alerta', 'cambio'));

CREATE TABLE IF NOT EXISTS registros_procesados (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    procesamiento_id BIGINT UNSIGNED NOT NULL,
    carga_id         BIGINT UNSIGNED NOT NULL,
    identificador    VARCHAR(100) NOT NULL,   -- identificador del registro en el archivo (por ejemplo, id_encuesta)
    fila_origen      INT UNSIGNED NOT NULL,   -- fila del archivo (el encabezado es la fila 1)
    estructura       VARCHAR(60)  NOT NULL,   -- estructura reconocida (por ejemplo, ots_turista_v1)
    datos            JSON         NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_registros_procesamiento_identificador (procesamiento_id, identificador),
    KEY ix_registros_carga (carga_id),
    CONSTRAINT fk_registros_procesamiento FOREIGN KEY (procesamiento_id) REFERENCES procesamientos (id),
    CONSTRAINT fk_registros_carga         FOREIGN KEY (carga_id)         REFERENCES cargas (id),
    CONSTRAINT chk_registros_datos CHECK (JSON_VALID(datos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
