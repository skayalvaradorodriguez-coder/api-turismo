import { describe, expect, it } from 'vitest';
import { interpretarCategoria, procesarCatastro } from '../../src/modules/procesamiento/catastro.reglas';

const ENCABEZADO =
    'RUC,Nombre Comercial,Número de Registro,Actividad / Modalidad,Clasificación,Categoría,Razón social (Propietario),Provincia,Cantón,Parroquia,Estado Registro del Establecimiento';

const base = {
    ruc: '0100090174001',
    nombre: 'HOSTERIA EL SOL',
    registro: '0100090174001.003.7010368',
    actividad: 'ALOJAMIENTO',
    clasificacion: 'HOSTERÍA',
    categoria: '3 Estrellas',
    propietario: 'PEREZ JUAN',
    provincia: 'SANTA ELENA',
    canton: 'SANTA ELENA',
    parroquia: 'COLONCHE',
    estado: 'RATIFICADO',
};

const fila = (c: Partial<typeof base> = {}): string => {
    const f = { ...base, ...c };
    return [f.ruc, f.nombre, f.registro, f.actividad, f.clasificacion, f.categoria, f.propietario, f.provincia, f.canton, f.parroquia, f.estado].join(',');
};
const csv = (...filas: string[]): string => [ENCABEZADO, ...filas].join('\n');
const reglas = (r: ReturnType<typeof procesarCatastro>): string[] => r.hallazgos.map((h) => h.regla);

describe('procesarCatastro: filas correctas', () => {
    it('una fila limpia no genera hallazgos y queda como registro', () => {
        const r = procesarCatastro(csv(fila()));
        expect(r.totalFilas).toBe(1);
        expect(r.hallazgos).toEqual([]);
        expect(r.registros).toHaveLength(1);
        expect(r.registros[0]).toMatchObject({
            filaOrigen: 1,
            numeroRegistro: base.registro,
            ruc: base.ruc,
            categoria: '3 Estrellas',
            categoriaSimbolo: 'estrellas',
            categoriaNivel: 3,
            canton: 'SANTA ELENA',
            parroquia: 'COLONCHE',
            parroquiaOriginal: 'COLONCHE',
            estadoRegistro: 'RATIFICADO',
        });
    });

    it('acepta numeros de registro con 7 u 8 digitos finales y deja el RUC con ceros a la izquierda', () => {
        const r = procesarCatastro(csv(fila({ registro: '0100090174001.003.10000625' }), fila({ registro: '0100090174001.003.7010368' })));
        expect(r.totalErrores).toBe(0);
        expect(r.registros.map((x) => x.ruc)).toEqual(['0100090174001', '0100090174001']);
    });

    it('un RUC repetido con registros distintos es legitimo', () => {
        const r = procesarCatastro(csv(fila({ registro: '0100090174001.001.1000001', nombre: 'UNO' }), fila({ registro: '0100090174001.001.1000002', nombre: 'DOS' })));
        expect(r.totalErrores).toBe(0);
        expect(r.registros).toHaveLength(2);
    });

    it('ubica las columnas por nombre aunque cambie el orden', () => {
        const alReves = ENCABEZADO.split(',').reverse().join(',');
        const datos = fila().split(',').reverse().join(',');
        expect(procesarCatastro(`${alReves}\n${datos}`).registros).toHaveLength(1);
    });
});

