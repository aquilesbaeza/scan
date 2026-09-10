#!/usr/bin/env node
/**
 * Convierte un Excel de catálogo a products.json (compacto).
 * Uso:  node convert-excel-to-json.js ["ruta/al/archivo.xlsx"] [salida.json]
 * Sin argumentos toma el .xls/.xlsx más reciente del directorio actual.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const COLUMN_MAPPINGS = {
    sku: ['CODIGO SKU', 'CÓDIGO SKU', 'SKU'],
    idInterno: ['ID INTERNO'],
    descripcion: ['DESCRIPCION', 'DESCRIPCIÓN', 'PRODUCTO', 'NOMBRE'],
    precio: ['PRECIO FINAL', 'PRECIO', 'VALOR'],
    tipo: ['TIPO'],
    estatus: ['ESTATUS', 'STATUS', 'ESTADO'],
    existencia: ['EXISTENCIA', 'STOCK'],
    upc: ['CODIGO UPC', 'UPC', 'CODIGO BARRAS', 'CODIGO_BARRAS'],
    as400: ['AS 400', 'AS400'],
    numParte: ['NUMERO DE PARTE', 'NUM PARTE'],
    tienda: ['UNIDAD DE NEGOCIO DEL INVENTARIO', 'UNIDAD DE NEGOCIO', 'TIENDA', 'UBICACION'],
};

// Resuelve, una sola vez por hoja, qué encabezado real corresponde a cada campo.
function buildHeaderIndex(headers) {
    const index = {};
    for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
        for (const alias of aliases) {
            const found = headers.find(h => h.toUpperCase().trim() === alias)
                || headers.find(h => h.toUpperCase().includes(alias));
            if (found) { index[field] = found; break; }
        }
    }
    return index;
}

// Solo tiendas de venta: los codigos de 3 digitos (620-627). Se descartan
// bodega externa (10xxx), mercancia en reparacion (80xxx) y dañada (90xxx).
const ES_TIENDA_VENTA = /^\d{3}$/;

// "OD | CR | 623 TIENDA URUCA" -> { codigo: '623', nombre: 'URUCA' }
function parseTienda(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    const partes = s.split('|');
    s = partes[partes.length - 1].trim();

    const m = s.match(/^(\d+)\s+(.*)$/);
    let codigo = '', nombre = s;
    if (m) { codigo = m[1]; nombre = m[2].trim(); }

    nombre = nombre.replace(/^TIENDA\s+/i, '').trim();
    return { codigo, nombre: nombre || s };
}

// Fecha a la que corresponde el reporte. El nombre manda cuando la trae
// ("6211 07 09 2026.xls"); si no, se usa la fecha de modificacion del archivo.
function fechaDelArchivo(ruta) {
    const nombre = path.basename(ruta);
    let m = nombre.match(/(\d{2})[ _.\-](\d{2})[ _.\-](\d{4})/);      // dd mm aaaa
    if (m) {
        const d = new Date(+m[3], +m[2] - 1, +m[1]);
        if (!isNaN(d) && d.getMonth() === +m[2] - 1) return d;
    }
    m = nombre.match(/(\d{4})[ _.\-](\d{2})[ _.\-](\d{2})/);          // aaaa mm dd
    if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        if (!isNaN(d) && d.getMonth() === +m[2] - 1) return d;
    }
    try { return fs.statSync(ruta).mtime; } catch (e) { return null; }
}

function pickLatestExcel() {
    const files = fs.readdirSync('.')
        .filter(f => /\.(xls|xlsx)$/i.test(f) && !f.startsWith('~$'))
        .map(f => ({ f, t: fs.statSync(f).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return files.length ? files[0].f : null;
}

function convert(excelPath) {
    console.log(`Leyendo: ${excelPath}`);
    const workbook = XLSX.readFile(excelPath, { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) throw new Error('La hoja está vacía');

    const H = buildHeaderIndex(Object.keys(rows[0]));
    if (!H.sku || !H.descripcion) {
        throw new Error('No se encontraron las columnas CODIGO SKU / DESCRIPCION');
    }
    const val = (row, field) => (H[field] === undefined ? '' : row[H[field]]);
    const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

    const productos = {};
    const barcodeSets = new Map();
    const existPorSku = new Map();  // sku -> Map(codigoTienda -> cantidad)
    const tiendas = {};             // codigo -> nombre

    for (const row of rows) {
        const sku = str(val(row, 'sku'));
        const desc = str(val(row, 'descripcion'));
        if (!sku || !desc) continue;

        let p = productos[sku];
        if (!p) {
            const precio = parseFloat(val(row, 'precio'));
            p = productos[sku] = {
                sku,
                idInterno: str(val(row, 'idInterno')),
                descripcion: desc,
                precio: isNaN(precio) ? 0 : precio,
                tipo: str(val(row, 'tipo')),
                estatus: str(val(row, 'estatus')),
                as400: str(val(row, 'as400')),
                numParte: str(val(row, 'numParte')),
                codigos_barras: [],
                existencias: [],   // [codigoTienda, cantidad]
                existenciaTotal: 0,
            };
            barcodeSets.set(sku, new Set());
            existPorSku.set(sku, new Map());
        }

        const upc = str(val(row, 'upc'));
        if (upc) {
            const set = barcodeSets.get(sku);
            if (!set.has(upc)) { set.add(upc); p.codigos_barras.push(upc); }
        }

        // Existencia por unidad de negocio (una fila por tienda).
        const cant = parseFloat(val(row, 'existencia'));
        const t = parseTienda(val(row, 'tienda'));
        if (t && t.codigo && ES_TIENDA_VENTA.test(t.codigo)) {
            if (!tiendas[t.codigo]) tiendas[t.codigo] = t.nombre;
            if (!isNaN(cant) && cant !== 0) {
                const acc = existPorSku.get(sku);
                // NetSuite repite una fila por cada UPC del mismo SKU/tienda y todas
                // traen la misma existencia: sumarlas la multiplicaba. Se toma el mayor,
                // que ademas rescata el valor real cuando alguna fila viene vacia o en 0.
                const prev = acc.get(t.codigo);
                if (prev === undefined || cant > prev) acc.set(t.codigo, cant);
            }
        }
    }

    // Volcar existencias ordenadas por código de tienda.
    for (const [sku, acc] of existPorSku) {
        const p = productos[sku];
        p.existencias = Array.from(acc.entries())
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
        p.existenciaTotal = p.existencias.reduce((s, e) => s + e[1], 0);
    }

    return { productos, tiendas };
}

function main() {
    const excelPath = process.argv[2] || pickLatestExcel();
    const outputPath = process.argv[3] || 'products.json';
    if (!excelPath || !fs.existsSync(excelPath)) {
        console.error('No se encontró ningún Excel. Uso: node convert-excel-to-json.js "archivo.xlsx"');
        process.exit(1);
    }

    const { productos, tiendas } = convert(excelPath);
    const totalUpc = Object.values(productos).reduce((s, p) => s + p.codigos_barras.length, 0);

    const out = {
        metadata: {
            generado: new Date().toISOString(),
            origen: path.basename(excelPath),
            origenFecha: (fechaDelArchivo(excelPath) || new Date()).toISOString(),
            total_productos: Object.keys(productos).length,
            total_codigos_barras: totalUpc,
            total_tiendas: Object.keys(tiendas).length,
            total_unidades: Object.values(productos).reduce((s, p) => s + p.existenciaTotal, 0),
            version: '3.0',
        },
        tiendas,
        productos,
    };

    // Compacto (sin indentación): el archivo pesa ~3x menos y parsea más rápido.
    fs.writeFileSync(outputPath, JSON.stringify(out), 'utf-8');
    fs.writeFileSync('sync-info.json', JSON.stringify({
        timestamp: out.metadata.generado,
        origen: out.metadata.origen,
        origenFecha: out.metadata.origenFecha,
        total_productos: out.metadata.total_productos,
        total_codigos_barras: totalUpc,
        total_tiendas: out.metadata.total_tiendas,
        total_unidades: out.metadata.total_unidades,
        version: '3.0',
        status: 'actualizado',
    }, null, 2), 'utf-8');

    const mb = (fs.statSync(outputPath).size / 1048576).toFixed(2);
    console.log(`Productos: ${out.metadata.total_productos}`);
    console.log(`Codigos de barras: ${totalUpc}`);
    console.log(`Tiendas: ${out.metadata.total_tiendas}`);
    console.log(`Guardado en ${outputPath} (${mb} MB)`);
}

main();
