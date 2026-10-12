// Camada de rede segura para analisar sites de terceiros (proteção contra SSRF).
// Princípios: (1) validar a URL, (2) resolver o DNS e validar TODOS os IPs, (3) conectar exatamente no IP validado
// (sem segunda resolução → sem DNS rebinding), (4) revalidar a cada redirecionamento, (5) limites de tempo/tamanho.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class NetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------- IPs proibidos ---------- */
const v4 = new net.BlockList();
[["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
 ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
 ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]].forEach(([a, p]) => v4.addSubnet(a, p, "ipv4"));
const v6bad = new net.BlockList();
[["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]].forEach(([a, p]) => v6bad.addSubnet(a, p, "ipv6"));
const v6global = new net.BlockList();
v6global.addSubnet("2000::", 3, "ipv6");   // só unicast global é permitido

function mappedV4(ip) {   // ::ffff:a.b.c.d ou ::ffff:7f00:1
  const m = /^::ffff:(.+)$/i.exec(ip); if (!m) return null;
  if (net.isIPv4(m[1])) return m[1];
  const h = m[1].split(":"); if (h.length !== 2 || h.some(x => !/^[0-9a-f]{1,4}$/i.test(x))) return "0.0.0.0";
  const n = (parseInt(h[0], 16) << 16) | parseInt(h[1], 16);
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
/** true = NÃO pode conectar. Qualquer coisa que não seja IP válido também é proibida. */
export function isForbiddenIp(ip) {
  if (typeof ip !== "string") return true;
  const clean = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const kind = net.isIP(clean);
  if (!kind) return true;
  if (kind === 4) return v4.check(clean, "ipv4");
  const mapped = mappedV4(clean.toLowerCase());
  if (mapped) return isForbiddenIp(mapped);
  if (!v6global.check(clean, "ipv6")) return true;
  return v6bad.check(clean, "ipv6");
}

/* ---------- URL ---------- */
const BAD_HOST_SUFFIX = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan", ".intranet", ".corp", ".private"];
const BAD_HOST = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data", "kubernetes.default.svc"]);

/** Normaliza e valida a URL digitada. Só HTTP/HTTPS, porta padrão, sem credenciais, sem destino interno. */
export function validateUrl(input, { allowPort = p => p === "" } = {}) {
  let raw = String(input ?? "").trim();
  if (!raw) throw new NetError("invalid_url", "Informe o endereço do site.");
  if (raw.length > 2048 || /[\s\u0000-\u001f]/.test(raw)) throw new NetError("invalid_url", "Endereço inválido.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) throw new NetError("scheme", "Use um endereço http:// ou https://.");
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i.test(raw)) {
    throw new NetError("scheme", "Use um endereço http:// ou https://.");
  } else raw = "https://" + raw.replace(/^\/\//, "");
  let u; try { u = new URL(raw); } catch { throw new NetError("invalid_url", "Endereço inválido."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new NetError("scheme", "Use um endereço http:// ou https://.");
  if (u.username || u.password) throw new NetError("credentials", "O endereço não pode conter usuário ou senha.");
  if (!allowPort(u.port)) throw new NetError("port", "Porta não permitida. Use o endereço padrão do site.");
  u.hash = "";
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) host = host.slice(1, -1);
  if (!host || host.length > 253) throw new NetError("invalid_url", "Endereço inválido.");
  if (net.isIP(host)) { if (isForbiddenIp(host)) throw new NetError("forbidden_ip", "Este endereço aponta para uma rede interna e não pode ser analisado."); return { url: u, host }; }
  if (BAD_HOST.has(host) || BAD_HOST_SUFFIX.some(s => host.endsWith(s)) || !host.includes(".")) throw new NetError("forbidden_host", "Este endereço não é um site público.");
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some(l => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) throw new NetError("invalid_url", "Endereço inválido.");
  return { url: u, host };
}

/* ---------- Fetcher ---------- */
function mapError(e) {
  if (e instanceof NetError) return e;
  const c = e?.code || "";
  if (c === "ENOTFOUND" || c === "EAI_AGAIN" || c === "ENODATA") return new NetError("dns", "Não encontramos este domínio. Confira se o endereço está correto.");
  if (c === "ECONNREFUSED" || c === "ECONNRESET" || c === "EHOSTUNREACH" || c === "ENETUNREACH" || c === "EPIPE") return new NetError("unreachable", "O site não respondeu. Ele pode estar fora do ar ou bloqueando acessos automatizados.");
  if (/CERT|TLS|SSL|ERR_SSL|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(c + " " + (e?.message || ""))) return new NetError("tls", "O certificado de segurança do site é inválido ou não pôde ser verificado.");
  if (c === "ETIMEDOUT") return new NetError("timeout", "O site demorou demais para responder.");
  return new NetError("unreachable", "Não foi possível acessar o site.");
}

export function createFetcher(opts = {}) {
  const {
    lookup = dns.lookup,
    isIpAllowed = ip => !isForbiddenIp(ip),
    allowPort = p => p === "",
    timeoutMs = 8000, deadlineMs = 15000, maxBytes = 1_000_000, maxRedirects = 4,
    userAgent = "RodrigoDevDemoBot/1.0 (analise publica solicitada pelo visitante; sem JavaScript)",
  } = opts;

  // Resolve e valida TODOS os endereços; conecta no primeiro permitido (o socket usa exatamente este IP).
  const pinnedLookup = (hostname, options, cb) => {
    if (typeof options === "function") { cb = options; options = {}; }
    lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
      if (!list.length) return cb(new NetError("dns", "Sem endereço para o domínio."));
      if (list.some(a => !isIpAllowed(a.address))) return cb(new NetError("blocked_ip", "Este endereço resolve para uma rede interna e foi bloqueado."));
      const pick = list.find(a => a.family === 4) || list[0];
      if (options && options.all) return cb(null, [{ address: pick.address, family: pick.family }]);
      cb(null, pick.address, pick.family);
    });
  };

  async function get(urlStr, { accept = "text/html,application/xhtml+xml;q=0.9", types = ["text/html", "application/xhtml+xml"], limit = maxBytes } = {}) {
    const started = Date.now(); let cur = validateUrl(urlStr, { allowPort }).url; const chain = [cur.href];
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const host = cur.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(host) && !isIpAllowed(host)) throw new NetError("blocked_ip", "Este endereço aponta para uma rede interna e foi bloqueado.");
      const left = deadlineMs - (Date.now() - started); if (left <= 0) throw new NetError("timeout", "O site demorou demais para responder.");
      let timedOut = false;
      const res = await new Promise((resolve, reject) => {
        const mod = cur.protocol === "https:" ? https : http; let settled = false;
        const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
        const req = mod.request({ protocol: cur.protocol, hostname: host, port: cur.port || undefined, path: cur.pathname + cur.search, method: "GET", lookup: pinnedLookup, agent: false,
          headers: { "User-Agent": userAgent, Accept: accept, "Accept-Encoding": "identity", "Accept-Language": "pt-BR,pt;q=0.9", Connection: "close" }, timeout: Math.min(timeoutMs, left) },
          r => done(resolve, r));
        const timer = setTimeout(() => req.destroy(new NetError("timeout", "O site demorou demais para responder.")), Math.min(timeoutMs, left));
        req.on("timeout", () => { timedOut = true; req.destroy(new NetError("timeout", "O site demorou demais para responder.")); });
        req.on("error", e => done(reject, e)); req.end();
      }).catch(e => { throw mapError(e); });

      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.destroy();
        if (hop === maxRedirects) throw new NetError("redirects", "O site redireciona demais (possível laço).");
        let next; try { next = new URL(res.headers.location, cur); } catch { throw new NetError("unreachable", "Redirecionamento inválido."); }
        cur = validateUrl(next.href, { allowPort }).url;      // revalida esquema, host, porta, credenciais
        chain.push(cur.href); continue;
      }
      const ctype = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (status >= 200 && status < 300 && types.length && !types.includes(ctype)) { res.destroy(); throw new NetError("unsupported_content", "O endereço não aponta para uma página web comum."); }
      const chunks = []; let size = 0, truncated = false;
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => { res.destroy(); reject(new NetError("timeout", "O site demorou demais para responder.")); }, Math.max(1, deadlineMs - (Date.now() - started)));
        res.on("data", c => { size += c.length; if (size > limit) { truncated = true; chunks.push(c.subarray(0, c.length - (size - limit))); res.destroy(); clearTimeout(t); resolve(); } else chunks.push(c); });
        res.on("end", () => { clearTimeout(t); resolve(); });
        res.on("close", () => { clearTimeout(t); if (!res.complete && !truncated) { if (timedOut) return reject(new NetError("timeout", "O site demorou demais para responder.")); truncated = true; } resolve(); });
        res.on("error", e => { clearTimeout(t); if (truncated) return resolve(); reject(timedOut ? new NetError("timeout", "O site demorou demais para responder.") : mapError(e)); });
      });
      return { status, url: cur.href, chain, headers: res.headers, contentType: ctype, body: Buffer.concat(chunks).toString("utf8"), truncated, bytes: size };
    }
    throw new NetError("redirects", "O site redireciona demais (possível laço).");
  }
  return { get };
}

export const safeFetcher = createFetcher();   // configuração de produção (estrita)
