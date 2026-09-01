# Built-in Free AI (No Cloud AI API)

ShopAgent now has a third AI mode: **embedded browser-local inference** using Transformers.js.

- No OpenAI/Anthropic/Gemini API key is required.
- No cloud AI API request is made for inference.
- The model is downloaded once from its model repository and cached by the browser; after caching, inference can run offline.
- Default model: `Xenova/LaMini-Flan-T5-77M`.
- The model can be replaced with a local model artifact using the Transformers.js local-model configuration.
- The backend remains the source of truth for authorization, price math, limits, monitoring, and checkout safety.
- Ollama remains available as a second local provider; cloud API remains optional.

## Provider priority

`embedded-local` -> `ollama` -> `cloud-api` only when explicitly configured.

The embedded model is used by the Web command box and extension product-title normalization. It is not trusted for purchase authorization.

Transformers.js supports browser inference with WASM or WebGPU and quantized models. See the official documentation.
