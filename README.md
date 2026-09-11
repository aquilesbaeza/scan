# Escáner de Inventario

Consulta de existencias para las tiendas de Office Depot Costa Rica. El
encargado de pasillo escanea un código de barras, lo digita o busca por
descripción, y ve al instante **cuánto hay en su tienda y en las otras siete**:
surte con cantidades reales y, si no tiene, sabe a qué tienda pedir la
transferencia.

**App:** <https://aquilesbaeza.github.io/scan/>
**Diagnóstico** (si un dispositivo no abre): <https://aquilesbaeza.github.io/scan/diagnostico.html>

## Cómo se actualiza la base

Cualquier dispositivo, de cualquier tienda, una vez al día:

1. **Cargar BD** → arrastrar o elegir el Excel del día
2. **Publicar a todos**

Todas las tiendas reciben la base nueva al abrir la app. No hace falta token ni
configurar nada: el token de GitHub vive en un Worker de Cloudflare
(ver [`worker/README.md`](worker/README.md)), porque GitHub revoca cualquier
token que aparezca en un repositorio público.

```
Excel  →  la app lo convierte a JSON  →  Worker  →  GitHub Pages
                                                        ↓
                       620 · 621 · 622 · 623 · 624 · 625 · 626 · 627
```

Cada equipo consulta `sync-info.json` (unos cientos de bytes) al abrir, al
volver a la app, al recuperar la señal y cada 5 minutos. Solo descarga el
catálogo cuando lo publicado es más nuevo que lo que tiene.

## El Excel

Tiene que ser el reporte de existencias por unidad de negocio, con estas 11
columnas. Si falta alguna, la app lo rechaza y dice cuál:

```
CODIGO UPC · ID INTERNO · CODIGO SKU · DESCRIPCION · AS 400 · NUMERO DE PARTE
ESTATUS · TIPO · EXISTENCIA · PRECIO FINAL · Unidad de Negocio del inventario
```

Dos detalles de cómo lo exporta NetSuite:

- Trae **una fila por cada código de barras** del mismo SKU y tienda, todas con
  la misma existencia. No se suman: se toma el valor, o el inventario quedaría
  multiplicado por la cantidad de códigos del producto.
- Solo se usan las **tiendas de venta** (códigos de 3 dígitos, 620-627). Bodega
  externa (10xxx), mercancía en reparación (80xxx) y dañada (90xxx) se descartan.

## Offline

Después de la primera carga la app funciona sin señal: el catálogo vive en
IndexedDB del dispositivo y las librerías (Tailwind, SheetJS, el escáner y las
tipografías) se sirven desde `vendor/`, no desde CDN externo.

## Archivos

```
index.html                 la app entera
diagnostico.html           prueba el dispositivo pieza por pieza
products.json              catálogo publicado (~4 MB, generado)
sync-info.json             fecha y totales de lo publicado
sw.js                      service worker (caché offline)
manifest.json              PWA
vendor/                    librerías y tipografías locales
worker/                    Worker de Cloudflare que publica en GitHub
convert-excel-to-json.js   mismo conversor, para línea de comandos
.github/workflows/         convierte el Excel si se sube a data/
```

## Línea de comandos

```bash
npm install
node convert-excel-to-json.js "CR 10 09 2026.xlsx"
```

Cuidado: regenera `products.json` **y** `sync-info.json` en el disco local. Para
publicar use siempre la app, que escribe los dos juntos y en orden.
