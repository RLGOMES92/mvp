# AI Sales Agent — Rodrigo Dev

Demonstração de um painel comercial para organizar leads, acompanhar oportunidades e follow-ups e simular conversas com um agente de atendimento.

**Demo online:** https://rlgomes92.github.io/mvp/

## O que a demonstração inclui

- **Dashboard:** indicadores calculados a partir dos dados da demonstração.
- **Leads:** cadastro, edição, busca, filtros e validações básicas.
- **Pipeline comercial:** acompanhamento das etapas das oportunidades.
- **Follow-ups:** agendamento, adiamento e conclusão de tarefas.
- **Conversas:** simulação de atendimento, sugestões de resposta e encaminhamento para atendimento humano.
- **Configurações:** base de conhecimento e opções de comportamento do agente.

## Importante: o que funciona hoje

Este projeto é um **MVP demonstrativo**, não um CRM pronto para uso empresarial em produção.

- A interface publicada no GitHub Pages é estática.
- Os dados ficam no armazenamento local do navegador (`localStorage`). Eles não são sincronizados entre dispositivos nem compartilhados com uma equipe.
- A demonstração inclui dados fictícios. Não insira informações reais ou confidenciais de clientes.
- O atendimento local usa regras de demonstração; isso não significa que uma IA externa esteja conectada.
- A rota `/api/agent` é uma função de servidor destinada à Vercel. Para usar a integração real de IA, é necessário publicar o backend e configurar as variáveis de ambiente.
- Login, banco de dados centralizado, contas separadas por empresa, integrações operacionais com WhatsApp e Zoho CRM e cobrança recorrente **ainda não estão implementados**.

## Publicar a integração de IA na Vercel

1. Importe este repositório na Vercel.
2. Em **Settings → Environment Variables**, configure `AI_GATEWAY_API_KEY`.
3. Opcionalmente, configure:
   - `AI_MODEL`: modelo utilizado pelo gateway. O padrão no código é `openai/gpt-5-mini`.
   - `AI_MAX_TOKENS`: limite de tokens da resposta.
   - `ALLOWED_ORIGINS`: origens permitidas, separadas por vírgula.
4. Faça o deploy e configure o frontend para chamar o endpoint da implantação.

**Segurança:** nunca coloque chaves de API no HTML, no JavaScript do navegador ou em commits do GitHub. Use variáveis de ambiente no backend.

## Como testar localmente

Abra `index.html` em um navegador para experimentar a interface. Como o projeto usa recursos do navegador, teste também em um celular real antes de apresentar a demonstração a clientes.

O repositório contém testes em `tests/run.js`; para executá-los, é necessário preparar um ambiente Node.js e instalar as dependências apropriadas. Os testes automatizados não substituem a validação do fluxo publicado nem a configuração do backend.

## Próximas etapas para uma versão de produção

1. Backend e banco de dados persistente.
2. Autenticação e isolamento seguro dos dados de cada empresa.
3. Testes de segurança, monitoramento e limitação de requisições persistente.
4. Integração com WhatsApp Business Platform e Zoho CRM.
5. Gestão de consentimento, descadastro e auditoria.
6. Planos e cobrança recorrente.

---

Projeto desenvolvido por **Rodrigo Dev** como demonstração de produto e portfólio.