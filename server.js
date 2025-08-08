// --- Dependencias ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- App Express ---
const app = express();
app.use(express.json());

// --- CORS para tus dominios ---
app.use(cors({
  origin: ['https://www.tentmirador.com', 'https://tentmirador.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// --- Modelo configurable (por si quieres alternar) ---
const MODEL = process.env.MODEL || 'gpt-5'; // puedes poner gpt-4o, gpt-3.5-turbo, etc.

// --- Fallback: cargar tentmirador.md local (root del repo) ---
let localTentInfo = '';
function loadLocalTentInfo() {
  try {
    const filePath = path.join(__dirname, 'tentmirador.md');
    localTentInfo = fs.readFileSync(filePath, 'utf8') || '';
    console.log('✅ tentmirador.md local cargado (' + localTentInfo.length + ' chars)');
  } catch (err) {
    console.warn('ℹ️ No se encontró tentmirador.md local:', err.message);
    localTentInfo = '';
  }
}
loadLocalTentInfo();

// ---------------------- CONTEXTO DESDE TU DOMINIO ----------------------

// Fuentes permitidas (lista blanca)
const ALLOWED_SOURCES = [
  'https://www.tentmirador.com/camila.md',
  'https://www.tentmirador.com/reviews',
  'https://www.tentmirador.com/confirm',
  'https://www.tentmirador.com/local'
];

// Caché en memoria: url -> { text, ts }
const cache = new Map();

// Simple extractor de texto para HTML (sin dependencias)
function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  // quita scripts/estilos
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '');
  // reemplaza <br> y <p> por saltos de línea
  html = html.replace(/<(br|p)\s*\/?>/gi, '\n');
  // quita tags
  html = html.replace(/<\/?[^>]+>/g, ' ');
  // decodifica entidades básicas
  const entities = { '&nbsp;':' ', '&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&#39;':"'" };
  html = html.replace(/&[a-z#0-9]+;/gi, m => entities[m] || ' ');
  // normaliza espacios
  return html.replace(/\s+\n/g, '\n').replace(/\n\s+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

// Descarga con caché y TTL (ms)
async function fetchWithCache(url, ttlMs = 30 * 60 * 1000) {
  if (!ALLOWED_SOURCES.includes(url)) throw new Error('URL no permitida: ' + url);
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && (now - hit.ts) < ttlMs) return hit.text;

  const { data, headers } = await axios.get(url, { timeout: 10000 });
  let text = '';
  const contentType = (headers['content-type'] || '').toLowerCase();

  if (typeof data === 'string') {
    // Si parece Markdown (camila.md) lo dejamos tal cual; si es HTML, lo limpiamos
    if (contentType.includes('text/markdown') || url.endsWith('.md')) {
      text = data;
    } else {
      text = htmlToText(data);
    }
  } else {
    text = JSON.stringify(data);
  }

  // Recorte de seguridad
  text = text.trim().slice(0, 12000);
  cache.set(url, { text, ts: now });
  return text;
}

// Elección de fuentes según intención del usuario
async function getWebContextFor(question) {
  const q = (question || '').toLowerCase();

  // Base: prompt maestro en tu dominio (camila.md)
  let base = '';
  try { base = await fetchWithCache('https://www.tentmirador.com/camila.md'); }
  catch (e) { base = ''; }

  // Enruta según intención
  const wantReviews = /(opinion|reseñ|review|comentari)/.test(q);
  const wantBooking = /(reserv|disponibil|confirm|fecha|calendario)/.test(q);
  const wantLocal   = /(colmado|restaurante|local(es)?|comida)/.test(q);

  let extra = '';
  try { if (wantReviews) extra += '\n\n' + await fetchWithCache('https://www.tentmirador.com/reviews'); } catch(e){}
  try { if (wantBooking) extra += '\n\n' + await fetchWithCache('https://www.tentmirador.com/confirm'); } catch(e){}
  try { if (wantLocal)   extra += '\n\n' + await fetchWithCache('https://www.tentmirador.com/local'); } catch(e){}

  // Si todo falló, usa fallback local (si existe)
  if (!base && !extra && localTentInfo) {
    base = localTentInfo;
  }

  // Recorte total
  const MAX = 6000; // ajustable
  const ctx = (base + '\n\n' + extra).slice(0, MAX).trim();
  return ctx;
}

// ---------------------- ENDPOINTS ----------------------

// Chat endpoint (compatible con tu frontend actual que manda { messages })
app.post('/chat', async (req, res) => {
  const { messages } = req.body || {};
  const lastUserMsg = Array.isArray(messages)
    ? [...messages].reverse().find(m => m.role === 'user')?.content || ''
    : '';

  // Trae contexto desde tu dominio (con caché) o usa fallback local
  const webContext = await getWebContextFor(lastUserMsg);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: MODEL, // <- configurable por env MODEL
        messages: [
          {
            role: 'system',
            content:
`Eres Camila, analista de datos y mercadotecnia de Tent Mirador.
Respondes en español, tono cálido y evocador, con lenguaje sensorial y profesional cercano.
Usa SOLO el CONTEXTO si es relevante; si falta información, sugiere confirmar por WhatsApp de Tent Mirador.
Evita la palabra "No". Habla en cuarta persona (Nosotros). Evita cierres repetitivos.`
          },
          ...(webContext ? [{ role: 'system', content: `CONTEXTO (no lo muestres tal cual):\n${webContext}` }] : []),
          ...messages
        ]
        // Importante: SIN "temperature" para evitar errores en modelos que no lo soportan
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || 'En este momento no tengo respuesta. Intentemos de nuevo.';
    if (webContext) console.log('🌐 Contexto web inyectado (chars):', webContext.length);
    res.json({ role: 'assistant', content: reply });

  } catch (err) {
    console.error('❌ Error OpenAI:', err.response?.data || err.message);
    res.status(500).json({ role: 'assistant', content: 'Error al conectar con el modelo.' });
  }
});

// Healthcheck
app.get('/', (req, res) => res.send('✅ Camila online'));

// Debug: tamaño de contexto disponible (local y cache)
app.get('/debug', (req, res) => {
  const cacheReport = {};
  for (const [k, v] of cache.entries()) {
    cacheReport[k] = { chars: v.text.length, ageSec: Math.round((Date.now() - v.ts)/1000) };
  }
  res.json({
    model: MODEL,
    localTentInfoChars: localTentInfo.length,
    cache: cacheReport
  });
});

// Forzar refresco de caché
app.post('/refresh-context', async (req, res) => {
  try {
    for (const url of ALLOWED_SOURCES) {
      await fetchWithCache(url, 0); // TTL=0 => fuerza recarga
    }
    res.json({ ok: true, refreshed: ALLOWED_SOURCES.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Iniciar servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT} | Modelo: ${MODEL}`));
