import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { isForbiddenIp, validateUrl, createFetcher, safeFetcher, NetError } from "../api/_lib/net.js";

test("IPs proibidos (IPv4, IPv6, mapeados, metadados)", () => {
  const bad = ["127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.5",
    "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:db8::1", "ff02::1", "[::1]", "nao-e-ip", "", "999.1.1.1", "1.2.3"];
  for (const ip of bad) assert.equal(isForbiddenIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "142.250.80.46", "172.15.0.1", "172.32.0.1", "2606:4700::1111", "2a00:1450:4001::200e"]) assert.equal(isForbiddenIp(ip), false, ip);
  assert.equal(isForbiddenIp(undefined), true);
});

test("validateUrl: normaliza e aceita sites públicos", () => {
  assert.equal(validateUrl("exemplo.com.br").url.href, "https://exemplo.com.br/");
  assert.equal(validateUrl("  HTTP://Exemplo.com/Sobre?x=1#frag ").url.href, "http://exemplo.com/Sobre?x=1");
  assert.equal(validateUrl("//exemplo.com").host, "exemplo.com");
  assert.equal(validateUrl("https://exemplo.com:443/").url.port, "");
  assert.equal(validateUrl("https://EXEMPLO.com./a").host, "exemplo.com");
  assert.equal(validateUrl("https://bücher.de").host, "xn--bcher-kva.de");
});
test("validateUrl: rejeita esquemas, credenciais, portas, hosts internos e formas disfarçadas de IP", () => {
  const cases = ["", "   ", "ftp://x.com", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "mailto:a@b.com", "gopher://x.com", "http://user:pass@exemplo.com", "http://exemplo.com:8080", "https://exemplo.com:22", "http://exemplo.com:6379",
    "http://localhost", "http://LOCALHOST/", "http://foo.localhost", "http://intranet", "http://servidor.local", "http://app.internal", "http://metadata.google.internal/computeMetadata/v1/", "http://metadata",
    "http://127.0.0.1", "http://127.1", "http://2130706433", "http://0x7f.0.0.1", "http://0177.0.0.1", "http://017700000001", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5", "http://192.168.0.1", "http://0.0.0.0", "http://[fd00:ec2::254]/",
    "http://exemplo .com", "http://exe mplo.com", "http://a..com", "http://-a.com", "a".repeat(2100), "http://exem\u0000plo.com"];
  for (const c of cases) assert.throws(() => validateUrl(c), e => e instanceof NetError, JSON.stringify(c).slice(0, 60));
});

