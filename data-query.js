const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, 'data');

// ---- CATALOGO (server-side copy) ----
const CATALOGO = [
  {
    tema: 'BÁSICO',
    subtemas: [
      {
        nome: 'Básico (Municípios)',
        arquivo: 'Agregados_por_municipios_basico_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009']
      },
      {
        nome: 'Básico (Bairros)',
        arquivo: 'Agregados_por_bairros_basico_BR.csv',
        colunaGeo: 'CD_BAIRRO',
        vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009']
      },
      {
        nome: 'Básico (Distritos)',
        arquivo: 'Agregados_por_distritos_basico_BR.csv',
        colunaGeo: 'CD_DIST',
        vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009']
      }
    ]
  },
  {
    tema: 'NÃO PCT',
    subtemas: [
      { nome: 'Características do Domicílio - Parte 1',
        arquivo: 'Agregados_por_municipios_caracteristicas_domicilio1_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 89}, (_, i) => 'V' + String(i + 1).padStart(5, '0')) },
      { nome: 'Características do Domicílio - Parte 2',
        arquivo: 'Agregados_por_municipios_caracteristicas_domicilio2_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 406}, (_, i) => 'V' + String(i + 90).padStart(5, '0')) },
      { nome: 'Características do Domicílio - Parte 3',
        arquivo: 'Agregados_por_municipios_caracteristicas_domicilio3_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 148}, (_, i) => 'V' + String(i + 496).padStart(5, '0')) },
      { nome: 'Alfabetização',
        arquivo: 'Agregados_por_municipios_alfabetizacao_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 362}, (_, i) => 'V' + String(i + 644).padStart(5, '0')) },
      { nome: 'Demografia',
        arquivo: 'Agregados_por_municipios_demografia_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 36}, (_, i) => 'V' + String(i + 1006).padStart(5, '0')) },
      { nome: 'Parentesco',
        arquivo: 'Agregados_por_municipios_parentesco_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 182}, (_, i) => 'V' + String(i + 1042).padStart(5, '0')) },
      { nome: 'Óbitos',
        arquivo: 'Agregados_por_municipios_obitos_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 93}, (_, i) => 'V' + String(i + 1224).padStart(5, '0')) },
      { nome: 'Cor ou Raça',
        arquivo: 'Agregados_por_municipios_cor_ou_raca_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 95}, (_, i) => 'V' + String(i + 1317).padStart(5, '0')) }
    ]
  },
  {
    tema: 'PCT INDÍGENAS',
    subtemas: [
      { nome: 'Domicílios Indígenas',
        arquivo: 'Agregados_por_municipios_domicilios_indigenas_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 190}, (_, i) => 'V' + String(i + 1500).padStart(5, '0')) },
      { nome: 'Pessoas Indígenas',
        arquivo: 'Agregados_por_municipios_pessoas_indigenas_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 839}, (_, i) => 'V' + String(i + 1690).padStart(5, '0')) }
    ]
  },
  {
    tema: 'PCT QUILOMBOLAS',
    subtemas: [
      { nome: 'Domicílios Quilombolas',
        arquivo: 'Agregados_por_municipios_domicilios_quilombolas_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 196}, (_, i) => 'V' + String(i + 3000).padStart(5, '0')) },
      { nome: 'Pessoas Quilombolas',
        arquivo: 'Agregados_por_municipios_pessoas_quilombolas_BR.csv',
        colunaGeo: 'CD_MUN',
        vars: Array.from({length: 755}, (_, i) => 'V' + String(i + 3196).padStart(5, '0')) }
    ]
  }
];

// Build var-to-file map
function buildVarMap() {
  const map = {};
  for (const tema of CATALOGO) {
    for (const sub of tema.subtemas) {
      const isBasico = sub.arquivo.toLowerCase().includes('basico');
      for (const v of sub.vars) {
        const key = v.toUpperCase();
        if (!map[key]) map[key] = [];
        map[key].push({
          arquivo: sub.arquivo,
          nome: sub.nome,
          tema: tema.tema,
          isBasico
        });
      }
    }
  }
  return map;
}

const VAR_MAP = buildVarMap();

// Normalize catalog var code to actual CSV column name
function varToColuna(varCode, isBasico) {
  const upper = varCode.toUpperCase();
  if (isBasico) {
    const num = upper.replace(/^V0*/, '');
    return 'v' + num.padStart(4, '0');
  }
  return upper;
}

// Try to find column index: exact, case-insensitive, then flexible V-code (V00001 vs v0001)
function findColIndex(headers, colName) {
  const exact = headers.indexOf(colName);
  if (exact !== -1) return exact;
  const upper = colName.toUpperCase();
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toUpperCase() === upper) return i;
  }
  const numMatch = upper.match(/^V0*(\d{4,5})$/);
  if (numMatch) {
    const targetNum = numMatch[1];
    for (let i = 0; i < headers.length; i++) {
      const m = headers[i].match(/^V0*(\d{4,5})$/);
      if (m && m[1] === targetNum) return i;
    }
  }
  return -1;
}

// Convert Brazilian decimal format (comma) to standard dot format
function normalizarValor(v) {
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  if (trimmed === '') return trimmed;
  if (/^-?\d+,\d+$/.test(trimmed) || /^-?\d{1,3}(\.\d{3})*,\d+$/.test(trimmed)) {
    return trimmed.replace(/\./g, '').replace(',', '.');
  }
  return trimmed;
}

// Strip surrounding quotes and trim a CSV field
function cleanField(s) {
  if (!s) return '';
  s = s.trim();
  if (s.length >= 2 && s.charCodeAt(0) === 0x22 && s.charCodeAt(s.length - 1) === 0x22) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function normalizarGeoKey(cd) {
  if (!cd) return null;
  return String(cd).replace(/\.0$/, '');
}

// --- Índice de municípios (byte offset) para acesso direto ---
const GEO_INDEXES = {};
const INDEX_THRESHOLD = 5000;

function buildGeoIndex(arquivo, geoCol = 'CD_MUN') {
  if (GEO_INDEXES[arquivo]) return GEO_INDEXES[arquivo];
  const filePath = path.join(DATA_DIR, arquivo);
  if (!fs.existsSync(filePath)) return null;

  const index = new Map();
  const fd = fs.openSync(filePath, 'r');
  let fileOffset = 0;
  const buf = Buffer.alloc(65536);
  let leftover = '';
  let isFirstLine = true;
  let geoColIdx = -1;

  while (true) {
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, fileOffset);
    if (bytesRead === 0) break;
    const chunk = leftover + buf.toString('utf-8', 0, bytesRead);
    const lines = chunk.split('\n');
    leftover = lines.pop() || '';
    let chunkOffset = 0;

    for (const line of lines) {
      const lineLen = Buffer.byteLength(line, 'utf-8');
      if (isFirstLine) {
        const cleanLine = line.charCodeAt(0) === 0xFEFF ? line.slice(1) : line;
        const hdrs = cleanLine.split(';').map(h => cleanField(h).toUpperCase());
        geoColIdx = hdrs.indexOf(geoCol.toUpperCase());
        isFirstLine = false;
        chunkOffset += lineLen + 1;
        continue;
      }
      if (geoColIdx !== -1) {
        const parts = line.split(';');
        const geoKey = normalizarGeoKey(cleanField(parts[geoColIdx]));
        if (geoKey && !index.has(geoKey)) {
          index.set(geoKey, fileOffset + chunkOffset);
        }
      }
      chunkOffset += lineLen + 1;
    }
    fileOffset += chunkOffset;
  }

  if (leftover && !isFirstLine && geoColIdx !== -1) {
    const parts = leftover.split(';');
    const geoKey = normalizarGeoKey(cleanField(parts[geoColIdx]));
    if (geoKey && !index.has(geoKey)) {
      index.set(geoKey, fileOffset);
    }
  }

  fs.closeSync(fd);
  GEO_INDEXES[arquivo] = index;
  return index;
}

// Fast path using byte-offset index (for targeted queries)
function queryCSVIndexed(arquivo, geoSet, colunas, index, geoCol = 'CD_MUN') {
  const filePath = path.join(DATA_DIR, arquivo);
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(65536);
  const resultados = [];

  // Parse header for column mapping
  const headerBuf = Buffer.alloc(65536);
  const headerBytes = fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
  let headerLine = headerBuf.toString('utf-8', 0, headerBytes).split('\n')[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) headerLine = headerLine.slice(1);
  const header = headerLine.split(';').map(h => cleanField(h).toUpperCase());
  const geoColIdx = header.indexOf(geoCol.toUpperCase());
  if (geoColIdx === -1) { fs.closeSync(fd); return []; }

  const colIdxs = colunas.map(c => ({
    codigo: c.codigo,
    idx: findColIndex(header, c.coluna.toUpperCase())
  }));

  // Collect and sort matching offsets
  const offsets = [];
  for (const geoKey of geoSet) {
    const off = index.get(geoKey);
    if (off !== undefined) offsets.push(off);
  }
  offsets.sort((a, b) => a - b);

  for (const offset of offsets) {
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, offset);
    if (bytesRead === 0) continue;
    const chunk = buf.toString('utf-8', 0, bytesRead);
    const lineEnd = chunk.indexOf('\n');
    const line = lineEnd === -1 ? chunk : chunk.slice(0, lineEnd);
    const parts = line.split(';');
    const geoKey = normalizarGeoKey(cleanField(parts[geoColIdx]));
    if (!geoKey || !geoSet.has(geoKey)) continue;

    const row = { [geoCol]: geoKey };
    for (const ci of colIdxs) {
      if (ci.idx !== -1 && ci.idx < parts.length) {
        const raw = cleanField(parts[ci.idx]);
        if (raw) { const v = normalizarValor(raw); if (v !== '') row[ci.codigo] = v; }
      }
    }
    resultados.push(row);
  }

  fs.closeSync(fd);
  return resultados;
}

// Read CSV, filter by geo key set, return matching rows
function queryCSV(arquivo, geoSet, colunas, geoCol = 'CD_MUN') {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, arquivo);
    if (!fs.existsSync(filePath)) return resolve([]);

    const stat = fs.statSync(filePath);

    // Use pre-built index if available
    let index = GEO_INDEXES[arquivo];
    if (index && geoSet.size < INDEX_THRESHOLD && geoSet.size < index.size * 0.1) {
      try {
        return resolve(queryCSVIndexed(arquivo, geoSet, colunas, index, geoCol));
      } catch (err) {
        console.warn('Indexed query failed for', arquivo, err.message);
      }
    }

    // Fast path: readFileSync for files < 200 MB
    if (stat.size < 200 * 1024 * 1024) {
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const lines = content.split('\n');
        content = null;

        const header = lines[0].split(';').map(h => cleanField(h).toUpperCase());
        const geoColIdx = header.indexOf(geoCol.toUpperCase());
        if (geoColIdx === -1) return resolve([]);

        const colIdxs = colunas.map(c => ({
          codigo: c.codigo,
          idx: findColIndex(header, c.coluna.toUpperCase())
        }));

        const resultados = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const parts = line.split(';');
          const geoKey = normalizarGeoKey(cleanField(parts[geoColIdx]));
          if (!geoKey || !geoSet.has(geoKey)) continue;

          const row = { [geoCol]: geoKey };
          for (const ci of colIdxs) {
            if (ci.idx !== -1 && ci.idx < parts.length) {
              const raw = cleanField(parts[ci.idx]);
              if (raw) { const v = normalizarValor(raw); if (v !== '') row[ci.codigo] = v; }
            }
          }
          resultados.push(row);
        }
        return resolve(resultados);
      } catch (err) {
        console.warn('In-memory failed for', arquivo, err.message);
      }
    }

    // Stream path for large files via readline
    const resultados = [];
    let headerParsed = false;
    let geoColIdx = -1;
    let colIdxs = [];
    let firstLine = true;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      if (!line) return;

      let cleanLine = line;
      if (firstLine) {
        if (cleanLine.charCodeAt(0) === 0xFEFF) cleanLine = cleanLine.slice(1);
        firstLine = false;
      }

      const parts = cleanLine.split(';');

      if (!headerParsed) {
        const hdrs = parts.map(h => cleanField(h).toUpperCase());
        geoColIdx = hdrs.indexOf(geoCol.toUpperCase());
        if (geoColIdx === -1) {
          headerParsed = true;
          rl.close();
          return resolve([]);
        }
        colIdxs = colunas.map(c => ({
          codigo: c.codigo,
          idx: findColIndex(hdrs, c.coluna.toUpperCase())
        }));
        headerParsed = true;
        return;
      }

      const geoKey = normalizarGeoKey(cleanField(parts[geoColIdx]));
      if (!geoKey || !geoSet.has(geoKey)) return;

      const row = { [geoCol]: geoKey };
      for (const ci of colIdxs) {
        if (ci.idx !== -1 && ci.idx < parts.length) {
          const raw = cleanField(parts[ci.idx]);
          if (raw) { const v = normalizarValor(raw); if (v !== '') row[ci.codigo] = v; }
        }
      }
      resultados.push(row);
    });

    rl.on('close', () => resolve(resultados));
    rl.on('error', (err) => reject(err));
  });
}

