const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const dbPath = path.join(__dirname, 'data', 'geodata.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -256000');
db.pragma('temp_store = MEMORY');

db.exec(`DROP TABLE IF EXISTS setores`);

const GEO_COLS = new Set([
    'CD_SETOR', 'SITUACAO', 'CD_SIT', 'CD_TIPO', 'AREA_KM2',
    'CD_REGIAO', 'NM_REGIAO', 'CD_UF', 'NM_UF', 'CD_MUN', 'NM_MUN',
    'CD_DIST', 'NM_DIST', 'CD_SUBDIST', 'NM_SUBDIST', 'CD_BAIRRO', 'NM_BAIRRO',
    'CD_NU', 'NM_NU', 'CD_FCU', 'NM_FCU', 'CD_AGLOM', 'NM_AGLOM',
    'CD_RGINT', 'NM_RGINT', 'CD_RGI', 'NM_RGI', 'CD_CONCURB', 'NM_CONCURB'
]);

function normalizarSetor(cd) {
  if (!cd) return null;
  return String(cd).replace(/\.0$/, '');
}

const dataDir = path.join(__dirname, 'data');

const geoColsArr = [...GEO_COLS].filter(c => c !== 'CD_SETOR');
const geoMap = new Map();

const insertSetor = db.prepare(
    `INSERT OR REPLACE INTO setores (cd_setor, ${geoColsArr.join(', ')}) VALUES (@CD_SETOR, ${geoColsArr.map(c => '@' + c).join(', ')})`
);

function log(msg, t0) {
    const elapsed = t0 ? ` [${Date.now() - t0}ms]` : '';
    console.log(msg + elapsed);
}

async function* csvLines(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 65536 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let first = true;
    for await (const rawLine of rl) {
        if (!rawLine.trim()) continue;
        const line = first && rawLine.charCodeAt(0) === 0xFEFF ? rawLine.slice(1) : rawLine;
        first = false;
        yield line;
    }
}

async function extrairGeo(arquivo) {
    const filePath = path.join(dataDir, arquivo);
    const t0 = Date.now();
    const stat = fs.statSync(filePath);
    const sizeMB = Math.round(stat.size / (1024 * 1024));
    log(`  ${arquivo} (${sizeMB}MB)`);

    let sep = ';';
    let headers = [];
    for await (const line of csvLines(filePath)) {
        sep = line.includes(';') ? ';' : ',';
        headers = line.split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
        break;
    }
    if (headers.length === 0) { log(`  cabeçalho não encontrado`); return; }

    const upperHeaders = headers.map(h => h.toUpperCase());
    const fileGeoCols = geoColsArr.filter(c => upperHeaders.includes(c));
    const geoColIdxs = fileGeoCols.map(c => upperHeaders.indexOf(c));

    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h.toUpperCase()] = i; });

    // Try CD_MUN first, then CD_SETOR, then SETOR
    const setorColKeys = ['CD_MUN', 'CD_SETOR', 'SETOR'];
    let setorCol = null;
    for (const key of setorColKeys) {
        if (colIdx[key] !== undefined) { setorCol = key; break; }
    }
    if (!setorCol) { log(`  coluna geográfica não encontrada (CD_MUN, CD_SETOR ou SETOR)`); return; }
    const setorColIdx = colIdx[setorCol];

    let rowCount = 0;
    let lineCount = 0;

    for await (const line of csvLines(filePath)) {
        lineCount++;
        if (lineCount === 1) continue;

        const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
        const cd = normalizarSetor(vals[setorColIdx]);
        if (!cd) continue;

        if (!geoMap.has(cd)) {
            const complete = { CD_SETOR: cd };
            geoColIdxs.forEach((idx, gi) => {
                const colName = fileGeoCols[gi];
                const raw = vals[idx] ?? null;
                complete[colName] = colName.startsWith('CD_') && raw ? normalizarSetor(raw) : raw;
            });
            geoMap.set(cd, complete);
            rowCount++;
        }
    }

    log(`  ${rowCount.toLocaleString()} registros extraídos`, t0);
}

async function main() {
    log('\n=== Migração GeoData Censo 2022 ===');

    // Criar tabela setores
    db.exec(`
        CREATE TABLE setores (
            cd_setor TEXT PRIMARY KEY,
            situacao TEXT, cd_sit TEXT, cd_tipo TEXT, area_km2 REAL,
            cd_regiao TEXT, nm_regiao TEXT, cd_uf TEXT, nm_uf TEXT,
            cd_mun TEXT, nm_mun TEXT, cd_dist TEXT, nm_dist TEXT,
            cd_subdist TEXT, nm_subdist TEXT, cd_bairro TEXT, nm_bairro TEXT,
            cd_nu TEXT, nm_nu TEXT, cd_fcu TEXT, nm_fcu TEXT,
            cd_aglom TEXT, nm_aglom TEXT, cd_rgint TEXT, nm_rgint TEXT,
            cd_rgi TEXT, nm_rgi TEXT, cd_concurb TEXT, nm_concurb TEXT
        )
    `);

    const arquivos = fs.readdirSync(dataDir).filter(f =>
        f.endsWith('.csv') && f.toLowerCase().includes('basico') && !f.toLowerCase().includes('dicionario')
    );

    if (arquivos.length === 0) {
        log('Nenhum arquivo CSV básico encontrado');
        db.close();
        return;
    }

    const arquivo = arquivos[0];
    log(`\n--- Processando ${arquivo}`);
    await extrairGeo(arquivo);

    log(`\nInserindo ${geoMap.size} registros...`);
    const tInsert = Date.now();
    const insertSetoresAll = db.transaction((geoRows) => {
        for (const row of geoRows) insertSetor.run(row);
    });
    insertSetoresAll(Array.from(geoMap.values()));
    log(`Inserção concluída`, tInsert);

    log('\nCriando índices...');
    const tIdx = Date.now();
    db.exec(`CREATE INDEX idx_setores_nm_mun ON setores(nm_mun)`);
    db.exec(`CREATE INDEX idx_setores_nm_bairro ON setores(nm_bairro)`);
    db.exec(`CREATE INDEX idx_setores_nm_regiao ON setores(nm_regiao)`);
    db.exec(`CREATE INDEX idx_setores_nm_uf ON setores(nm_uf)`);
    db.exec(`CREATE INDEX idx_setores_cd_mun ON setores(cd_mun)`);
    db.exec(`CREATE INDEX idx_setores_nm_dist ON setores(nm_dist)`);
    db.exec(`CREATE INDEX idx_setores_nm_subdist ON setores(nm_subdist)`);
    db.exec(`CREATE INDEX idx_setores_nm_fcu ON setores(nm_fcu)`);
    db.exec(`CREATE INDEX idx_setores_situacao ON setores(situacao)`);
    log(`Índices criados`, tIdx);

    const total = db.prepare('SELECT COUNT(*) as c FROM setores').get();
    const municipios = db.prepare('SELECT COUNT(DISTINCT nm_mun) as c FROM setores').get();

    log('\n=== Resumo ===');
    log(`Registros: ${total.c.toLocaleString()}`);
    log(`Municípios: ${municipios.c.toLocaleString()}`);

    const muns = db.prepare('SELECT DISTINCT nm_mun FROM setores WHERE nm_mun IS NOT NULL ORDER BY nm_mun').all();
    muns.forEach(m => log(`  - ${m.nm_mun}`));

    db.close();
    log('\nMigração concluída!');
}

main().catch(err => {
    console.error('\nErro:', err.message);
    process.exit(1);
});
