# Setup Supabase MCP em outro repo

**Como usar:** abra o Claude Code dentro do repo novo. Copie tudo que está abaixo da linha `---` e cole como prompt. Reinicie o Claude Code quando pedir.

---

Configure o Supabase MCP pra este repositório seguindo exatamente estes passos:

1. **Pegue o project ref deste repo.** Leia `.env.local` (ou `.env`) e extraia o ref de `NEXT_PUBLIC_SUPABASE_URL` (parte antes de `.supabase.co`). Se a URL não existir, me pergunte.

2. **Reuse o PAT que já tenho.** Leia `~/.claude/mcp.json`. Pegue o valor de `SUPABASE_ACCESS_TOKEN` da entrada `supabase` existente — é o mesmo PAT pra todos meus projetos Supabase. Se a entrada não existir nesse arquivo, pare e me peça pra colar o PAT.

3. **Adicione uma NOVA entrada em `mcpServers` no `~/.claude/mcp.json`** (sem apagar as existentes):
   - chave: `supabase-<nome-da-pasta-deste-repo>` (ex: `supabase-onsite-eagle`)
   - `command`: `npx`
   - `args`: `["-y", "@supabase/mcp-server-supabase@latest", "--read-only", "--project-ref=<ref-deste-repo>"]`
   - `env`: `{ "SUPABASE_ACCESS_TOKEN": "<PAT lido do passo 2>" }`

4. **Limpe `.env.local`:** se houver linhas soltas começando com `sbp_` ou `sb_secret_` que NÃO são referenciadas pelo código (faça grep nelas), remova. Mantenha as variáveis nomeadas que o app usa.

5. **Salve memória do projeto** com: project ref deste repo, modo read-only, e o nome da entrada MCP criada.

6. **Me responda:** "Pronto. Feche e abra o Claude Code, aprove o servidor MCP `supabase-<nome>`."

**Regras:**
- NÃO escreva o PAT em nenhum arquivo dentro do repositório — ele só pode existir em `~/.claude/mcp.json`.
- NÃO troque a entrada `supabase` original — só adicione novas entradas com nomes únicos por repo.
- Se já existir uma entrada com o mesmo nome no mcp.json, me pergunte se sobrescrevo.
