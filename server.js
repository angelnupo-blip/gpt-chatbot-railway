import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { config } from "dotenv";
import OpenAI from "openai";

config();
const app = express();
app.use(express.json());

// CORS
app.use(cors({
  origin: ['https://www.tentmirador.com', 'https://tentmirador.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- Cargar contexto inicial una sola vez ---
let camilaContext = "";
(async () => {
  try {
    const res = await fetch("https://www.tentmirador.com/camila.md");
    camilaContext = await res.text();
    console.log(`✅ Contexto cargado (${camilaContext.length} caracteres)`);
  } catch (err) {
    console.error("❌ Error cargando camila.md:", err);
  }
})();

// --- Ruta del chatbot ---
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    // Insertar contexto solo si es el primer mensaje
    let updatedMessages = [...messages];
    if (messages.length === 1) {
      updatedMessages = [
        {
          role: "system",
          content: `Eres Camila, asistente del alojamiento Tent Mirador. 
          Usa solo la información siguiente para responder de forma breve y directa, sin agregar detalles no solicitados:
          ---
          ${camilaContext}
          ---
          Si no hay información, indica que se debe consultar con el anfitrión por WhatsApp.`
        },
        ...messages
      ];
    }

    const completion = await client.chat.completions.create({
      model: "gpt-5", // o "gpt-4o"
      messages: updatedMessages,
      max_tokens: 200 // para evitar respuestas largas
    });

    res.json({
      reply: completion.choices[0].message.content
    });

  } catch (error) {
    console.error("❌ Error OpenAI:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// --- Iniciar servidor ---
app.listen(3000, () => console.log("🚀 Servidor activo en puerto 3000"));
