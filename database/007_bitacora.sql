-- 007_bitacora.sql : registro de operaciones (solo se agrega, no se edita ni se borra)
-- Se ejecuta con un usuario administrador (root), NO con el usuario de la aplicacion.
-- Es seguro ejecutarlo mas de una vez (no borra datos).

USE web_turismo;

-- ---------------------------------------------------------------
-- bitacora
-- usuario_id es NULL cuando el evento no tiene usuario identificado.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bitacora (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NULL,
  accion     VARCHAR(60)     NOT NULL,
  entidad    VARCHAR(40)     NOT NULL,
  entidad_id BIGINT UNSIGNED NULL,
  detalle    JSON            NULL,
  ip         VARCHAR(45)     NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_bitacora_entidad (entidad, entidad_id),
  KEY ix_bitacora_usuario (usuario_id),
  KEY ix_bitacora_accion (accion),
  KEY ix_bitacora_fecha (created_at),
  CONSTRAINT fk_bitacora_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------
-- La bitacora es de solo agregar: la propia base impide editar o borrar.
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bitacora_no_update;
CREATE TRIGGER trg_bitacora_no_update BEFORE UPDATE ON bitacora
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitacora no se puede modificar';

DROP TRIGGER IF EXISTS trg_bitacora_no_delete;
CREATE TRIGGER trg_bitacora_no_delete BEFORE DELETE ON bitacora
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitacora no se puede borrar';