-- 002_tokens.sql : tokens de un solo uso (verificar correo y, mas adelante, recuperar contrasena)
-- Se ejecuta con root. Es seguro ejecutarlo mas de una vez.
-- Solo se guarda el HASH (SHA-256) del token: el valor real unicamente viaja por correo.

USE web_turismo;

CREATE TABLE IF NOT EXISTS tokens_usuario (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo       ENUM('verificar_email', 'recuperar_password') NOT NULL,
  token_hash CHAR(64)        NOT NULL,
  expira_at  DATETIME        NOT NULL,
  usado_at   DATETIME        NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tokens_hash (token_hash),
  KEY ix_tokens_usuario_tipo (usuario_id, tipo),
  CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;