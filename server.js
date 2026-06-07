const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3003;
const isProduction = process.env.NODE_ENV === 'production';

function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim();
            if (!process.env[key]) process.env[key] = value;
        }
    }
}

loadEnv();

const Database = require('better-sqlite3');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;

if (!ADMIN_EMAIL || !ADMIN_SENHA) {
    console.warn('⚠️ AVISO: ADMIN_EMAIL e ADMIN_SENHA devem ser definidos no .env ou nas variáveis de ambiente!');
    console.warn('   O servidor vai iniciar, mas NENHUM admin será criado no banco.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TEMPO_EXPIRACAO_MS = 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const dbPath = path.join(__dirname, 'data', 'geodata.db');
const gzPath = dbPath + '.gz';

// Decompress DB se necessário (deploy sem LFS)
if (!fs.existsSync(dbPath) && fs.existsSync(gzPath)) {
    console.log(' Descomprimindo banco de dados...');
    const zlib = require('zlib');
    const buf = fs.readFileSync(gzPath);
    fs.writeFileSync(dbPath, zlib.gunzipSync(buf));
    console.log(' Banco descomprimido:', (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1) + 'MB');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    nivel TEXT NOT NULL DEFAULT 'usuario',
    criado_em TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    nivel TEXT NOT NULL DEFAULT 'usuario',
    criada_em TEXT DEFAULT (datetime('now')),
    expira_em TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    tentativa_em TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessoes_email ON sessoes(email)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, tentativa_em)`);

// Cleanup login_attempts antigas a cada hora
setInterval(() => {
  db.exec("DELETE FROM login_attempts WHERE tentativa_em < datetime('now', '-1 day')");
}, 3600000).unref();

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 64).toString('hex');
}

function gerarSalt() {
  return crypto.randomBytes(32).toString('hex');
}

// Seed admin se ADMIN_EMAIL e ADMIN_SENHA estiverem configurados
if (ADMIN_EMAIL && ADMIN_SENHA) {
  const adminExistente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(ADMIN_EMAIL);
  if (!adminExistente) {
    const salt = gerarSalt();
    const hash = hashSenha(ADMIN_SENHA, salt);
    db.prepare('INSERT INTO usuarios (email, nome, hash, salt, nivel) VALUES (?, ?, ?, ?, ?)').run(ADMIN_EMAIL, 'Administrador', hash, salt, 'admin');
    console.log('  Admin cadastrado no banco:', ADMIN_EMAIL);
  }
} else {
  console.warn('  Nenhum admin configurado. Crie um usuário via /api/register ou defina ADMIN_EMAIL/ADMIN_SENHA.');
}
if (SESSION_SECRET === '4f7a8b2c9d1e3f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9') {
  console.warn(' AVISO: SESSION_SECRET está com o valor padrão do .env. Gere um novo valor para produção.');
}

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(express.json({ limit: isProduction ? '10mb' : '50mb' }));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (isProduction && ALLOWED_ORIGINS.length === 0) {
    console.warn(' AVISO: ALLOWED_ORIGINS não configurado em produção. CORS com credentials será BLOQUEADO.');
}
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        const permitir = ALLOWED_ORIGINS.length === 0 ? !isProduction : ALLOWED_ORIGINS.includes(origin);
        if (permitir) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

app.use((req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            console.log('[' + res.statusCode + '] ' + req.method + ' ' + req.originalUrl);
        }
    });
    next();
});

app.all('/favicon.ico', (req, res) => res.status(204).end());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

db.exec(`DELETE FROM sessoes WHERE expira_em < datetime('now')`);

function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Não autorizado' });
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ error: 'Token inválido' });
    const [rawToken, signature] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest();
    const actual = Buffer.from(signature, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(401).json({ error: 'Token inválido' });
    const sessao = db.prepare("SELECT * FROM sessoes WHERE token = ? AND expira_em >= datetime('now')").get(token);
    if (!sessao) return res.status(401).json({ error: 'Não autorizado' });
    req.user = sessao.email;
    next();
}

app.post('/api/login', (req, res) => {
    try {
        const { email, senha } = req.body || {};
        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha obrigatórios' });
        }
        const emailLower = email.toLowerCase().trim();

        // Rate limit check
        const recentAttempts = db.prepare(
            "SELECT COUNT(*) as c FROM login_attempts WHERE email = ? AND tentativa_em >= datetime('now', '-15 minutes')"
        ).get(emailLower);
        if (recentAttempts.c >= MAX_LOGIN_ATTEMPTS) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
        }
        db.prepare('INSERT INTO login_attempts (email) VALUES (?)').run(emailLower);

        const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(emailLower);
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const hash = hashSenha(senha, user.salt);
        if (hash !== user.hash) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Clear attempts on success
        db.prepare('DELETE FROM login_attempts WHERE email = ?').run(emailLower);

        const rawToken = crypto.randomBytes(48).toString('hex');
        const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
        const token = rawToken + '.' + hmac;
        const expiraEm = new Date(Date.now() + TEMPO_EXPIRACAO_MS).toISOString().replace('T', ' ').split('.')[0];
        db.prepare('INSERT INTO sessoes (token, email, nome, nivel, expira_em) VALUES (?, ?, ?, ?, ?)').run(
            token, user.email, user.nome, user.nivel, expiraEm
        );
        return res.json({ token, nome: user.nome, nivel: user.nivel });
    } catch (err) {
        console.error('Erro no login:', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { email, senha, nome } = req.body || {};
        if (!email || !senha || !nome) {
            return res.status(400).json({ error: 'Email, nome e senha obrigatórios' });
        }
        const emailLower = email.toLowerCase().trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
            return res.status(400).json({ error: 'Email inválido' });
        }
        if (senha.length < 8) {
            return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
        }
        if (!/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/\d/.test(senha)) {
            return res.status(400).json({ error: 'Senha deve conter letras maiúsculas, minúsculas e números' });
        }
        if (nome.trim().length < 2) {
            return res.status(400).json({ error: 'Nome deve ter no mínimo 2 caracteres' });
        }

        // Rate limit check for registration
        const recentRegs = db.prepare(
            "SELECT COUNT(*) as c FROM login_attempts WHERE email = ? AND tentativa_em >= datetime('now', '-15 minutes')"
        ).get(emailLower);
        if (recentRegs.c >= MAX_LOGIN_ATTEMPTS) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
        }
        db.prepare('INSERT INTO login_attempts (email) VALUES (?)').run(emailLower);

        const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailLower);
        if (existente) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }
        const salt = gerarSalt();
        const hash = hashSenha(senha, salt);
        db.prepare('INSERT INTO usuarios (email, nome, hash, salt, nivel) VALUES (?, ?, ?, ?, ?)').run(emailLower, nome.trim(), hash, salt, 'usuario');
        return res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
    } catch (err) {
        console.error('Erro no registro:', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/api/logout', authMiddleware, (req, res) => {
    try {
        const token = req.headers['authorization'];
        db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
        return res.json({ message: 'Sessão encerrada' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.get('/api/planilhas', authMiddleware, (req, res) => {
    const dataPath = path.join(__dirname, 'data');
    fs.readdir(dataPath, (err, files) => {
        if (err) return res.status(500).json({ error: 'Erro ao ler pasta' });
        const planilhas = files.filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
        res.json(planilhas);
    });
});

// Map: tipo_base -> { varCode: description }
// O dicionário do IBGE é universal - serve para qualquer município/estado
let DICIONARIO = null;

// Extrai o tipo base do nome do arquivo, removendo sufixo _BR opcional seguido de _YYYYMMDD
function extrairTipoBase(nomeArquivo) {
    return nomeArquivo
        .replace(/_(?:BR(?:_\d{8})?|MANAUS|[A-Z]{2})\.(?:xlsx|csv)$/i, '')
        .replace(/\.(xlsx|csv)$/i, '');
}

// Normaliza codigo do dicionario: V0001 -> V00001 (4-digit para 5-digit)
function normalizarCodeDict(code) {
    const m = code.match(/^V(\d{4})$/);
    return m ? 'V0' + m[1] : code;
}

function carregarDicionario() {
    if (DICIONARIO) return DICIONARIO;
    try {
        const dictPath = path.join(__dirname, 'data', 'dicionario_de_dados_agregados_por_setores_censitarios_20260520.xlsx');
        if (!fs.existsSync(dictPath)) return null;
        const XLSX = require('xlsx');
        const wb = XLSX.readFile(dictPath);
        const map = {};

        // --- Dicionário Básico ---
        if (wb.Sheets['Dicionário Básico']) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Dicionário Básico']);
            const basico = {};
            for (const row of rows) {
                const rawCode = String(row['Variável'] || '').trim().toUpperCase();
                const code = normalizarCodeDict(rawCode);
                const desc = String(row['Descrição'] || '').trim();
                if (code && desc) basico[code] = desc;
            }
            map['Agregados_por_municipios_basico'] = basico;
            map['Agregados_por_bairros_basico'] = basico;
            map['Agregados_por_distritos_basico'] = basico;
        }

        // --- Dicionário não PCT (organizado por Tema) ---
        if (wb.Sheets['Dicionário não PCT']) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Dicionário não PCT']);
            const temaMap = {};
            for (const row of rows) {
                const tema = String(row['Tema'] || '').trim();
                if (!tema) continue;
                if (!temaMap[tema]) temaMap[tema] = {};
                const rawCode = String(row['Variável'] || '').trim().toUpperCase();
                const code = normalizarCodeDict(rawCode);
                const desc = String(row['Descrição'] || '').trim();
                if (code && desc) temaMap[tema][code] = desc;
            }
            // Mapeamento tipo_base -> Tema (genérico, sem município)
            const tipoTemaMap = {
                'Agregados_por_municipios_caracteristicas_domicilio1': 'Características do Domicílio - Parte 1',
                'Agregados_por_municipios_caracteristicas_domicilio2': 'Características do Domicílio - Parte 2',
                'Agregados_por_municipios_caracteristicas_domicilio3': 'Características do Domicílio - Parte 3',
                'Agregados_por_municipios_alfabetizacao': 'Alfabetização',
                'Agregados_por_municipios_parentesco': 'Parentesco',
                'Agregados_por_municipios_obitos': 'Óbitos',
                'Agregados_por_municipios_cor_ou_raca': 'Cor ou Raça',
                'Agregados_por_municipios_demografia': 'Demografia'
            };
            for (const [tipoBase, tema] of Object.entries(tipoTemaMap)) {
                map[tipoBase] = temaMap[tema] || {};
            }
        }

        // --- Dicionário PCT - Indígenas ---
        if (wb.Sheets['Dicionário PCT - Indígenas']) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Dicionário PCT - Indígenas']);
            for (const tipo of ['domicilios_indigenas', 'pessoas_indigenas']) {
                const filtradas = {};
                const tipoLabel = tipo.includes('domicilios') ? 'Domicílio' : 'Pessoas';
                for (const row of rows) {
                    if (String(row['Tipo'] || '').trim() !== tipoLabel) continue;
                    const rawCode = String(row['Variável'] || '').trim().toUpperCase();
                    const code = normalizarCodeDict(rawCode);
                    const desc = String(row['Descrição'] || '').trim();
                    if (code && desc) filtradas[code] = desc;
                }
                map['Agregados_por_municipios_' + tipo] = filtradas;
            }
        }

        // --- Dicionário PCT - Quilombolas ---
        if (wb.Sheets['Dicionário PCT - Quilombolas']) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets['Dicionário PCT - Quilombolas']);
            for (const tipo of ['domicilios_quilombolas', 'pessoas_quilombolas']) {
                const filtradas = {};
                const tipoLabel = tipo.includes('domicilios') ? 'Domicílio' : 'Pessoas';
                for (const row of rows) {
                    if (String(row['Tipo'] || '').trim() !== tipoLabel) continue;
                    const rawCode = String(row['Variável'] || '').trim().toUpperCase();
                    const code = normalizarCodeDict(rawCode);
                    const desc = String(row['Descrição'] || '').trim();
                    if (code && desc) filtradas[code] = desc;
                }
                map['Agregados_por_municipios_' + tipo] = filtradas;
            }
        }

        DICIONARIO = map;
        return map;
    } catch (err) {
        console.error('Erro ao carregar dicionário:', err.message);
        return null;
    }
}

app.get('/api/descricoes/:arquivo', authMiddleware, (req, res) => {
    try {
        const arquivo = path.basename(req.params.arquivo);
        const tipoBase = extrairTipoBase(arquivo);
        const dict = carregarDicionario();
        if (!dict) return res.status(500).json({ error: 'Dicionário não encontrado' });
        const descs = dict[tipoBase];
        if (!descs) return res.status(404).json({ error: 'Tipo de arquivo não encontrado no dicionário: ' + tipoBase });
        res.json(descs);
    } catch (err) {
        console.error('Erro ao buscar descrições:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

function normalizarSetor(cd) {
    if (!cd) return null;
    const s = String(cd);
    return s.replace(/\.0$/, '');
}

// ----- Geographic hierarchy API -----
app.get('/api/geografia/regioes', authMiddleware, (req, res) => {
    try {
        const rows = db.prepare("SELECT DISTINCT nm_regiao FROM setores WHERE nm_regiao IS NOT NULL ORDER BY nm_regiao").all();
        res.json(rows.map(r => r.nm_regiao));
    } catch (err) {
        console.error('Erro ao listar regiões:', err);
        res.status(500).json({ error: 'Erro ao listar regiões' });
    }
});

app.get('/api/geografia/estados', authMiddleware, (req, res) => {
    try {
        const { regiao } = req.query;
        let sql = "SELECT DISTINCT nm_uf, cd_uf FROM setores WHERE nm_uf IS NOT NULL";
        const params = [];
        if (regiao) { sql += " AND nm_regiao = ?"; params.push(regiao); }
        sql += " ORDER BY nm_uf";
        const rows = db.prepare(sql).all(...params);
        res.json(rows.map(r => ({ nm_uf: r.nm_uf, cd_uf: normalizarSetor(r.cd_uf) })));
    } catch (err) {
        console.error('Erro ao listar estados:', err);
        res.status(500).json({ error: 'Erro ao listar estados' });
    }
});

app.get('/api/geografia/municipios', authMiddleware, (req, res) => {
    try {
        const { uf } = req.query;
        let sql = "SELECT DISTINCT nm_mun, cd_mun FROM setores WHERE nm_mun IS NOT NULL";
        const params = [];
        if (uf) { sql += " AND nm_uf = ?"; params.push(uf); }
        sql += " ORDER BY nm_mun";
        const rows = db.prepare(sql).all(...params);
        res.json(rows.map(r => ({ nm_mun: r.nm_mun, cd_mun: normalizarSetor(r.cd_mun) })));
    } catch (err) {
        console.error('Erro ao listar municípios:', err);
        res.status(500).json({ error: 'Erro ao listar municípios' });
    }
});

app.get('/api/geografia/detalhes', authMiddleware, (req, res) => {
    try {
        const { municipio } = req.query;
        if (!municipio) return res.status(400).json({ error: 'Município é obrigatório' });

        const distritos = db.prepare(
            "SELECT DISTINCT nm_dist, cd_dist FROM setores WHERE nm_mun = ? AND nm_dist IS NOT NULL AND nm_dist != '' ORDER BY cd_dist"
        ).all(municipio);

        const subdistritos = db.prepare(
            "SELECT DISTINCT nm_subdist, cd_subdist FROM setores WHERE nm_mun = ? AND nm_subdist IS NOT NULL AND nm_subdist != '' ORDER BY cd_subdist"
        ).all(municipio);

        const comunidades = db.prepare(
            "SELECT DISTINCT nm_fcu FROM setores WHERE nm_mun = ? AND nm_fcu IS NOT NULL AND nm_fcu != '' ORDER BY nm_fcu"
        ).all(municipio);

        const bairros = db.prepare(
            "SELECT TRIM(nm_bairro) as nm_bairro, MIN(cd_bairro) as cd_bairro FROM setores WHERE nm_mun = ? AND nm_bairro IS NOT NULL AND nm_bairro != '' GROUP BY TRIM(nm_bairro) ORDER BY TRIM(nm_bairro)"
        ).all(municipio);

        const nucleosUrbanos = db.prepare(
            "SELECT DISTINCT nm_nu, cd_nu FROM setores WHERE nm_mun = ? AND nm_nu IS NOT NULL AND nm_nu != '' ORDER BY nm_nu"
        ).all(municipio);

        const aglomerados = db.prepare(
            "SELECT DISTINCT nm_aglom FROM setores WHERE nm_mun = ? AND nm_aglom IS NOT NULL AND nm_aglom != '' ORDER BY nm_aglom"
        ).all(municipio);

        const situacoes = db.prepare(
            "SELECT DISTINCT situacao FROM setores WHERE nm_mun = ? AND situacao IS NOT NULL AND situacao != '' ORDER BY situacao"
        ).all(municipio);

        const setorSemBairro = db.prepare(
            "SELECT COUNT(*) as c FROM setores WHERE nm_mun = ? AND cd_sit IN ('1.0','2.0','3.0') AND (nm_bairro IS NULL OR nm_bairro = '') AND (nm_fcu IS NULL OR nm_fcu = '') AND (nm_nu IS NULL OR nm_nu = '') AND (nm_aglom IS NULL OR nm_aglom = '')"
        ).get(municipio);

        res.json({
            distritos: distritos.map(r => ({ nm_dist: r.nm_dist, cd_dist: normalizarSetor(r.cd_dist) })),
            subdistritos: subdistritos.map(r => ({ nm_subdist: r.nm_subdist, cd_subdist: r.cd_subdist ? normalizarSetor(r.cd_subdist) : null })),
            comunidades: comunidades.map(r => r.nm_fcu),
            bairros: bairros.map(r => ({ nm_bairro: r.nm_bairro, cd_bairro: normalizarSetor(r.cd_bairro) })),
            nucleosUrbanos: nucleosUrbanos.map(r => ({ nm_nu: r.nm_nu, cd_nu: normalizarSetor(r.cd_nu) })),
            aglomerados: aglomerados.map(r => r.nm_aglom),
            situacoes: situacoes.map(r => r.situacao),
            tem_setor_urbano_sem_bairro: setorSemBairro.c > 0
        });
    } catch (err) {
        console.error('Erro ao buscar detalhes:', err);
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

app.get('/api/geografia/setores', authMiddleware, (req, res) => {
    try {
        const { municipio, distrito, subdistrito, comunidade, bairro } = req.query;
        let sql = "SELECT cd_setor FROM setores WHERE 1=1";
        const params = [];
        if (municipio) { sql += " AND nm_mun = ?"; params.push(municipio); }
        if (distrito) { sql += " AND nm_dist = ?"; params.push(distrito); }
        if (subdistrito) { sql += " AND nm_subdist = ?"; params.push(subdistrito); }
        if (comunidade) { sql += " AND nm_fcu = ?"; params.push(comunidade); }
        if (bairro) { sql += " AND nm_bairro = ?"; params.push(bairro); }
        sql += " ORDER BY cd_setor";

        const rows = db.prepare(sql).all(...params);
        res.json(rows.map(r => normalizarSetor(r.cd_setor)));
    } catch (err) {
        console.error('Erro ao buscar setores:', err);
        res.status(500).json({ error: 'Erro ao buscar setores' });
    }
});

// ----- Data query API (reads CSV server-side, returns filtered rows) -----
const { consultarDados } = require('./data-query');

app.post('/api/dados/consultar', authMiddleware, async (req, res) => {
    try {
        const { variaveis, cd_mun: cdMunInput, uf, municipio, distrito, subdistrito, bairro, comunidade, nucleoUrbano, aglomerado, situacao, varFileMap, agregacao } = req.body;
        if (!variaveis || variaveis.length === 0) {
            return res.status(400).json({ error: 'Variáveis são obrigatórias' });
        }

        let geoKeys = cdMunInput || [];
        let geoInfo = {};

        if (agregacao === 'bairro') {
            // Resolve CD_BAIRRO + CD_MUN from geography filters via SQLite
            if (geoKeys.length === 0 && (uf || municipio || distrito || bairro)) {
                let sql = "SELECT DISTINCT cd_bairro, nm_bairro, cd_mun, nm_mun, nm_uf, nm_regiao FROM setores WHERE cd_bairro IS NOT NULL AND cd_bairro != ''";
                const params = [];
                if (uf) { sql += " AND nm_uf = ?"; params.push(uf); }
                if (municipio) { sql += " AND nm_mun = ?"; params.push(municipio); }
                if (distrito) { sql += " AND nm_dist = ?"; params.push(distrito); }
                if (subdistrito) { sql += " AND nm_subdist = ?"; params.push(subdistrito); }
                if (bairro) { sql += " AND nm_bairro = ?"; params.push(bairro); }
                if (comunidade) { sql += " AND nm_fcu = ?"; params.push(comunidade); }
                if (nucleoUrbano) { sql += " AND nm_nu = ?"; params.push(nucleoUrbano); }
                if (aglomerado) { sql += " AND nm_aglom = ?"; params.push(aglomerado); }
                if (situacao) { sql += " AND situacao = ?"; params.push(situacao); }
                sql += " ORDER BY cd_bairro";
                const rows = db.prepare(sql).all(...params);
                const cdBairroSet = new Set();
                const cdMunSet = new Set();
                for (const r of rows) {
                    const cdB = normalizarSetor(r.cd_bairro);
                    const cdM = normalizarSetor(r.cd_mun);
                    cdBairroSet.add(cdB);
                    cdMunSet.add(cdM);
                    geoInfo[cdB] = {
                        NM_REGIAO: r.nm_regiao,
                        NM_UF: r.nm_uf,
                        NM_MUN: r.nm_mun,
                        NM_BAIRRO: r.nm_bairro,
                        CD_MUN: cdM
                    };
                }
                // Include both bairro and municipality codes so both file types match
                geoKeys = [...cdBairroSet, ...cdMunSet];
            }
        } else {
            // Resolve CD_MUN from geography filter via SQLite
            if (geoKeys.length === 0 && (uf || municipio || distrito || bairro)) {
                let sql = "SELECT DISTINCT cd_mun, nm_regiao, nm_uf, nm_mun FROM setores WHERE 1=1";
                const params = [];
                if (uf) { sql += " AND nm_uf = ?"; params.push(uf); }
                if (municipio) { sql += " AND nm_mun = ?"; params.push(municipio); }
                if (distrito) { sql += " AND nm_dist = ?"; params.push(distrito); }
                if (subdistrito) { sql += " AND nm_subdist = ?"; params.push(subdistrito); }
                if (bairro) { sql += " AND nm_bairro = ?"; params.push(bairro); }
                if (comunidade) { sql += " AND nm_fcu = ?"; params.push(comunidade); }
                if (nucleoUrbano) { sql += " AND nm_nu = ?"; params.push(nucleoUrbano); }
                if (aglomerado) { sql += " AND nm_aglom = ?"; params.push(aglomerado); }
                if (situacao) { sql += " AND situacao = ?"; params.push(situacao); }
                sql += " ORDER BY cd_mun";
                const rows = db.prepare(sql).all(...params);
                geoKeys = rows.map(r => normalizarSetor(r.cd_mun));
                for (const r of rows) {
                    geoInfo[normalizarSetor(r.cd_mun)] = {
                        NM_REGIAO: r.nm_regiao,
                        NM_UF: r.nm_uf,
                        NM_MUN: r.nm_mun
                    };
                }
            }
        }
        if (geoKeys.length === 0) {
            const msg = (uf || municipio) ? 'Nenhum município/bairro encontrado com os filtros geográficos selecionados' : 'Selecione um estado/município';
            return res.status(400).json({ error: msg });
        }

        // Query CSV data (pass optional varFileMap to disambiguate overlapping vars)
        const dadosCSV = await consultarDados(variaveis, geoKeys, varFileMap);

        // Merge with geo info from setores table
        const resultado = [];
        for (const row of dadosCSV) {
            if (agregacao === 'bairro') {
                const cdBairro = row.CD_BAIRRO;
                if (cdBairro && geoInfo[cdBairro]) {
                    const g = geoInfo[cdBairro];
                    resultado.push({
                        CD_BAIRRO: cdBairro,
                        NM_REGIAO: g.NM_REGIAO || null,
                        NM_UF: g.NM_UF || null,
                        NM_MUN: g.NM_MUN || null,
                        NM_BAIRRO: g.NM_BAIRRO || null,
                        ...row
                    });
                } else {
                    // Municipality-level row (e.g. PCT data) - expand per bairro
                    const cdMun = row.CD_MUN;
                    for (const [bk, g] of Object.entries(geoInfo)) {
                        if (g.CD_MUN === cdMun) {
                            resultado.push({
                                CD_BAIRRO: bk,
                                NM_REGIAO: g.NM_REGIAO || null,
                                NM_UF: g.NM_UF || null,
                                NM_MUN: g.NM_MUN || null,
                                NM_BAIRRO: g.NM_BAIRRO || null,
                                ...row
                            });
                        }
                    }
                }
            } else {
                const cdMun = row.CD_MUN || row.CD_BAIRRO || row.CD_DIST;
                const g = geoInfo[cdMun] || {};
                resultado.push({
                    CD_MUN: cdMun,
                    NM_REGIAO: g.NM_REGIAO || null,
                    NM_UF: g.NM_UF || null,
                    NM_MUN: g.NM_MUN || null,
                    ...row
                });
            }
        }

        res.json(resultado);
    } catch (err) {
        console.error('Erro ao consultar dados:', err);
        res.status(500).json({ error: 'Erro ao consultar dados: ' + err.message });
    }
});

app.get('/api/dados/:arquivo', authMiddleware, (req, res) => {
    try {
        const arquivo = path.basename(req.params.arquivo);
        if (!arquivo.endsWith('.xlsx') && !arquivo.endsWith('.csv')) {
            return res.status(400).json({ error: 'Formato não suportado: ' + arquivo });
        }
        const filePath = path.join(__dirname, 'data', arquivo);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Arquivo não encontrado: ' + arquivo });
        }
        res.sendFile(filePath);
    } catch (err) {
        console.error('Erro ao servir dados:', err);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.get('/lib/xlsx.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'));
});

app.get('/db-config.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'db-config.js'));
});

app.get('/icone.webp', (req, res) => {
    res.setHeader('Content-Type', 'image/webp');
    res.sendFile(path.join(__dirname, 'icone.webp'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'geodata-censo.html'));
});

app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada: ' + req.method + ' ' + req.originalUrl });
});

app.use((err, req, res, next) => {
    console.error('ERRO no servidor:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

const server = app.listen(PORT, () => {
    console.log('Agregados por Setores Censitários 2022 rodando em http://localhost:' + PORT);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(' ERRO: A porta ' + PORT + ' já está em uso.');
        console.error(' Execute: npx kill-port ' + PORT);
        console.error(' Ou use outra porta: set PORT=3004 && node server.js');
    } else {
        console.error(' ERRO ao iniciar servidor:', err.message);
    }
    process.exit(1);
});

function gracefulShutdown(signal) {
    console.log(`\n ${signal} recebido. Encerrando servidor...`);
    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error(' ERRO não tratado:', err.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error(' Promise rejeitada sem tratamento:', reason);
    process.exit(1);
});
