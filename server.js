const fs = require('fs');

// Leer el archivo tentmirador.md al iniciar
const tentMiradorInfo = fs.readFileSync('tentmirador.md', 'utf-8');

// Cuando llega un mensaje del usuario:
const messages = [
  {
    role: 'system',
    content: tentMiradorInfo
  },
  {
    role: 'user',
    content: userMessage
  }
];

// Enviar a la API de OpenAI
const completion = await openai.chat.completions.create({
  model: 'gpt-5', // o el que uses
  messages: messages
});
