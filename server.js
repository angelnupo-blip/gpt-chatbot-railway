const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'https://www.tentmirador.com',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Eres Camila, una guía cálida, amigable y útil creada por Ángel para asistir a los visitantes de Tent Mirador.'
          },
          ...messages
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content;
    if (reply) {
      res.json({ role: 'assistant', content: reply });
    } else {
      res.status(500).json({ role: 'assistant', content: 'No pude generar una respuesta válida.' });
    }

  } catch (err) {
    console.error('❌ Error al consultar OpenAI:', err.response?.data || err.message);
    res.status(500).json({ role: 'assistant', content: 'Error al conectar con el modelo. Inténtalo más tarde.' });
  }
});

app.get('/', (req, res) => {
  res.send("✅ Chatbot Camila corriendo correctamente.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
