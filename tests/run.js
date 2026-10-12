const {JSDOM}=require("jsdom");const fs=require("fs");
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log("FALHOU:",m));if(c)console.log("ok  -",m)};
const html=fs.readFileSync("index.html","utf8");
function boot(ls){const d=new JSDOM(html,{runScripts:"dangerously",url:"https://x.test/",pretendToBeVisual:true,beforeParse(w){w.confirm=()=>true;w.fetch=()=>Promise.reject(new Error("offline"));w.scrollTo=()=>{};if(ls)for(const k in ls)w.localStorage.setItem(k,ls[k])}});return d}
(async()=>{
 let d=boot(),w=d.window,$=id=>w.document.getElementById(id);
 w.go("app");
 for(const t of ["dash","leads","chat","pipe","fu","wa","cfg"]){w.setTab(t);ok($("t-"+t).innerHTML.length>50&&!$("t-"+t).classList.contains("hide"),"aba "+t+" renderiza")}
 ok(w.eval("D").leads.length===8,"8 leads de demonstração");
 // KPIs
 w.setTab("dash");ok(/LEADS NO PERÍODO<\/small><div>8/.test($("t-dash").innerHTML),"KPI leads = 8 (calculado)");
 ok(/CONVERSÃO<\/small><div>13%/.test($("t-dash").innerHTML),"conversão 1/8 = 13%");
 // criar lead
 w.leadForm();$("f_n").value="Teste Novo";$("f_p").value="(11) 95555-1234";$("f_e").value="teste@x.com";$("f_val").value="1500";w.saveLead(0);
 ok(w.eval("D").leads.length===9&&w.eval("D").leads[0].n==="Teste Novo","criar lead");
 ok(JSON.parse(w.localStorage.getItem("aisa:v1")).leads.length===9,"persistiu no localStorage");
 // duplicado
 w.leadForm();$("f_n").value="Outro";$("f_p").value="11955551234";w.saveLead(0);
 ok(w.eval("D").leads.length===9&&/duplicado/i.test($("f_err").textContent),"bloqueia duplicado por telefone");
 w.closeModal();w.leadForm();$("f_n").value="Outro2";$("f_e").value="TESTE@x.com";w.saveLead(0);ok(w.eval("D").leads.length===9,"bloqueia duplicado por e-mail");
 // validação
 w.closeModal();w.leadForm();$("f_n").value="A";w.saveLead(0);ok(/nome/i.test($("f_err").textContent),"valida nome curto");
 $("f_n").value="Ana B";$("f_e").value="invalido";w.saveLead(0);ok(/E-mail/.test($("f_err").textContent),"valida e-mail");
 $("f_e").value="";$("f_p").value="123";w.saveLead(0);ok(/Telefone/.test($("f_err").textContent),"valida telefone");
 w.closeModal();
 // editar + etapa + histórico
 const id=w.eval("D").leads[0].id;w.leadForm(id);$("f_st").value="Proposta";w.saveLead(id);
 ok(w.eval("get")(id).st==="Proposta"&&w.eval("get")(id).act.some(a=>/Etapa alterada/.test(a.t)),"editar etapa + histórico");
 // pipeline
 w.mv(id,"Ganho");ok(w.eval("get")(id).st==="Ganho","mover no pipeline");
 // busca/filtro
 w.setTab("leads");w.eval("S").q="clínica";w.leadList();ok(/João Silva/.test($("ll").innerHTML)&&!/Maria/.test($("ll").innerHTML),"busca");
 w.eval("S").q="zzzz";w.leadList();ok(/Nenhum lead encontrado/.test($("ll").innerHTML),"estado vazio da busca");w.eval("S").q="";
 // follow-ups
 const late=w.eval("D").leads.filter(l=>w.eval("fst")(l)==="atrasado").map(l=>l.n);ok(late.includes("Maria Souza"),"Maria aparece atrasada");
 w.setTab("fu");w.fuSnooze(2);ok(w.eval("get")(2).fd>Date.now(),"adiar follow-up");
 w.fuDone(1,"concluído");ok(w.eval("get")(1).fs==="concluído"&&!w.eval("fst")(w.eval("get")(1)),"concluir follow-up");
 w.setTab("fu");$("fsel").value="3";$("fdate").value="2030-01-02";w.fuSchedule();ok(w.eval("get")(3).fd>Date.now(),"agendar follow-up");
 // chat: sugestão vs enviado
 w.eval("S").cur=3;w.setTab("chat");$("inp").value="Gostaria de fazer um orçamento, é urgente";await w.sendMsg();
 ok(w.eval("get")(3).st==="Qualificado"&&w.eval("get")(3).sc>=80,"intenção de compra qualifica e eleva score");
 ok(!!w.eval("S").drafts[3]&&!w.eval("get")(3).m.some(m=>m.r==="a"&&m.t===w.eval("S").drafts[3].t),"resposta fica como SUGESTÃO (não enviada)");
 w.approveDraft(3);ok(w.eval("get")(3).m.slice(-1)[0].r==="a"&&!w.eval("S").drafts[3],"aprovar registra a resposta");
 // opt-out
 $("inp").value="Não quero mais receber mensagens";await w.sendMsg();
 ok(w.eval("get")(3).opt&&w.eval("get")(3).fs==="cancelado"&&!w.eval("S").drafts[3],"opt-out detectado, follow-up cancelado, sem resposta");
 w.fuMsg(3);ok(/não envie/i.test($("ov").innerHTML),"sugestão bloqueada para opt-out");w.closeModal();
 // humano
 w.eval("S").cur=4;w.toHuman(4);$("inp")||w.setTab("chat");$("inp").value="oi";await w.sendMsg();ok(w.eval("get")(4).hum&&!w.eval("S").drafts[4],"IA não responde com humano ativo");
 // auto-send
 w.eval("D").cfg.auto=true;w.eval("S").cur=5;w.setTab("chat");const n0=w.eval("get")(5).m.length;$("inp").value="quero saber sobre site";await w.sendMsg();
 ok(w.eval("get")(5).m.length===n0+2&&w.eval("get")(5).m[n0+1].src==="local","envio automático só com política ligada; origem marcada como local");
 // XSS
 w.leadForm();$("f_n").value='<img src=x onerror=alert(1)>';w.saveLead(0);w.setTab("leads");w.eval("S").q="";w.leadList();ok(!/<img src=x/.test($("ll").innerHTML),"escapa HTML (XSS)");
 // excluir
 const n=w.eval("D").leads.length;w.delLead(w.eval("D").leads[0].id);ok(w.eval("D").leads.length===n-1,"excluir com confirmação");
 // recarregar: persistência
 const ls={"aisa:v1":w.localStorage.getItem("aisa:v1")};const w2=boot(ls).window;ok(w2.eval("D").leads.length===w.eval("D").leads.length,"dados sobrevivem ao recarregar");
 // localStorage corrompido
 const w3=boot({"aisa:v1":"{lixo"}).window;ok(w3.eval("D").leads.length===8,"localStorage corrompido volta ao demo");
 // export/reset/wipe
 w.wipe();ok(w.eval("D").leads.length===0,"apagar tudo");w.setTab("dash");ok(/Nenhuma atividade/.test($("t-dash").innerHTML),"dashboard vazio ok");w.setTab("chat");ok(/Cadastre um lead/.test($("t-chat").innerHTML),"chat vazio ok");w.setTab("pipe");w.setTab("fu");ok(/Nenhum follow-up/.test($("t-fu").innerHTML),"follow-ups vazio ok");
 w.resetDemo();ok(w.eval("D").leads.length===8,"restaurar demo");
 console.log(`\nINTERFACE: ${pass} passaram, ${fail} falharam`);
 // ---- API ----
 const mod=await import("../api/agent.js");let p2=0,f2=0;const ok2=(c,m)=>{c?p2++:(f2++,console.log("FALHOU API:",m));if(c)console.log("ok  - API:",m)};
 const mk=(o)=>{const r={h:{},code:0,body:null,setHeader(k,v){this.h[k]=v},status(c){this.code=c;return this},json(b){this.body=b;return this},end(){return this}};return[{method:"POST",headers:{"x-forwarded-for":o.ip||"1.1.1.1"},body:o.body,...o.req},r]};
 let [rq,rs]=mk({req:{method:"GET"}});await mod.default(rq,rs);ok2(rs.code===405,"GET → 405");
 [rq,rs]=mk({body:{message:""}});await mod.default(rq,rs);ok2(rs.code===400,"mensagem vazia → 400");
 [rq,rs]=mk({body:"{x"});await mod.default(rq,rs);ok2(rs.code===400,"JSON inválido → 400");
 delete process.env.AI_GATEWAY_API_KEY;[rq,rs]=mk({body:{message:"oi"}});await mod.default(rq,rs);ok2(rs.code===503&&rs.body.mode==="demo","sem chave → 503 demo (sem vazar nada)");
 process.env.AI_GATEWAY_API_KEY="k";let sent;global.fetch=async(u,o)=>{sent=JSON.parse(o.body);return{ok:true,status:200,json:async()=>({choices:[{message:{content:"Olá!"}}],usage:{total_tokens:42}})}};
 [rq,rs]=mk({body:{message:"x".repeat(900),history:[{role:"system",content:"hack"},{role:"user",content:"a"}],kb:"Sites",company:"ACME"}});await mod.default(rq,rs);
 ok2(rs.code===200&&rs.body.reply==="Olá!"&&rs.body.usage.total_tokens===42,"resposta 200 com consumo de tokens");
 ok2(sent.messages[0].role==="system"&&sent.messages[sent.messages.length-1].content.length===500,"system separado; mensagem limitada a 500");
 ok2(!sent.messages.some(m=>m.content==="hack"),"descarta role 'system' enviada pelo cliente");
 global.fetch=async()=>({ok:false,status:429,json:async()=>({error:{message:"secret detail"}})});[rq,rs]=mk({body:{message:"oi"},ip:"2.2.2.2"});await mod.default(rq,rs);ok2(rs.code===429&&!/secret/.test(JSON.stringify(rs.body)),"limite do provedor → 429 sem vazar detalhes");
 let last;for(let i=0;i<12;i++){[rq,rs]=mk({body:{message:"oi"},ip:"3.3.3.3"});await mod.default(rq,rs);last=rs.code}ok2(last===429,"rate limit por IP");
 process.env.ALLOWED_ORIGINS="https://ok.test";[rq,rs]=mk({body:{message:"oi"},req:{headers:{origin:"https://evil.test","x-forwarded-for":"4.4.4.4"}}});await mod.default(rq,rs);ok2(rs.code===403,"origem não permitida → 403");
 console.log(`API: ${p2} passaram, ${f2} falharam`);process.exit(fail+f2?1:0);
})();
