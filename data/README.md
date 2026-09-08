# Sincronizar la base de datos

Subí aquí el Excel del día (`.xlsx` o `.xls`) desde github.com — funciona
igual desde la computadora o desde el celular, sin instalar nada:

1. Entrá a esta carpeta en GitHub.
2. **Add file → Upload files**, elegí el Excel y confirmá.

Eso dispara el workflow `convertir-excel`, que corre `convert-excel-to-json.js`,
regenera `products.json` y `sync-info.json`, y los publica.

Cada dispositivo compara `sync-info.json` al abrir la app: si lo publicado es
más nuevo que lo que tiene guardado, descarga el catálogo nuevo solo y avisa
con "Base de datos actualizada". No hay que subir el Excel en cada dispositivo.

Solo se usa el Excel más reciente de esta carpeta; los anteriores pueden borrarse.
