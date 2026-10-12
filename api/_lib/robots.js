// Interpretação simples e conservadora do robots.txt (RFC 9309): vale o grupo mais específico para o nosso agente, senão "*".
export function parseRobots(txt, agent = "rodrigodevdemobot") {
  const groups = []; let cur = null, lastWasUa = false;
  for (const raw of String(txt || "").slice(0, 200000).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!cur || !lastWasUa) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasUa = true; }
    else if ((k === "allow" || k === "disallow") && cur) { cur.rules.push({ allow: k === "allow", path: v }); lastWasUa = false; } else lastWasUa = false;
  }
  const mine = groups.filter(g => g.agents.some(a => a !== "*" && agent.includes(a))); const star = groups.filter(g => g.agents.includes("*"));
  const rules = (mine.length ? mine : star).flatMap(g => g.rules);
  return { rules };
}
const toRe = p => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
export function robotsAllows(parsed, pathAndQuery) {
  let best = null;
  for (const r of parsed.rules) { if (!r.path) continue; if (toRe(r.path).test(pathAndQuery)) { const len = r.path.length; if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow }; } }
  return best ? best.allow : true;
}
