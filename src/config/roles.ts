// Roles autorizados para cada tipo de operacion.
// 'admin' e 'investigador' se crean en la base cuando se construya el modulo de Usuarios.
export const ROLES_GESTION: string[] = ['super_admin', 'admin'];
export const ROLES_CONSULTA: string[] = [...ROLES_GESTION, 'investigador'];