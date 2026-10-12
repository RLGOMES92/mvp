// Testes de interface (jsdom). Opcional: precisa de `npm i --no-save jsdom`. Sem jsdom, os testes são pulados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
let JSDOM = null; try { ({ JSDOM } = await import("jsdom")); } catch { /* opcional */ }
const skip = JSDOM ? false : "jsdom não instalado";
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const enc = new TextEncoder();
const stream = (events, chunk = 23) => { const b = enc.encode(events.map(e => JSON.stringify(e) + "\n").join("")); let i = 0; return { ok: true, status: 200, body: { getReader: () => ({ read: async () => i >= b.length ? { done: true } : { done: false, value: b.slice(i, i += chunk) } }) } }; };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const PROFILE = { url: "https://sorrisobela.com.br/", host: "sorrisobela.com.br", name: "Clínica Sorriso Bela", segment: "Odontologia", segmentVia: "dados estruturados do site", description: "Clínica odontológica em Campinas.", services: ["Implantes dentários", "Ortodontia"], differentiators: [], contacts: { phones: ["(19) 3234-5678"], whatsapp: [], emails: ["contato@sorrisobela.com.br"], address: "Rua das Flores, 123" }, hours: [], faqs: [], pagesAnalyzed: ["https://sorrisobela.com.br/", "https://sorrisobela.com.br/servicos"], missing: ["horário de atendimento", "perguntas frequentes"] };
const ANALYZE_OK = [{ type: "step", id: "validate", label: "v", status: "active" }, { type: "step", id: "validate", label: "v", status: "done", detail: "sorrisobela.com.br" }, { type: "step", id: "robots", label: "r", status: "done" }, { type: "step", id: "home", label: "h", status: "done", detail: "12 KB" }, { type: "step", id: "pages", label: "p", status: "done", detail: "1 página(s)" }, { type: "step", id: "structure", label: "s", status: "done" }, { type: "done", profile: PROFILE, notes: ["Algumas páginas internas não puderam ser lidas."], partial: false }];

function boot(routes) {
  const calls = [], opened = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://mvp.test/", pretendToBeVisual: true, beforeParse(w) {
    w.TextDecoder = TextDecoder; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}; w.open = (...a) => { opened.push(a); return null; }; w.confirm = () => true;
    w.fetch = async (url, o = {}) => { const body = o.body ? JSON.parse(o.body) : null; calls.push({ url, body }); const r = routes[url]; if (!r) return json(404, {}); const v = typeof r === "function" ? r(body, calls.filter(c => c.url === url).length) : r; if (v instanceof Error) throw v; return v; };
  } });
  const w = dom.window, $ = id => w.document.getElementById(id);
  const waitFor = async (cond, ms = 1500) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await new Promise(r => setTimeout(r, 5)); } return false; };
  return { w, $, calls, opened, waitFor };
}
const visible = (t, id) => !t.$(id).hidden;

