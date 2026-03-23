# AI Gateway

Route AI requests from VS Code through Vercel to your own local GPU — no open ports, one secret key, fully private.

```
VS Code (Continue) → Vercel (auth) → Cloudflare Tunnel → Your PC (Ollama)
```

This is the complete source code and setup guide for the AI Gateway video. By the end, you will have VS Code's Continue extension talking to a Qwen3 Coder 30B model running on your own hardware, accessible from anywhere through a single authenticated URL.

---

## Architecture

```
┌──────────────────────────────┐
│  VS Code + Continue Extension│
│  (sends chat requests)       │
└──────────────┬───────────────┘
               │ POST /api/v1/chat/completions
               │ Authorization: Bearer <your-key>
               ▼
┌──────────────────────────────┐
│  Vercel (Next.js)            │
│  - validates your secret key │
│  - rejects unauthorized calls│
│  - forwards to tunnel        │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│  Cloudflare Tunnel           │
│  - no open ports on router   │
│  - encrypted connection      │
└──────────────┬───────────────┘
               │ HTTP localhost
               ▼
┌──────────────────────────────┐
│  Ollama on Linux PC          │
│  - Qwen3 Coder 30B on GPU   │
│  - OpenAI-compatible API     │
└──────────────────────────────┘
```

**What this gives you:**

- No open ports on your router
- One URL you control
- One secret key in front of the model
- A local model running on your own machine

---

## Prerequisites

- A Linux machine with a GPU
- Terminal access with `sudo`
- Node.js and npm
- A Vercel account (free tier works)
- VS Code with the [Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue) extension

---

## Full Setup Guide

### Phase 1 — Install Ollama

Install Ollama on your Linux machine:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Start and enable the service:

```bash
sudo systemctl start ollama
sudo systemctl enable ollama
```

Verify it's running:

```bash
systemctl status ollama
curl http://localhost:11434/api/tags
```

### Phase 2 — Make Ollama Listen on the Network

By default Ollama only listens on localhost. We need it on `0.0.0.0` so Cloudflare Tunnel can reach it.

Create a systemd override:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
```

```bash
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
EOF
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Confirm it came back up:

```bash
systemctl status ollama
```

### Phase 3 — Pull the Model

Pull Qwen3 Coder 30B:

```bash
ollama pull qwen3-coder:30b
```

Run it once to confirm it loads:

```bash
ollama run qwen3-coder:30b
```

Test the OpenAI-compatible endpoint locally:

```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ollama" \
  -d '{
    "model": "qwen3-coder:30b",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

### Phase 4 — Set Up Cloudflare Tunnel

Install `cloudflared` on Debian/Ubuntu:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install cloudflared
```

Verify:

```bash
cloudflared --version
```

Start a quick tunnel pointing at Ollama:

```bash
cloudflared tunnel --url http://localhost:11434
```

Cloudflare prints a `*.trycloudflare.com` URL. **Copy this URL** — you will need it in the next step.

> **Note:** This is a temporary tunnel. If you restart it, the URL changes. For a permanent setup, use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

Leave this terminal running.

### Phase 5 — Create the Vercel Gateway

Create the Next.js project:

```bash
npx create-next-app@latest ai-gateway
cd ai-gateway
```

Create the API route:

```bash
mkdir -p app/api/v1/chat/completions
```

Create `app/api/v1/chat/completions/route.ts` with this code:

```ts
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");

  if (auth !== "Bearer YOUR-SECRET-KEY") {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.text();

  const response = await fetch(
    "https://YOUR-TUNNEL-URL.trycloudflare.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ollama",
      },
      body,
    }
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
```

**Replace:**
- `YOUR-SECRET-KEY` with any secret string you choose
- `YOUR-TUNNEL-URL.trycloudflare.com` with the URL from Phase 4

Install the Vercel CLI and deploy:

```bash
npm install -g vercel
vercel login
vercel --prod
```

After deployment, your endpoint will be:

```
https://<your-project>.vercel.app/api/v1/chat/completions
```

### Test the Full Pipeline

```bash
curl https://<your-project>.vercel.app/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-SECRET-KEY" \
  -d '{
    "model": "qwen3-coder:30b",
    "messages": [
      {"role": "user", "content": "Say hello"}
    ]
  }'
```

If you get a response from the model, the full stack is working.

---

## Configure VS Code Continue

Install the [Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue) extension in VS Code.

Open Continue's config and use:

```yaml
name: Local Config
version: 0.0.1
schema: v1

models:
  - name: Qwen Local
    provider: openai
    model: qwen3-coder:30b
    apiBase: https://<your-project>.vercel.app/api/v1
    apiKey: YOUR-SECRET-KEY
```

Replace `<your-project>` and `YOUR-SECRET-KEY` with your values.

Now open any file in VS Code and ask Continue a question. It will route through Vercel → Cloudflare → your local GPU.

---

## Project Structure

```
ai-gateway/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── chat/
│   │           └── completions/
│   │               └── route.ts   ← the gateway route
│   ├── layout.tsx
│   └── page.tsx
├── package.json
├── next.config.ts
└── tsconfig.json
```

The entire gateway is a single API route (`route.ts`). It validates the auth header, forwards the request to Cloudflare Tunnel, and streams the response back.

---

## Troubleshooting

### Continue does not connect

Make sure `apiBase` in your Continue config is:

```
https://<your-project>.vercel.app/api/v1
```

Not just the root domain. Not the raw Cloudflare URL.

### Unauthorized error

The `Authorization` header must match exactly what you set in `route.ts`:

```
Authorization: Bearer YOUR-SECRET-KEY
```

### Cloudflare URL stopped working

The `trycloudflare.com` URL is temporary. If the tunnel restarts, the URL changes. Update the URL in `route.ts` and redeploy with `vercel --prod`.

### Ollama not reachable

```bash
systemctl status ollama
curl http://localhost:11434/api/tags
```

### cloudflared not running

Restart the tunnel:

```bash
cloudflared tunnel --url http://localhost:11434
```

---

## Production Recommendations

For a long-term setup:

1. Store the API key in a Vercel environment variable instead of hardcoding it
2. Use a [named Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for a stable URL
3. Add rate limiting on the Vercel route
4. Rotate your secret key periodically

---

## Quick Reference

### Start everything (3 terminals)

**Terminal 1** — Ollama:
```bash
sudo systemctl start ollama
```

**Terminal 2** — Cloudflare Tunnel:
```bash
cloudflared tunnel --url http://localhost:11434
```

**Terminal 3** — Test:
```bash
curl https://<your-project>.vercel.app/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-SECRET-KEY" \
  -d '{"model":"qwen3-coder:30b","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Tech Stack

- [Next.js](https://nextjs.org/) — API route on Vercel
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — secure tunnel to local network
- [Ollama](https://ollama.com/) — local LLM inference server
- [Qwen3 Coder 30B](https://ollama.com/library/qwen3-coder) — coding model
- [Continue](https://continue.dev/) — VS Code AI extension

## License

MIT