// ---- Fetcher com servidores locais de verdade ----
let hits = 0; const sockets = new Set();
const srv = http.createServer((req, res) => {
  hits++;
  const big = "<html><body>" + "x".repeat(3_000_000) + "</body></html>";
  switch (req.url) {
    case "/ok": res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end("<html><title>Ok</title><body>olá</body></html>");
    case "/redir-ok": res.writeHead(302, { Location: "/ok" }); return res.end();
    case "/redir-bad": res.writeHead(302, { Location: "http://internal.test:" + srv.address().port + "/secret" }); return res.end();
    case "/redir-meta": res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }); return res.end();
    case "/redir-localhost": res.writeHead(302, { Location: "http://localhost/" }); return res.end();
    case "/redir-scheme": res.writeHead(302, { Location: "file:///etc/passwd" }); return res.end();
    case "/redir-port": res.writeHead(302, { Location: "http://pub.test:22/" }); return res.end();
    case "/redir-cred": res.writeHead(302, { Location: "http://a:b@pub.test/" }); return res.end();
    case "/loop": res.writeHead(302, { Location: "/loop" }); return res.end();
    case "/big": res.writeHead(200, { "Content-Type": "text/html" }); return res.end(big);
    case "/json": res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}");
    case "/pdf": res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end("%PDF");
    case "/hang": res.writeHead(200, { "Content-Type": "text/html" }); res.write("<html>"); return;       // nunca termina
    case "/403": res.writeHead(403, { "Content-Type": "text/html" }); return res.end("no");
    case "/secret": res.writeHead(200, { "Content-Type": "text/html" }); return res.end("SEGREDO INTERNO");
    default: res.writeHead(404); return res.end();
  }
});
srv.on("connection", s => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const PORT = srv.address().port;
const map = { "pub.test": ["127.0.0.1"], "internal.test": ["10.0.0.5"], "mixed.test": ["127.0.0.1", "10.0.0.5"], "meta.test": ["169.254.169.254"], "mapped.test": ["::ffff:127.0.0.1"] };
const lookup = (host, opts, cb) => { const a = map[host]; if (!a) { const e = new Error("nx"); e.code = "ENOTFOUND"; return cb(e); } cb(null, a.map(address => ({ address, family: address.includes(":") ? 6 : 4 }))); };
const f = createFetcher({ lookup, isIpAllowed: ip => ip === "127.0.0.1", allowPort: p => p === "" || p === String(PORT), timeoutMs: 700, deadlineMs: 1500, maxBytes: 200_000 });
const U = p => `http://pub.test:${PORT}${p}`;
const code = async p => f.get(p).then(() => "OK", e => e.code);

test("fetcher: página normal e redirecionamento legítimo", async () => {
  const r = await f.get(U("/ok")); assert.equal(r.status, 200); assert.match(r.body, /olá/);
  const r2 = await f.get(U("/redir-ok")); assert.equal(r2.status, 200); assert.equal(r2.chain.length, 2);
});
test("fetcher: bloqueia redirecionamento para host que resolve a IP privado (e nunca lê o conteúdo)", async () => {
  hits = 0; assert.equal(await code(U("/redir-bad")), "blocked_ip"); assert.equal(hits, 1);       // só a 1ª requisição chegou ao servidor
});
test("fetcher: bloqueia redirecionamentos para metadados, localhost, esquema, porta e credenciais", async () => {
  assert.equal(await code(U("/redir-meta")), "forbidden_ip");
  assert.equal(await code(U("/redir-localhost")), "forbidden_host");
  assert.equal(await code(U("/redir-scheme")), "scheme");
  assert.equal(await code(U("/redir-port")), "port");
  assert.equal(await code(U("/redir-cred")), "credentials");
});
test("fetcher: laço de redirecionamentos é interrompido", async () => { assert.equal(await code(U("/loop")), "redirects"); });
test("fetcher: DNS com qualquer IP proibido (misto, metadados, IPv4 mapeado) é bloqueado antes de conectar", async () => {
  for (const h of ["internal.test", "mixed.test", "meta.test", "mapped.test"]) { hits = 0; assert.equal(await code(`http://${h}:${PORT}/ok`), "blocked_ip", h); assert.equal(hits, 0, h + " não deveria conectar"); }
});
test("fetcher: domínio inexistente → dns", async () => { assert.equal(await code(`http://nao-existe.test:${PORT}/`), "dns"); });
test("fetcher: corpo grande é truncado no limite", async () => { const r = await f.get(U("/big")); assert.equal(r.truncated, true); assert.ok(r.body.length <= 200_000); });
test("fetcher: tipos não-HTML são recusados", async () => { assert.equal(await code(U("/json")), "unsupported_content"); assert.equal(await code(U("/pdf")), "unsupported_content"); });
test("fetcher: servidor que trava → timeout", async () => { const t = Date.now(); assert.equal(await code(U("/hang")), "timeout"); assert.ok(Date.now() - t < 2500); });
test("fetcher: status 403 é devolvido para o chamador classificar", async () => { assert.equal((await f.get(U("/403"))).status, 403); });

test("fetcher ESTRITO (produção): localhost/IP privado nunca chega ao servidor", async () => {
  hits = 0;
  for (const t of [`http://127.0.0.1:${PORT}/ok`, `http://localhost:${PORT}/ok`, `http://[::1]:${PORT}/ok`, `http://2130706433:${PORT}/ok`, `http://0x7f.1:${PORT}/ok`]) await assert.rejects(safeFetcher.get(t), e => e instanceof NetError, t);
  assert.equal(hits, 0);
});
test("fetcher ESTRITO: hostname que resolve a loopback (ex.: localtest.me) é bloqueado pelo DNS real", async () => {
  hits = 0; await assert.rejects(safeFetcher.get("http://localtest.me/ok"), e => ["blocked_ip", "dns", "unreachable"].includes(e.code)); assert.equal(hits, 0);
});
test("rede real: site público acessível (pypi.org)", { skip: process.env.NO_NET ? "sem rede" : false }, async () => {
  const r = await safeFetcher.get("https://pypi.org/"); assert.equal(r.status, 200); assert.ok(r.body.length > 1000); assert.match(r.contentType, /html/);
});
test("rede real: TLS inválido é recusado (self-signed)", { skip: process.env.NO_NET ? "sem rede" : false }, async () => {
  await assert.rejects(safeFetcher.get("https://self-signed.badssl.com/"), e => ["tls", "dns", "unreachable", "blocked_ip"].includes(e.code));
});
test.after(() => { for (const s of sockets) s.destroy(); srv.close(); });
