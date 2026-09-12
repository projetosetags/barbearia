# Barbearia Leandro David

Novo projeto de agendamento e gestão da Barbearia Leandro David.

## Aplicações

- Cliente: `index.html`
- Barbeiro/Admin: `admin.html`
- Configuração central: `config.js`
- Banco novo: `supabase/schema.sql`

## Funcionamento atual

Enquanto o Supabase novo exclusivo da Barbearia não estiver conectado, o cliente pode concluir o pedido pelo WhatsApp diretamente pelo aplicativo.

Quando o novo banco for criado, basta preencher `supabaseUrl` e `supabasePublishableKey` em `config.js` e ativar o fluxo completo de persistência.

## Segurança

O schema foi preparado com RLS. Serviços, barbeiros e dados públicos da barbearia podem ser lidos pelo app público; clientes e agenda não têm leitura anônima. A gestão é destinada a usuários autenticados associados à tabela `perfis`.

## Backup

O sistema anterior foi preservado na branch `backup-sistema-antigo-2026-09-11`.
