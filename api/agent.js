export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = String(body.message || "").trim();
    if (!message) return res.status(400).json({ error: "Mensagem obrigatória." });

    const token = process.env["AI_GATEWAY_API_KEY"];
    if (!token) return res.status(503).json({ mode: "demo", error: "Gateway de IA ainda não configurado." });

    const prompt = "Você é o agente comercial da Rodrigo Dev. Responda em português do Brasil, de forma curta, profissional e natural. Atenda, entenda a necessidade, qualifique o lead e conduza para uma próxima ação. Nunca invente preço, prazo ou disponibilidade. Mensagem do cliente: " + message;

    const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Erro no gateway." });
    const reply = data?.choices?.[0]?.message?.content || "Entendi. Vou registrar sua solicitação e orientar o próximo passo.";
    return res.status(200).json({ reply });
  } catch {
    return res.status(500).json({ error: "Erro interno no agente." });
  }
}