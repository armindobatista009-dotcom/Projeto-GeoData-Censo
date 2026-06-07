# GeoData Censo

Visualização e consulta de dados do Censo 2022 - IBGE (Agregados por Setores Censitários).

## Stack

- **Backend:** Node.js + Express 5
- **Banco:** SQLite (geografia), CSV (dados censitários)
- **Frontend:** HTML/CSS/JS vanilla (SPA)

## Como rodar

```bash
npm install
npm start
```

Acesse `http://localhost:3003`

## Estrutura

```
├── server.js          Servidor Express (API + arquivos estáticos)
├── data-query.js      Motor de consulta em CSVs com índice por offset
├── db-config.js       Catálogo de variáveis do Censo (frontend + backend)
├── migrate.js         Script de migração (extrai geografia dos CSVs para SQLite)
├── geodata-censo.html Frontend SPA
├── data/              CSVs do IBGE, dicionário XLSX e banco SQLite
└── .env               Configurações (porta, senha admin, CORS, etc.)
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3003` | Porta do servidor |
| `ADMIN_EMAIL` | `admin@geodata.br` | Email do admin inicial |
| `ADMIN_SENHA` | `censo2024` | Senha do admin inicial |
| `SESSION_SECRET` | auto | Chave para assinar tokens de sessão |
| `ALLOWED_ORIGINS` | vazio | Origins permitidas no CORS (vírgula p/ múltiplas) |
| `NODE_ENV` | - | `production` reduz limite de upload e otimiza segurança |

## Produção

Use `NODE_ENV=production` e configure `ALLOWED_ORIGINS` com seu domínio.
Recomendado usar reverse proxy (nginx/Caddy) com HTTPS.