test("a landing continua com o CRM e a nova seção", { skip }, () => {
  const t = boot({}); assert.ok(t.$("demo-ia")); assert.match(t.$("demo-ia").textContent, /Teste uma IA no seu negócio/); assert.match(t.$("demo-ia").textContent, /Informe o endereço do seu site e descubra como um assistente de inteligência artificial/);
  assert.equal(t.$("ds-go").textContent, "Analisar meu site"); assert.ok(t.$("v-app") && t.$("v-plans") && t.$("v-project"));
  assert.ok(!/AI_GATEWAY|sk-[a-z0-9]{10}|api[_-]?key\s*[:=]\s*["'][^"']{8}/i.test(html), "nenhum segredo no front-end");
});
test("fluxo completo: analisar → conferir/editar → testar o agente → CTA → WhatsApp", { skip }, async () => {
  const t = boot({ "/api/analyze": () => stream(ANALYZE_OK), "/api/demo-chat": b => json(200, { reply: "Oferecemos <img src=x onerror=alert(1)> implantes dentários e ortodontia." }), "/api/lead": b => json(200, { ok: true, saved: false, whatsappText: "Olá Rodrigo! texto " + b.name }) });
  t.$("ds-url").value = "sorrisobela.com.br"; await t.w.__ds.analyze();
  assert.ok(visible(t, "ds-s3") && !visible(t, "ds-s1")); assert.equal(t.calls[0].body.url, "sorrisobela.com.br");
  assert.equal([...t.w.document.querySelectorAll("#ds-steps li.done")].length, 5, "etapas de progresso concluídas");
  assert.equal(t.$("ds-name").value, "Clínica Sorriso Bela"); assert.equal(t.$("ds-svc").value, "Implantes dentários\nOrtodontia"); assert.equal(t.$("ds-phone").value, "(19) 3234-5678"); assert.equal(t.$("ds-hours").value, "");
  assert.match(t.w.document.querySelector('.ds-tag[data-f="hours"]').textContent, /não encontrado/); assert.match(t.w.document.querySelector('.ds-tag[data-f="name"]').textContent, /encontrado no site/);
  assert.match(t.$("ds-notes").textContent, /Algumas páginas internas/); assert.match(t.$("ds-notes").textContent, /Páginas lidas: 2/);
  t.$("ds-hours").value = "Seg a sex 8h–18h"; t.$("ds-hours").dispatchEvent(new t.w.Event("input")); assert.match(t.w.document.querySelector('.ds-tag[data-f="hours"]').textContent, /editado/);
  t.$("ds-confirm").click(); assert.ok(visible(t, "ds-s4")); assert.ok(!visible(t, "ds-s5"), "CTA só depois de ver a IA funcionando");
  const chips = [...t.w.document.querySelectorAll(".ds-chip")].map(c => c.textContent); for (const c of ["Quais serviços vocês oferecem?", "Como posso solicitar um orçamento?", "Qual é o diferencial da empresa?", "Como faço para entrar em contato?"]) assert.ok(chips.includes(c), c); assert.ok(chips.includes("Como funciona Implantes dentários?"));
  t.w.document.querySelector(".ds-chip").click(); assert.ok(await t.waitFor(() => t.calls.some(c => c.url === "/api/demo-chat") && visible(t, "ds-s5")));
  const sent = t.calls.find(c => c.url === "/api/demo-chat").body; assert.equal(sent.message, "Quais serviços vocês oferecem?"); assert.deepEqual(sent.profile.hours, ["Seg a sex 8h–18h"]); assert.equal(sent.profile.name, "Clínica Sorriso Bela");
  assert.equal(t.w.document.querySelectorAll("#ds-msgs img").length, 0, "HTML da resposta não é interpretado (XSS)"); assert.match(t.$("ds-msgs").textContent, /implantes dentários/); assert.match(t.$("ds-msgs").textContent, /IA · baseada nos dados confirmados/);
  assert.match(t.$("ds-s5").textContent, /Gostou de ver uma IA funcionando no seu negócio\?/); assert.match(t.$("ds-s5").textContent, /Podemos transformar esta demonstração em uma solução personalizada/);
  // lead
  t.w.document.querySelector('[data-lead="hire"]').click(); assert.ok(visible(t, "ds-lead")); assert.equal(t.$("ld-company").value, "Clínica Sorriso Bela");
  await Promise.all([t.$("ld-send").click()]); assert.match(t.$("ld-err").textContent, /nome/i); t.$("ld-name").value = "Ana";
  t.$("ld-contact").value = "xyz"; t.$("ld-send").click(); assert.match(t.$("ld-err").textContent, /e-mail ou telefone/i);
  t.$("ld-contact").value = "ana@x.com"; t.$("ld-send").click(); assert.match(t.$("ld-err").textContent, /Autorize/); assert.equal(t.opened.length, 0, "não abre WhatsApp sem validar/consentir");
  t.$("ld-consent").checked = true; t.$("ld-send").click(); assert.ok(await t.waitFor(() => t.opened.length === 1));
  assert.match(t.opened[0][0], /^https:\/\/wa\.me\/5511983179592\?text=/); assert.match(decodeURIComponent(t.opened[0][0]), /texto Ana/); const lb = t.calls.find(c => c.url === "/api/lead").body; assert.equal(lb.consent, true); assert.equal(lb.kind, "hire"); assert.equal(lb.host, "sorrisobela.com.br"); assert.equal(lb.website, "");
  assert.ok(!/salv|enviado ao CRM/i.test(t.$("ld-err").textContent));
  t.$("ld-wa").click(); assert.equal(t.opened.length, 2); assert.match(decodeURIComponent(t.opened[1][0]), /sorrisobela\.com\.br/);
});
test("erros da análise são claros e mantêm o usuário no início com saída manual", { skip }, async () => {
  const cases = [[json(429, { error: "Você atingiu o limite de análises por hora." }), /limite de análises/], [json(404, {}), /Preencha os dados manualmente/], [json(503, { error: "A demonstração atingiu o limite de uso de hoje." }), /limite de uso de hoje/],
    [stream([{ type: "step", id: "validate", status: "active" }, { type: "error", code: "blocked", message: "O site bloqueia acessos automatizados (código 403).", manual: true }]), /bloqueia acessos automatizados/], [stream([{ type: "error", code: "forbidden_ip", message: "Este endereço aponta para uma rede interna e não pode ser analisado.", manual: false }]), /rede interna/],
    [new Error("rede"), /Não foi possível falar com o servidor/], [stream([{ type: "step", id: "home", status: "active" }]), /interrompida/]];
  for (const [r, re] of cases) { const t = boot({ "/api/analyze": () => r }); t.$("ds-url").value = "x.com.br"; await t.w.__ds.analyze(); assert.ok(visible(t, "ds-s1") && !visible(t, "ds-s2"), String(re)); assert.match(t.$("ds-err").textContent, re); assert.ok(!t.$("ds-go").disabled); assert.ok(t.$("ds-manual")); }
});
test("validação do campo de URL no navegador (e nenhuma chamada desnecessária)", { skip }, async () => {
  const t = boot({ "/api/analyze": () => stream(ANALYZE_OK) });
  t.$("ds-url").value = ""; await t.w.__ds.analyze(); assert.match(t.$("ds-err").textContent, /Informe o endereço/);
  t.$("ds-url").value = "meu site .com"; await t.w.__ds.analyze(); assert.match(t.$("ds-err").textContent, /inválido/); t.$("ds-url").value = "a".repeat(301); await t.w.__ds.analyze(); assert.match(t.$("ds-err").textContent, /inválido/);
  assert.equal(t.calls.length, 0);
});
test("modo manual: nada é inventado e o agente só usa o que o visitante digitou", { skip }, async () => {
  const t = boot({ "/api/demo-chat": b => json(200, { reply: "ok" }) }); t.$("ds-manual").click(); assert.ok(visible(t, "ds-s3")); assert.equal(t.$("ds-name").value, ""); assert.equal(t.w.document.querySelector('.ds-tag[data-f="name"]').textContent, "");
  t.$("ds-confirm").click(); assert.match(t.$("ds-rv-err").textContent, /ao menos o nome/); assert.ok(!visible(t, "ds-s4")); t.$("ds-name").value = "Padaria Pão Quente"; t.$("ds-confirm").click(); assert.ok(visible(t, "ds-s4"));
  t.$("ds-q").value = "Oi"; t.$("ds-send").click(); assert.ok(await t.waitFor(() => t.calls.length === 1)); assert.deepEqual(t.calls[0].body.profile.services, []);
});
test("IA indisponível: resposta local HONESTA (rotulada) usando só dados confirmados; perguntas sem dado não são inventadas", { skip }, async () => {
  const t = boot({ "/api/analyze": () => stream(ANALYZE_OK), "/api/demo-chat": () => json(503, { error: "x", code: "not_configured" }) });
  t.$("ds-url").value = "sorrisobela.com.br"; await t.w.__ds.analyze(); t.$("ds-confirm").click();
  t.$("ds-q").value = "Como faço para entrar em contato?"; await t.w.__ds.send(); assert.match(t.$("ds-msgs").textContent, /\(19\) 3234-5678/); assert.match(t.$("ds-msgs").textContent, /SEM IA/);
  t.$("ds-q").value = "Qual o horário de funcionamento?"; await t.w.__ds.send(); assert.match(t.$("ds-msgs").textContent, /Não encontrei essa informação/);
  t.$("ds-q").value = "Quanto custa um implante?"; await t.w.__ds.send(); assert.ok(!/R\$/.test(t.$("ds-msgs").textContent));
  assert.equal(t.calls.filter(c => c.url === "/api/demo-chat").length, 1, "depois de detectar IA indisponível não insiste a cada mensagem");
});
test("erros do chat: limite, falha de rede e resposta 502", { skip }, async () => {
  const t = boot({ "/api/analyze": () => stream(ANALYZE_OK), "/api/demo-chat": (b, n) => n === 1 ? json(429, { error: "Você atingiu o limite de mensagens da demonstração.", code: "rate_limited" }) : n === 2 ? new Error("rede") : json(502, { error: "A IA está indisponível agora." }) });
  t.$("ds-url").value = "sorrisobela.com.br"; await t.w.__ds.analyze(); t.$("ds-confirm").click();
  for (const re of [/limite de mensagens da demonstração/, /Verifique sua conexão/, /indisponível/]) { t.$("ds-q").value = "oi"; await t.w.__ds.send(); assert.match(t.$("ds-msgs").textContent, re); assert.ok(!t.$("ds-send").disabled); }
  assert.ok(visible(t, "ds-s5"), "quando bate no limite, o CTA fica visível");
});
test("limite de 15 mensagens por sessão no navegador (o servidor também aplica o seu)", { skip }, async () => {
  const t = boot({ "/api/analyze": () => stream(ANALYZE_OK), "/api/demo-chat": () => json(200, { reply: "ok" }) }); t.$("ds-url").value = "sorrisobela.com.br"; await t.w.__ds.analyze(); t.$("ds-confirm").click();
  for (let i = 0; i < 15; i++) { t.$("ds-q").value = "pergunta " + i; await t.w.__ds.send(); } const n = t.calls.filter(c => c.url === "/api/demo-chat").length; assert.equal(n, 15);
  t.$("ds-q").value = "mais uma"; await t.w.__ds.send(); assert.equal(t.calls.filter(c => c.url === "/api/demo-chat").length, 15); assert.match(t.$("ds-msgs").textContent, /limite de 15 mensagens/);
  const last = t.calls.filter(c => c.url === "/api/demo-chat").at(-1).body; assert.ok(last.history.length <= 8);
});
test("análise parcial avisa e permite completar", { skip }, async () => {
  const p = { ...PROFILE, services: [], description: null, segment: null, contacts: { phones: [], whatsapp: [], emails: [], address: null }, missing: ["segmento", "produtos e serviços", "telefone"] };
  const t = boot({ "/api/analyze": () => stream([{ type: "done", profile: p, notes: ["Encontramos pouco texto na página."], partial: true, insufficient: true }]) }); t.$("ds-url").value = "x.com.br"; await t.w.__ds.analyze();
  assert.match(t.$("ds-notes").textContent, /Poucas informações foram encontradas/); assert.match(t.$("ds-notes").textContent, /pouco texto/); assert.match(t.w.document.querySelector('.ds-tag[data-f="services"]').textContent, /não encontrado/); assert.equal(t.$("ds-svc").value, "");
});
