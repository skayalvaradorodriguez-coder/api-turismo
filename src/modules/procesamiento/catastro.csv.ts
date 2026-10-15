/**
 * Lector minimo de CSV (separador coma, comillas dobles, saltos de linea CRLF o LF).
 * Quita la marca BOM del inicio y descarta las lineas completamente vacias.
 * No usa librerias externas: el formato del Catastro es simple y asi no se agrega una dependencia.
 */
export function leerCsv(texto: string): string[][] {
    const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
    const filas: string[][] = [];
    let fila: string[] = [];
    let campo = '';
    let entreComillas = false;

    const cerrarCampo = (): void => {
        fila.push(campo);
        campo = '';
    };
    const cerrarFila = (): void => {
        cerrarCampo();
        const vacia = fila.length === 1 && fila[0]?.trim() === '';
        if (!vacia) filas.push(fila);
        fila = [];
    };

    for (let i = 0; i < contenido.length; i++) {
        const c = contenido[i] as string;
        if (entreComillas) {
            if (c === '"') {
                if (contenido[i + 1] === '"') {
                    campo += '"';
                    i++;
                } else {
                    entreComillas = false;
                }
            } else {
                campo += c;
            }
        } else if (c === '"') {
            entreComillas = true;
        } else if (c === ',') {
            cerrarCampo();
        } else if (c === '\n') {
            cerrarFila();
        } else if (c !== '\r') {
            campo += c;
        }
    }
    if (campo !== '' || fila.length > 0) cerrarFila();
    return filas;
}
