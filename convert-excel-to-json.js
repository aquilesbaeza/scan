#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_FILES = [
    '4set.xls',
];
const COLUMN_MAPPINGS = {
    sku: ['CODIGO SKU', 'SKU', 'CÓDIGO SKU', 'codigo'],
    idInterno: ['ID INTERNO', 'ID', 'INTERNO'],
    descripcion: ['DESCRIPCION', 'DESCRIPCION PRODUCTO', 'PRODUCTO', 'NOMBRE'],
    precio: ['PRECIO FINAL', 'PRECIO', 'VALOR'],
    categoria: ['CATEGORIA', 'CATEGORIA PRODUCTO'],
    tipo: ['TIPO', 'TIPO PRODUCTO'],
    estatus: ['ESTATUS', 'STATUS', 'ESTADO'],
    existencia: ['EXISTENCIA', 'STOCK', 'STOCK_ACTUAL', 'CANTIDAD'],
    upc: ['UPC', 'CODIGO BARRAS', 'BARRAS', 'CODIGO_BARRAS', 'CODIGO UPC'],
    cantidad: ['CANTIDAD', 'CANT', 'STOCK', 'EXISTENCIA'],
    as400: ['AS 400', 'AS400', 'CODIGO AS400'],
    numParte: ['NUMERO DE PARTE', 'NUM PARTE', 'PARTE'],
};

function findColumn(row, columnAliases) {
    for (const alias of columnAliases) {
        for (const key of Object.keys(row)) {
            if (key.toUpperCase().includes(alias.toUpperCase())) {
                return row[key];
            }
        }
    }
    return undefined;
}

function convertExcelToJson(excelPath) {
    if (!fs.existsSync(excelPath)) {
        console.warn(`⚠️  Archivo no encontrado: ${excelPath}`);
        return null;
    }

    console.log(`📖 Leyendo: ${excelPath}`);

    try {
        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const products = {};
        const issues = [];
        let processedCount = 0;

        rows.forEach((row, index) => {
            const sku = findColumn(row, COLUMN_MAPPINGS.sku);
            const desc = findColumn(row, COLUMN_MAPPINGS.descripcion);
            const precio = findColumn(row, COLUMN_MAPPINGS.precio);
            const categoria = findColumn(row, COLUMN_MAPPINGS.categoria);
            const tipo = findColumn(row, COLUMN_MAPPINGS.tipo);
            const estatus = findColumn(row, COLUMN_MAPPINGS.estatus);
            const existencia = findColumn(row, COLUMN_MAPPINGS.existencia);
            const upc = findColumn(row, COLUMN_MAPPINGS.upc);
            const cantidad = findColumn(row, COLUMN_MAPPINGS.cantidad);
            const as400 = findColumn(row, COLUMN_MAPPINGS.as400);
            const numParte = findColumn(row, COLUMN_MAPPINGS.numParte);
            const idInterno = findColumn(row, COLUMN_MAPPINGS.idInterno);

            if (!sku || !desc) return;

            const skuStr = sku.toString().trim();

            if (!products[skuStr]) {
                products[skuStr] = {
                    sku: skuStr,
                    idInterno: idInterno ? idInterno.toString().trim() : '',
                    descripcion: desc.toString().trim(),
                    precio: precio ? parseFloat(precio) : 0,
                    categoria: categoria ? categoria.toString().trim() : '',
                    tipo: tipo ? tipo.toString().trim() : '',
                    estatus: estatus ? estatus.toString().trim() : '',
                    existencia: existencia ? existencia.toString().trim() : '',
                    as400: as400 ? as400.toString().trim() : '',
                    numParte: numParte ? numParte.toString().trim() : '',
                    codigos_barras: [],
                    cantidades: []
                };
                processedCount++;
            } else {
                // SKU existe, verificar si hay datos diferentes
                if (products[skuStr].descripcion !== desc.toString().trim()) {
                    issues.push({
                        tipo: 'descripcion_conflictiva',
                        sku: skuStr,
                        fila: index + 2,
                        actual: products[skuStr].descripcion,
                        nueva: desc.toString().trim()
                    });
                }
            }

            // Agregar código de barras si existe y no está duplicado
            if (upc) {
                const upcStr = upc.toString().trim();
                if (!products[skuStr].codigos_barras.includes(upcStr)) {
                    products[skuStr].codigos_barras.push(upcStr);
                } else {
                    issues.push({
                        tipo: 'codigo_barras_duplicado',
                        sku: skuStr,
                        fila: index + 2,
                        upc: upcStr
                    });
                }
            }

            // Agregar cantidad si existe
            if (cantidad) {
                const cantidadNum = parseInt(cantidad);
                if (!isNaN(cantidadNum) && cantidadNum > 0) {
                    products[skuStr].cantidades.push({
                        cantidad: cantidadNum,
                        fila: index + 2
                    });
                }
            }
        });

        return { products, issues, processedCount };
    } catch (err) {
        console.error(`❌ Error al leer ${excelPath}:`, err.message);
        return null;
    }
}

function main() {
    console.log('🚀 Iniciando conversión de Excel a JSON\n');

    let allProducts = {};
    let allIssues = [];
    let totalProcessed = 0;

    EXCEL_FILES.forEach(file => {
        const result = convertExcelToJson(file);
        if (result) {
            allProducts = { ...allProducts, ...result.products };
            allIssues = allIssues.concat(result.issues);
            totalProcessed += result.processedCount;
        }
    });

    // Generar JSON de salida
    const outputData = {
        metadata: {
            generado: new Date().toISOString(),
            total_productos: Object.keys(allProducts).length,
            total_codigos_barras: Object.values(allProducts).reduce((sum, p) => sum + p.codigos_barras.length, 0),
            versión: '1.0'
        },
        productos: allProducts,
        issues: allIssues.length > 0 ? allIssues : []
    };

    const outputPath = 'products.json';
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`\n✅ Conversión completada!`);
    console.log(`   📦 Productos: ${outputData.metadata.total_productos}`);
    console.log(`   🏷️  Códigos de barras únicos: ${outputData.metadata.total_codigos_barras}`);
    console.log(`   ⚠️  Inconsistencias detectadas: ${allIssues.length}`);
    console.log(`   💾 Guardado en: ${outputPath}\n`);

    if (allIssues.length > 0) {
        console.log('📋 Inconsistencias encontradas:');
        const issueGroups = {};
        allIssues.forEach(issue => {
            if (!issueGroups[issue.tipo]) {
                issueGroups[issue.tipo] = [];
            }
            issueGroups[issue.tipo].push(issue);
        });

        Object.entries(issueGroups).forEach(([tipo, issues]) => {
            console.log(`\n${tipo} (${issues.length}):`);
            issues.slice(0, 5).forEach(issue => {
                console.log(`  - SKU: ${issue.sku}, Fila: ${issue.fila}`);
                if (issue.actual && issue.nueva) {
                    console.log(`    Actual: ${issue.actual}`);
                    console.log(`    Nueva: ${issue.nueva}`);
                }
            });
            if (issues.length > 5) {
                console.log(`  ... y ${issues.length - 5} más`);
            }
        });
    }
}

main();
