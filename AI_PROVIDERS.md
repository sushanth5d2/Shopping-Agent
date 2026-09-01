# ShopAgent AI Providers

ShopAgent supports two production AI paths behind one provider interface:

## 1. Ollama local AI (no paid/cloud API)

Run Ollama locally and choose any compatible local model. The application talks only to the local Ollama service; prompts do not need to leave the machine. Current Ollama models include Qwen, Gemma, Llama, DeepSeek and others.

Example:

```bash
ollama pull qwen3:8b
ollama serve
```

Environment:

```env
SHOPAGENT_AI_PROVIDER=ollama
SHOPAGENT_OLLAMA_BASE_URL=http://localhost:11434
SHOPAGENT_OLLAMA_MODEL=qwen3:8b
```

## 2. Hosted API AI

The `api` provider uses an OpenAI-compatible `/chat/completions` endpoint. The API key remains server-side. This can point to OpenAI or another compatible provider.

```env
SHOPAGENT_AI_PROVIDER=api
SHOPAGENT_AI_API_BASE_URL=https://api.openai.com/v1
SHOPAGENT_AI_API_KEY=...
SHOPAGENT_AI_API_MODEL=gpt-4o-mini
```

## Fallback

If the configured provider is unavailable, ShopAgent falls back to its deterministic parser for the basic shopping-intent schema. It never fabricates a successful AI response.

## Status

`GET /api/ai/status` reports whether Ollama is reachable and which local models are installed, plus whether the hosted provider is configured.

For stronger local reasoning, choose a model that fits the machine's RAM/VRAM. Ollama's current library includes Qwen3, Qwen3.5, Gemma4, DeepSeek-R1, Llama and other tool/vision-capable models.

## Free local model catalog

ShopAgent supports two classes of no-API AI:

1. **Embedded browser inference** using Transformers.js/ONNX. The catalog currently includes documented browser-compatible Qwen3 0.6B, Granite 4.0 350M, and LaMini-Flan-T5 77M configurations. Transformers.js runs models locally through WASM and can use WebGPU where supported; WebGPU support varies by browser. The model can be configured to use local model files and remote loading can be disabled for air-gapped deployments.
2. **Ollama local inference**. ShopAgent discovers every model actually installed in the user's Ollama instance through `/api/tags`, rather than pretending a fixed list is installed. Any compatible Ollama model can be selected by name.

The phrase "all free AI models" is implemented as **all installed compatible Ollama models + a verified browser-compatible catalog**, not a claim that every open model on the internet is bundled into the application.