describe('procesarCatastro: errores (la fila no se usa)', () => {
    it('el numero de registro vacio, mal formado o repetido es error', () => {
        expect(reglas(procesarCatastro(csv(fila({ registro: '' }))))).toContain('registro_vacio');
        expect(reglas(procesarCatastro(csv(fila({ registro: 'ABC-123' }))))).toContain('registro_formato');
        const r = procesarCatastro(csv(fila(), fila({ nombre: 'OTRO' })));
        expect(r.hallazgos.find((h) => h.regla === 'registro_duplicado')).toMatchObject({ fila: 2, severidad: 'error' });
        expect(r.registros).toHaveLength(1);
        expect(r.totalErrores).toBe(1);
    });

    it('una provincia distinta de Santa Elena es error', () => {
        const r = procesarCatastro(csv(fila({ provincia: 'GUAYAS' })));
        expect(reglas(r)).toContain('provincia_distinta');
        expect(r.registros).toHaveLength(0);
    });

    it('un RUC que no tiene 13 digitos es error', () => {
        expect(reglas(procesarCatastro(csv(fila({ ruc: '12345' }))))).toContain('ruc_formato');
    });

    it('un campo obligatorio vacio es error', () => {
        const r = procesarCatastro(csv(fila({ actividad: '' })));
        expect(r.hallazgos.find((h) => h.regla === 'campo_obligatorio_vacio')).toMatchObject({ columna: 'Actividad / Modalidad' });
    });

    it('un valor mas largo que la columna de la base es error', () => {
        expect(reglas(procesarCatastro(csv(fila({ nombre: 'X'.repeat(121) }))))).toContain('valor_muy_largo');
    });

    it('una fila con columnas de mas o de menos es error', () => {
        const r = procesarCatastro(csv(`${fila()},sobra`));
        expect(r.hallazgos[0]).toMatchObject({ regla: 'fila_columnas', fila: 1, severidad: 'error' });
        expect(r.registros).toHaveLength(0);
    });

    it('si falta una columna se reporta y no se procesa ninguna fila', () => {
        const r = procesarCatastro(`RUC,Nombre Comercial\n1,x`);
        expect(r.registros).toEqual([]);
        expect(r.hallazgos.every((h) => h.regla === 'columna_faltante' && h.severidad === 'error')).toBe(true);
        expect(r.hallazgos.length).toBeGreaterThan(5);
    });

    it('un archivo vacio es error', () => {
        expect(reglas(procesarCatastro(''))).toEqual(['archivo_vacio']);
    });
});

