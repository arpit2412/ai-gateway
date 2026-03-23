export async function POST(req: Request) {
  const auth = req.headers.get("authorization");

  if (auth !== "Bearer AIP-SECURE-2026") {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.text();

  const response = await fetch(
    "https://ground-soil-appointed-federal.trycloudflare.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ollama"
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
