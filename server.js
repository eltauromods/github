const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const GROQ_API_KEYS = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5
].filter(key => key && key.trim() !== ''); 

const MODELS = {
    fast: 'llama-3.1-8b-instant',     
    balanced: 'llama-4-scout-17b',      
    quality: 'llama-3.3-70b-versatile' 
};

let keyUsage = {};
GROQ_API_KEYS.forEach(key => {
    keyUsage[key] = { requestsToday: 0, lastReset: new Date().toDateString() };
});

function resetDailyCounters() {
    const today = new Date().toDateString();
    GROQ_API_KEYS.forEach(key => {
        if (keyUsage[key].lastReset !== today) {
            keyUsage[key].requestsToday = 0;
            keyUsage[key].lastReset = today;
        }
    });
}

function getBestAvailableKey() {
    resetDailyCounters();
    
    const LIMITE_POR_KEY = 1000;
    
    const availableKeys = GROQ_API_KEYS.filter(key => {
        return keyUsage[key].requestsToday < LIMITE_POR_KEY;
    });
    
    if (availableKeys.length === 0) {
        console.warn('⚠️ Taurok alcanzo su limite diario');
        return null;
    }
    
    return availableKeys.reduce((best, key) => {
        return keyUsage[key].requestsToday < keyUsage[best].requestsToday ? key : best;
    }, availableKeys[0]);
}

function incrementKeyUsage(key) {
    if (keyUsage[key]) {
        keyUsage[key].requestsToday++;
    }
}

async function callGroqWithFallback(messages, model = MODELS.fast) {
    const errors = [];
    
    for (let intento = 0; intento < GROQ_API_KEYS.length * 2; intento++) {
        const apiKey = getBestAvailableKey();
        if (!apiKey) break;
        
        try {
            console.log(`🔄 Usando API key: ${apiKey.substring(0, 10)}... (intentos hoy: ${keyUsage[apiKey].requestsToday})`);
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.85,
                    max_tokens: 1024
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data?.choices?.[0]?.message?.content) {
                incrementKeyUsage(apiKey);
                console.log(`✅ Éxito con key ${apiKey.substring(0, 10)}...`);
                return data;
            }
            
            if (response.status === 429) {
                console.log(`⚠️ Rate limit en key ${apiKey.substring(0, 10)}..., probando otra`);
                errors.push({ key: apiKey.substring(0, 10), error: 'Rate limit', status: 429 });
                continue;
            }
            
            errors.push({ key: apiKey.substring(0, 10), error: data.error?.message || 'Error desconocido', status: response.status });
            
        } catch (err) {
            console.error(`❌ Error con key:`, err.message);
            errors.push({ key: apiKey?.substring(0, 10), error: err.message });
        }
    }
    
    return {
        choices: [{
            message: {
                content: `⚠️ Por ahora Taurok está en mantenimiento.\n\nDetalles: ${JSON.stringify(errors, null, 2)}\n\nIntenta de nuevo más tarde o espera un par de minutos.`
            }
        }]
    };
}

app.get('/', (req, res) => {
    res.json({ 
        status: 'Taurok AI online',
        groqKeys: GROQ_API_KEYS.length,
        availableModels: MODELS
    });
});

app.post('/chat', async (req, res) => {
    try {
        const { message = '', systemPrompt = '', recentMessages = [], model = 'fast' } = req.body;
        
        if (!message.trim()) {
            return res.status(400).json({ error: 'No message provided' });
        }
        
        const selectedModel = MODELS[model] || MODELS.fast;
        
        const messages = [];
        
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        
        for (const msg of recentMessages) {
            if (msg?.role && msg?.content) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
        
        messages.push({ role: 'user', content: message });
        
        console.log(`📨 Mensaje recibido. Usando modelo: ${selectedModel}`);
        
        const response = await callGroqWithFallback(messages, selectedModel);
        return res.json(response);
        
    } catch (error) {
        console.error('Error en /chat:', error);
        return res.status(500).json({
            choices: [{ message: { content: 'Error interno del servidor: ' + error.message } }]
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Taurok IA corriendo en puerto ${PORT}`);
    console.log(`📊 API Keys de Taurok configuradas: ${GROQ_API_KEYS.length}`);
    console.log(`🎯 Modelos disponibles:`, MODELS);
});