// EXTERNAL API
// variaveis: array of var codes (e.g. ['V00001', 'V00005'])
// geoKeysList: array of cd_mun (or cd_bairro, cd_dist) strings
// varFileMap: optional { varCode: fileName } to disambiguate which file to query
async function consultarDados(variaveis, geoKeysList, varFileMap) {
  if (!variaveis || variaveis.length === 0) return [];
  if (!geoKeysList || geoKeysList.length === 0) return [];

  const geoSet = new Set(geoKeysList);

  // Group variables by file
  const fileGroups = {};
  for (const v of variaveis) {
    const upper = v.toUpperCase();
    const entries = VAR_MAP[upper];
    if (!entries) {
      console.warn('Variavel nao encontrada no catalogo:', v);
      continue;
    }
    for (const entry of entries) {
      // If varFileMap is provided and specifies a file, skip others
      if (varFileMap && varFileMap[v] && entry.arquivo.toLowerCase() !== varFileMap[v].toLowerCase()) continue;
      // If no varFileMap and there are multiple files, prefer the first one (basico priority)
      if (!varFileMap && entries.length > 1) {
        if (entry !== entries[0]) continue;
      }
      if (!fileGroups[entry.arquivo]) {
        fileGroups[entry.arquivo] = {
          arquivo: entry.arquivo,
          nome: entry.nome,
          tema: entry.tema,
          isBasico: entry.isBasico,
          colunas: []
        };
      }
      fileGroups[entry.arquivo].colunas.push({
        codigo: upper,
        coluna: varToColuna(upper, entry.isBasico)
      });
    }
  }

  const fileKeys = Object.keys(fileGroups);
  if (fileKeys.length === 0) return [];

  // Determine geo column from first file entry
  const encontrarGeoCol = (arquivo) => {
    for (const tema of CATALOGO) {
      for (const sub of tema.subtemas) {
        if (sub.arquivo === arquivo) return sub.colunaGeo || 'CD_MUN';
      }
    }
    return 'CD_MUN';
  };

  // Query files in parallel
  const allResults = await Promise.all(fileKeys.map(async (key) => {
    const group = fileGroups[key];
    const geoCol = encontrarGeoCol(key);
    try {
      const rows = await queryCSV(group.arquivo, geoSet, group.colunas, geoCol);
      return { nome: group.nome, rows, geoCol };
    } catch (err) {
      console.error('Erro ao consultar', group.arquivo, err.message);
      return { nome: group.nome, rows: [], geoCol };
    }
  }));

  // Merge results by geo key (first-file-wins semantics)
  if (allResults.length === 0) return [];

  const merged = new Map();
  for (const fileResult of allResults) {
    const geoCol = fileResult.geoCol || 'CD_MUN';
    for (const row of fileResult.rows) {
      const geoKey = row[geoCol];
      if (!geoKey) continue;
      const existing = merged.get(geoKey);
      if (existing) {
        for (const [k, v] of Object.entries(row)) {
          if (k !== geoCol && !(k in existing)) {
            existing[k] = v;
          }
        }
      } else {
        merged.set(geoKey, { ...row });
      }
    }
  }

  return Array.from(merged.values());
}

module.exports = { consultarDados };