describe('procesarCatastro: alertas (la fila se usa y queda anotado)', () => {
    it('espacios de mas: se corrigen y se guarda lo original; en RUC y propietario no se copia el valor', () => {
        const r = procesarCatastro(csv(fila({ nombre: 'HOTEL  SOL ', propietario: 'PEREZ  JUAN' })));
        const nombre = r.hallazgos.find((h) => h.columna === 'Nombre Comercial');
        expect(nombre).toMatchObject({ regla: 'espacios_extra', severidad: 'alerta', valorOriginal: 'HOTEL  SOL ', valorCorregido: 'HOTEL SOL' });
        const propietario = r.hallazgos.find((h) => h.columna === 'Razón social (Propietario)');
        expect(propietario).toMatchObject({ regla: 'espacios_extra', valorOriginal: null, valorCorregido: null });
        expect(r.registros[0]).toMatchObject({ nombreComercial: 'HOTEL SOL', propietario: 'PEREZ JUAN' });
    });

    it('nombre comercial vacio queda en NULL con alerta', () => {
        const r = procesarCatastro(csv(fila({ nombre: '' })));
        expect(reglas(r)).toEqual(['nombre_vacio']);
        expect(r.registros[0]?.nombreComercial).toBeNull();
    });

    it('parroquia con error de escritura conocido se corrige y conserva la original', () => {
        const r = procesarCatastro(csv(fila({ parroquia: 'MANGLARLTO' })));
        expect(r.hallazgos[0]).toMatchObject({ regla: 'parroquia_corregida', valorOriginal: 'MANGLARLTO', valorCorregido: 'MANGLARALTO' });
        expect(r.registros[0]).toMatchObject({ parroquia: 'MANGLARALTO', parroquiaOriginal: 'MANGLARLTO' });
    });

    it('parroquia con espacios de mas solo genera la alerta de espacios, no dos', () => {
        const r = procesarCatastro(csv(fila({ canton: 'SALINAS', parroquia: 'VICENTE  ROCAFUERTE' })));
        expect(reglas(r)).toEqual(['espacios_extra']);
        expect(r.registros[0]?.parroquia).toBe('VICENTE ROCAFUERTE');
    });

    it('parroquia desconocida o de otro canton se conserva y se avisa, sin adivinar', () => {
        const r = procesarCatastro(csv(fila({ parroquia: 'LUGAR RARO' }), fila({ registro: '0100090174001.003.7010369', canton: 'SALINAS', parroquia: 'COLONCHE' })));
        expect(reglas(r)).toEqual(['parroquia_desconocida', 'parroquia_desconocida']);
        expect(r.registros.map((x) => x.parroquia)).toEqual(['LUGAR RARO', 'COLONCHE']);
    });

    it('canton desconocido se avisa una vez y no repite la alerta de parroquia', () => {
        expect(reglas(procesarCatastro(csv(fila({ canton: 'GUAYAQUIL' }))))).toEqual(['canton_desconocido']);
    });

    it('estado pendiente de inspeccion se conserva y se avisa; un estado raro tambien', () => {
        expect(reglas(procesarCatastro(csv(fila({ estado: 'PENDIENTE DE INSPECCIÓN' }))))).toEqual(['pendiente_inspeccion']);
        expect(reglas(procesarCatastro(csv(fila({ estado: 'SUSPENDIDO' }))))).toEqual(['estado_desconocido']);
    });

    it('registro que no empieza con el RUC genera alerta', () => {
        expect(reglas(procesarCatastro(csv(fila({ registro: '9999999999999.003.7010368' }))))).toEqual(['registro_ruc_no_coincide']);
    });

    it('mismo RUC, nombre, parroquia y clasificacion con otro registro es posible duplicado (solo alerta)', () => {
        const r = procesarCatastro(csv(fila({ registro: '0100090174001.001.1000001' }), fila({ registro: '0100090174001.001.1000002' })));
        expect(r.registros).toHaveLength(2);
        expect(r.hallazgos).toHaveLength(1);
        expect(r.hallazgos[0]).toMatchObject({ regla: 'posible_duplicado', fila: 2, severidad: 'alerta' });
        expect(r.hallazgos[0]?.mensaje).toContain('fila 1');
    });

    it('cuenta errores y alertas por separado', () => {
        const r = procesarCatastro(csv(fila({ nombre: '' }), fila({ registro: '' })));
        expect(r.totalErrores).toBe(1);
        expect(r.totalAlertas).toBe(1);
    });
});

describe('interpretarCategoria', () => {
    it.each([
        ['1 Estrella', 'estrellas', 1],
        ['5 Estrellas', 'estrellas', 5],
        ['(1) Un tenedor', 'tenedores', 1],
        ['(4) Cuatro tenedores', 'tenedores', 4],
        ['(1) Una copa', 'copas', 1],
        ['(3) Tres copas', 'copas', 3],
        ['(1) Una taza', 'tazas', 1],
        ['(2) Dos tazas', 'tazas', 2],
    ] as const)('%s -> %s nivel %i, sin alerta', (texto, simbolo, nivel) => {
        expect(interpretarCategoria(texto)).toEqual({ categoria: texto, simbolo, nivel, regla: null });
    });

    it('las tres formas de "Categoria Unica" se unifican', () => {
        expect(interpretarCategoria('Categoría Única')).toEqual({ categoria: 'Categoría Única', simbolo: 'unica', nivel: null, regla: null });
        for (const texto of ['Categoría única', 'Categoria Unica']) {
            expect(interpretarCategoria(texto)).toEqual({ categoria: 'Categoría Única', simbolo: 'unica', nivel: null, regla: 'categoria_normalizada' });
        }
    });

    it('"Categoria Uno" se conserva como valor propio con alerta', () => {
        expect(interpretarCategoria('Categoría Uno')).toEqual({ categoria: 'Categoría Uno', simbolo: null, nivel: null, regla: 'categoria_uno' });
    });

    it('una categoria desconocida se conserva con alerta', () => {
        expect(interpretarCategoria('Lujo')).toMatchObject({ categoria: 'Lujo', simbolo: null, nivel: null, regla: 'categoria_desconocida' });
    });
});
