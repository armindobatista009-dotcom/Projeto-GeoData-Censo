const Database = require('better-sqlite3');
const db = new Database('data/geodata.db');
// Find municipios in Acre that have named bairros
let r = db.prepare("SELECT nm_mun, COUNT(DISTINCT nm_bairro) as qtd FROM setores WHERE nm_uf = 'Acre' AND nm_bairro IS NOT NULL AND nm_bairro != '' GROUP BY nm_mun ORDER BY qtd DESC LIMIT 10").all();
console.log('Acre municipios with most named bairros:');
r.forEach(x => console.log(' ', x.nm_mun, '-', x.qtd, 'bairros'));

// Also check cd_bairro distinct values that are not null or empty
r = db.prepare("SELECT DISTINCT cd_bairro FROM setores WHERE nm_uf = 'Acre' AND cd_bairro IS NOT NULL AND cd_bairro != '' AND cd_bairro != '.' LIMIT 5").all();
console.log('\nSample valid cd_bairro in Acre:', r.map(x => x.cd_bairro));
db.close();
