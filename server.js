const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const providers = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile'
  },
  {
    name: 'cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    key: process.env.CEREBRAS_API_KEY,
    model: 'llama3.1-8b'
  },
  {
    name: 'sambanova',
    url: 'https://api.sambanova.ai/v1/chat/completions',
    key: process.env.SAMBANOVA_API_KEY,
    model: 'Meta-Llama-3.1-8B-Instruct'
  }
];

app.get('/', (req, res) => {
  res.json({ status: 'Taurok API online' });
});

app.post('/chat', async (req, res) => {
  try {
    const { message = '', systemPrompt = '', recentMessages = [] } = req.body;

    if (!message.trim()) {
      return res.status(400).json({
        error: 'No message provided'
      });
    }

    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    for (const msg of recentMessages) {
      if (msg?.role && msg?.content) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    messages.push({
      role: 'user',
      content: message
    });

    const errors = [];

    for (const provider of providers) {
      if (!provider.key) continue;

      try {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            temperature: 0.85,
            max_tokens: 1024
          })
        });

        const data = await response.json();

        if (response.ok && data?.choices?.[0]?.message?.content) {
          return res.json(data);
        }

        errors.push({
          provider: provider.name,
          status: response.status,
          response: data
        });

      } catch (err) {
        errors.push({
          provider: provider.name,
          error: err.message
        });
      }
    }

    return res.status(500).json({
      choices: [
        {
          message: {
            content:
              'Taurok IA está peleando con las demás IAs.\n\n' +
              JSON.stringify(errors, null, 2)
          }
        }
      ]
    });

  } catch (error) {
    return res.status(500).json({
      choices: [
        {
          message: {
            content: 'Error interno del servidor: ' + error.message
          }
        }
      ]
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Taurok API running on port', PORT);
});