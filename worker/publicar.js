/**
 * Worker de publicacion — Cloudflare Workers
 *
 * Guarda el token de GitHub del lado del servidor, donde el escaneo de secretos
 * de GitHub no lo ve y por lo tanto no lo revoca. La app le manda el catalogo
 * con una clave compartida y el Worker hace el commit.
 *
 * Variables que hay que configurar (ver README.md):
 *   GITHUB_TOKEN  — token fine-grained con Contents: Read and write (secreto)
 *   CLAVE         — la misma clave que lleva la app en CLAVE_PUBLICACION
 */

const REPO = 'aquilesbaeza/scan';
const RAMA = 'main';
const ORIGEN_PERMITIDO = 'https://aquilesbaeza.github.io';

const cabecerasCors = {
    'Access-Control-Allow-Origin': ORIGEN_PERMITIDO,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Clave',
    'Access-Control-Max-Age': '86400',
};

const responder = (datos, estado = 200) =>
    new Response(JSON.stringify(datos), {
        status: estado,
        headers: { 'Content-Type': 'application/json', ...cabecerasCors },
    });

async function github(ruta, token, opciones = {}) {
    const res = await fetch('https://api.github.com/repos/' + REPO + ruta, {
        ...opciones,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'scan-publicar',
        },
    });
    if (!res.ok) {
        const detalle = await res.text();
        throw new Error('GitHub ' + res.status + ': ' + detalle.slice(0, 300));
    }
    return res.json();
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cabecerasCors });
        }
        if (request.method !== 'POST') {
            return responder({ error: 'Solo se admite POST' }, 405);
        }
        // Se recorta el espacio en blanco: al pegar los secretos en el panel es
        // facil que se cuele un salto de linea al final.
        const claveEsperada = (env.CLAVE || '').trim();
        const claveRecibida = (request.headers.get('X-Clave') || '').trim();

        if (!claveEsperada) {
            return responder({ error: 'Falta configurar CLAVE en el Worker' }, 500);
        }
        if (claveRecibida !== claveEsperada) {
            return responder({ error: 'Clave de publicación incorrecta' }, 401);
        }
        if (!env.GITHUB_TOKEN) {
            return responder({ error: 'Falta configurar GITHUB_TOKEN en el Worker' }, 500);
        }

        let cuerpo;
        try {
            cuerpo = await request.json();
        } catch (e) {
            return responder({ error: 'El cuerpo no es JSON válido' }, 400);
        }
        if (!cuerpo.productos || !cuerpo.sync) {
            return responder({ error: 'Faltan los archivos del catálogo' }, 400);
        }

        try {
            const token = env.GITHUB_TOKEN;

            // Git Data API: los dos archivos entran en un solo commit y admite
            // products.json de varios MB, cosa que la API de contenidos no hace bien.
            const ref = await github('/git/ref/heads/' + RAMA, token);
            const commitPadre = await github('/git/commits/' + ref.object.sha, token);

            const blob = (contenidoBase64) => github('/git/blobs', token, {
                method: 'POST',
                body: JSON.stringify({ content: contenidoBase64, encoding: 'base64' }),
            });
            const blobProductos = await blob(cuerpo.productos);
            const blobSync = await blob(cuerpo.sync);

            const arbol = await github('/git/trees', token, {
                method: 'POST',
                body: JSON.stringify({
                    base_tree: commitPadre.tree.sha,
                    tree: [
                        { path: 'products.json', mode: '100644', type: 'blob', sha: blobProductos.sha },
                        { path: 'sync-info.json', mode: '100644', type: 'blob', sha: blobSync.sha },
                    ],
                }),
            });

            const fecha = new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
            const commit = await github('/git/commits', token, {
                method: 'POST',
                body: JSON.stringify({
                    message: 'data: Catalogo actualizado desde la app (' + fecha + ') - '
                        + (cuerpo.total || '?') + ' productos',
                    tree: arbol.sha,
                    parents: [ref.object.sha],
                }),
            });

            await github('/git/refs/heads/' + RAMA, token, {
                method: 'PATCH',
                body: JSON.stringify({ sha: commit.sha }),
            });

            return responder({ ok: true, commit: commit.sha });
        } catch (err) {
            return responder({ error: err.message }, 502);
        }
    },
};
