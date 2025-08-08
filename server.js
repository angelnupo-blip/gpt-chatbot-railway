const express = require('express');
const axios = require('axios');
const app = express();
const cors = require('cors');
app.use(cors({
  origin: 'https://www.tentmirador.com'  // permite solo tu dominio
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
          { role: 'system', content: 'Eres un GPT personalizado creado por Ángel. Siempre responde con calidez, claridad y conocimiento profundo.' },
          ...messages
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data.choices[0].message);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Error al obtener respuesta de OpenAI' });
  }
});

app.get('/', (req, res) => res.send("Chatbot corriendo correctamente."));

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor funcionando');
});
