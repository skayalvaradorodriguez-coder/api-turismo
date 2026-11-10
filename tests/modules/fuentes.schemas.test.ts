import { describe, expect, it } from 'vitest';
import {
    cambiarEstadoSchema,
    crearFuenteSchema,
    editarFuenteSchema,
} from '../../src/modules/fuentes/fuentes.schemas';

const minima = { codigo: 'observatorio_upse', nombre: 'Observatorio Turistico UPSE', institucion: 'UPSE' };

describe('crearFuenteSchema', () => {
    it('acepta una fuente con solo los datos obligatorios; lo opcional queda en null', () => {
        const r = crearFuenteSchema.safeParse(minima);
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.codigo).toBe('observatorio_upse');
            expect(r.data.descripcion ?? null).toBeNull();
            expect(r.data.procedencia ?? null).toBeNull();
        }
    });

    it('recorta espacios y convierte textos vacios en null', () => {
        const r = crearFuenteSchema.safeParse({
            ...minima,
            nombre: '  Encuesta Turistica  ',
            descripcion: '   ',
            responsable: '',
            licenciaUso: null,
        });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.nombre).toBe('Encuesta Turistica');
            expect(r.data.descripcion).toBeNull();
            expect(r.data.responsable).toBeNull();
            expect(r.data.licenciaUso).toBeNull();
        }
    });

    it.each([
        ['con mayusculas', 'Observatorio'],
        ['con espacios', 'mi fuente'],
        ['con guion medio', 'mi-fuente'],
        ['que empieza con numero', '1fuente'],
        ['demasiado corto', 'ab'],
        ['con tilde', 'ubicación'],
    ])('rechaza un codigo %s', (_motivo, codigo) => {
        expect(crearFuenteSchema.safeParse({ ...minima, codigo }).success).toBe(false);
    });

    it('rechaza campos desconocidos (por ejemplo creadoPor)', () => {
        expect(crearFuenteSchema.safeParse({ ...minima, creadoPor: 1 }).success).toBe(false);
    });

    it('rechaza nombre muy corto o institucion ausente o vacia', () => {
        expect(crearFuenteSchema.safeParse({ ...minima, nombre: 'ab' }).success).toBe(false);
        expect(crearFuenteSchema.safeParse({ codigo: minima.codigo, nombre: minima.nombre }).success).toBe(false);
        expect(crearFuenteSchema.safeParse({ ...minima, institucion: '   ' }).success).toBe(false);
    });

    it('rechaza textos que pasan el maximo', () => {
        expect(crearFuenteSchema.safeParse({ ...minima, nombre: 'x'.repeat(151) }).success).toBe(false);
        expect(crearFuenteSchema.safeParse({ ...minima, descripcion: 'x'.repeat(2001) }).success).toBe(false);
        expect(crearFuenteSchema.safeParse({ ...minima, licenciaUso: 'x'.repeat(201) }).success).toBe(false);
    });

    it('rechaza datos que no son texto', () => {
        expect(crearFuenteSchema.safeParse({ ...minima, nombre: 123 }).success).toBe(false);
        expect(crearFuenteSchema.safeParse({ ...minima, descripcion: { a: 1 } }).success).toBe(false);
        expect(crearFuenteSchema.safeParse(null).success).toBe(false);
    });
});

describe('editarFuenteSchema', () => {
    it('no permite cambiar el codigo', () => {
        const r = editarFuenteSchema.safeParse({ nombre: 'Nuevo nombre', institucion: 'UPSE', codigo: 'otro' });
        expect(r.success).toBe(false);
    });

    it('acepta todos los campos editables', () => {
        const r = editarFuenteSchema.safeParse({
            nombre: 'Observatorio Turistico',
            institucion: 'UPSE',
            descripcion: 'Encuestas por feriado',
            tipoFuente: 'Observatorio',
            mecanismoAcceso: 'Carga manual',
            frecuenciaActualizacion: 'Por feriado',
            procedencia: 'Carrera de Turismo',
            licenciaUso: 'Uso academico',
            responsable: 'Coordinacion',
        });
        expect(r.success).toBe(true);
    });
});

describe('cambiarEstadoSchema', () => {
    it('acepta activa e inactiva', () => {
        expect(cambiarEstadoSchema.safeParse({ estado: 'activa' }).success).toBe(true);
        expect(cambiarEstadoSchema.safeParse({ estado: 'inactiva' }).success).toBe(true);
    });

    it('rechaza cualquier otro estado', () => {
        expect(cambiarEstadoSchema.safeParse({ estado: 'borrada' }).success).toBe(false);
        expect(cambiarEstadoSchema.safeParse({}).success).toBe(false);
    });
});