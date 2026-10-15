-- 010_roles.sql
-- Roles definitivos: super_admin, admin, investigador y externo.
-- El rol "usuario" pasa a llamarse "externo" (conserva su id, asi que las cuentas existentes siguen igual).
-- Se puede ejecutar mas de una vez sin problema.

UPDATE roles SET codigo = 'externo', nombre = 'Externo' WHERE codigo = 'usuario';

INSERT IGNORE INTO roles (codigo, nombre) VALUES
    ('admin', 'Administrador'),
    ('investigador', 'Investigador');
