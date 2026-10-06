-- 004_google.sql : ampliar google_sub (el "sub" de Google es un identificador de hasta 255 caracteres)
-- Se ejecuta con root. Es seguro ejecutarlo mas de una vez.

USE web_turismo;

ALTER TABLE usuarios MODIFY google_sub VARCHAR(255) NULL;