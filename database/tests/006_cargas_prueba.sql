-- Prueba de 006_cargas.sql. Todo se deshace al final (ROLLBACK).
-- Debe producir exactamente 4 errores (uno por regla).
USE web_turismo;
START TRANSACTION;

SET @u = (SELECT id FROM usuarios WHERE email = 'skayalvaradorodriguez@gmail.com');
INSERT INTO fuentes (codigo, nombre, institucion, creado_por) VALUES ('prueba', 'P', 'P', @u);
SET @f = LAST_INSERT_ID();
INSERT INTO cargas (fuente_id, descripcion, cargado_por) VALUES (@f, 'c', @u);
SET @c = LAST_INSERT_ID();

INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, subido_por)
  VALUES (@c, 'a.csv', 'x1.csv', 'text/csv', 10, REPEAT('a', 64), @u);

-- ERROR 1: segundo archivo vigente con el mismo nombre (uq_archivos_vigente)
INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, version, subido_por)
  VALUES (@c, 'a.csv', 'x2.csv', 'text/csv', 10, REPEAT('b', 64), 2, @u);

-- OK: version 2 no vigente
INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, version, vigente, subido_por)
  VALUES (@c, 'a.csv', 'x3.csv', 'text/csv', 10, REPEAT('c', 64), 2, 0, @u);

-- ERROR 2: mismo contenido (sha256) en la misma carga (uq_archivos_carga_sha)
INSERT INTO archivos_originales (carga_id, nombre_original, nombre_almacenado, tipo_mime, tamano_bytes, sha256, subido_por)
  VALUES (@c, 'b.csv', 'x4.csv', 'text/csv', 10, REPEAT('a', 64), @u);

-- ERROR 3: estado inventado (chk_cargas_estado)
UPDATE cargas SET estado = 'inventado' WHERE id = @c;

-- OK y luego ERROR 4: misma clave de metadato (uq_carga_metadatos_clave)
INSERT INTO carga_metadatos (carga_id, clave, valor) VALUES (@c, 'feriado', 'Carnaval 2026');
INSERT INTO carga_metadatos (carga_id, clave, valor) VALUES (@c, 'feriado', 'Otro');

SELECT nombre_original, version, vigente FROM archivos_originales WHERE carga_id = @c;

ROLLBACK;
SELECT COUNT(*) AS cargas_restantes FROM cargas;
SELECT COUNT(*) AS archivos_restantes FROM archivos_originales;