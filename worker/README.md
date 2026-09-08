# Worker de publicación

Guarda el token de GitHub del lado del servidor. GitHub revoca automáticamente
cualquier token que aparezca dentro de un repositorio público, así que el token
no puede vivir en `index.html`. Acá sí está a salvo, y como consecuencia
**cualquier dispositivo puede publicar sin configurar nada**.

```
app (cualquier tienda)  --clave-->  Worker  --token-->  GitHub  -->  Pages
```

La clave que lleva la app solo permite publicar el catálogo. Si algún día hay
que cambiarla, se cambia en el Worker y en `CLAVE_PUBLICACION` de `index.html`.

## Instalación (una sola vez)

### 1. Crear el Worker

1. Entrar a <https://dash.cloudflare.com> y crear una cuenta gratuita.
2. **Compute (Workers)** → **Create** → **Start with Hello World!** → **Deploy**.
3. Nombre: `scan-publicar`.

### 2. Pegar el código

En el Worker → **Edit code**, borrar todo y pegar el contenido de
[`publicar.js`](publicar.js). **Deploy**.

### 3. Configurar el token y la clave

En el Worker → **Settings** → **Variables and Secrets** → **Add**:

| Nombre | Tipo | Valor |
|---|---|---|
| `GITHUB_TOKEN` | Secret | el token fine-grained de GitHub |
| `CLAVE` | Secret | `tiendas2026` |

El token se genera en <https://github.com/settings/personal-access-tokens/new>:

- Resource owner: `aquilesbaeza`
- Repository access: Only select repositories → `aquilesbaeza/scan`
- Permissions → Repository permissions → **Contents: Read and write**

Este token **nunca** se pega en el código de la app ni se sube al repositorio.

### 4. Conectar la app

Copiar la URL del Worker (algo como `https://scan-publicar.TU-CUENTA.workers.dev`)
y ponerla en `WORKER_URL`, dentro de `index.html`.

## Uso diario

Desde cualquier dispositivo, en cualquier tienda:

1. Abrir <https://aquilesbaeza.github.io/scan/>
2. **Cargar BD** → arrastrar el Excel del día
3. **Publicar a todos**

El resto de las tiendas recibe el catálogo al abrir la app.

## Si algo falla

El mensaje aparece bajo el botón de la app:

| Mensaje | Causa |
|---|---|
| `Clave de publicación incorrecta` | `CLAVE` del Worker ≠ `CLAVE_PUBLICACION` de la app |
| `Falta configurar GITHUB_TOKEN` | no se agregó el secreto en el paso 3 |
| `GitHub 401` | el token venció o fue revocado: generar otro y actualizarlo |
| `GitHub 403` | al token le falta **Contents: Read and write** |
| `No se pudo contactar el servidor` | `WORKER_URL` mal escrita, o sin conexión |
