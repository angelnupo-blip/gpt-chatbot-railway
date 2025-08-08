// --- Dependencias ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- App Express ---
const app = express();
app.use(express.json());

// --- CORS para tu dominio ---
app.use(cors({
  origin: ['https://www.tentmirador.com', 'https://tentmirador.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// --- Cargar tentmirador.md local ---
let tentInfo = "";

function loadTentInfoLocal() {
  try {
    const filePath = path.join(__dirname, 'tentmirador.md');
    tentInfo = fs.readFileSync(filePath, 'utf8') || "";
    console.log("✅ tentmirador.md cargado localmente (" + tentInfo.length + " chars)");
  } catch (err) {
    console.error("❌ No pude leer tentmirador.md local:", err.message);
    tentInfo = "";
  }
}

// Carga al iniciar
loadTentInfoLocal();

// --- Funciones para extraer contexto ---
function extractSection(title) {
  if (!tentInfo) return "";
  const i = tentInfo.indexOf(title);
  if (i === -1) return "";
  const rest = tentInfo.slice(i);
  const j = rest.indexOf("\n## "); // inicio de la siguiente sección
  const section = j !== -1 ? rest.slice(0, j) : rest;
  return section.trim().slice(0, 1200); // recorte de seguridad
}

function getRelevantContext(userText = "") {
  const t = (userText || "").toLowerCase();

  if (t.includes("descuento") || t.includes("isic") || t.includes("precio") || t.includes("tarifa")) {
    return extractSection("## Descuentos");
  }
  if (t.includes("actividad") || t.includes("hacer") || t.includes("fogata") || t.includes("caminata")) {
    return extractSection("## Actividades");
  }
  if (t.includes("check-in") || t.includes("check in") || t.includes("check-out") || t.includes("política")) {
    return extractSection("## Políticas");
  }
  if (t.includes("capacidad") || t.includes("personas") || t.includes("tiendas")) {
    return extractSection("## Capacidad");
  }
  if (t.includes("ubicación") || t.includes("dónde") || t.includes("como llegar") || t.includes("cómo llegar")) {
    return extractSection("## Ubicación");
  }

  // fallback: primeros ~800 chars del doc
  return tentInfo.slice(0, 800);
}

// --- Endpoint del chatbot ---
app.post('/chat', async (req, res) => {
  const { messages } = req.body || {};
  const lastUserMsg = Array.isArray(messages)
    ? [...messages].reverse().find(m => m.role === 'user')?.content || ""
    : "";

  const context = getRelevantContext(lastUserMsg);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-5', // Cambia aquí el modelo si quieres usar otro
        messages: [
          {
            role: 'system',
            content: `Eres Camila, asistente cálida y útil de Tent Mirador. 
Responde con precisión y no inventes datos; usa el contexto cuando aplique.`
          },
          ...(context ? [{ role: 'system', content: `Contexto:\n${context}` }] : []),
          ...messages
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || 'Lo siento, no pude responder.';
    if (context) console.log('🧩 Contexto inyectado (chars):', context.length);
    res.json({ role: 'assistant', content: reply });

  } catch (err) {
    console.error('❌ Error OpenAI:', err.response?.data || err.message);
    res.status(500).json({ role: 'assistant', content: 'Error al conectar con el modelo. Inténtalo en unos segundos.' });
  }
});

// --- Iniciar servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
