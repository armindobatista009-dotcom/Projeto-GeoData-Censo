const PCT_VARS = new Set(['V00006']);

const CATALOGO = [
    {
        tema: 'BÁSICO',
        subtemas: [
            {
                nome: 'Básico (Municípios)',
                arquivo: 'Agregados_por_municipios_basico_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009'],
                descricoes: {
                    V00001: 'Total de pessoas',
                    V00002: 'Total de Domicílios (DPPO + DPPV + DPPUO + DPIO + DCCM + DCSM)',
                    V00003: 'Total de Domicílios Particulares (DPPO + DPPV + DPPUO + DPIO)',
                    V00004: 'Total de Domicílios Coletivos (DCCM + DCSM)',
                    V00005: 'Média de moradores em DPO',
                    V00006: '% de DPO Imputados',
                    V00007: 'Total de DPO (DPPO + DPIO)',
                    V00008: 'Total de Domicílios Particulares de Uso Ocasional (DPPUO)',
                    V00009: 'Total de Domicílios Particulares Permanentes Vagos (DPPV)'
                }
            },
            {
                nome: 'Básico (Bairros)',
                arquivo: 'Agregados_por_bairros_basico_BR.csv',
                colunaGeo: 'CD_BAIRRO',
                vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009'],
            },
            {
                nome: 'Básico (Distritos)',
                arquivo: 'Agregados_por_distritos_basico_BR.csv',
                colunaGeo: 'CD_DIST',
                vars: ['V00001','V00002','V00003','V00004','V00005','V00006','V00007','V00008','V00009'],
            }
        ]
    },
    {
        tema: 'NÃO PCT',
        subtemas: [
            {
                nome: 'Características do Domicílio - Parte 1',
                arquivo: 'Agregados_por_municipios_caracteristicas_domicilio1_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 89}, (_, i) => 'V' + String(i + 1).padStart(5, '0')),
            },
            {
                nome: 'Características do Domicílio - Parte 2',
                arquivo: 'Agregados_por_municipios_caracteristicas_domicilio2_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 406}, (_, i) => 'V' + String(i + 90).padStart(5, '0')),
            },
            {
                nome: 'Características do Domicílio - Parte 3',
                arquivo: 'Agregados_por_municipios_caracteristicas_domicilio3_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 148}, (_, i) => 'V' + String(i + 496).padStart(5, '0')),
            },
            {
                nome: 'Alfabetização',
                arquivo: 'Agregados_por_municipios_alfabetizacao_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 362}, (_, i) => 'V' + String(i + 644).padStart(5, '0')),
            },
            {
                nome: 'Demografia',
                arquivo: 'Agregados_por_municipios_demografia_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 36}, (_, i) => 'V' + String(i + 1006).padStart(5, '0')),
            },
            {
                nome: 'Parentesco',
                arquivo: 'Agregados_por_municipios_parentesco_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 182}, (_, i) => 'V' + String(i + 1042).padStart(5, '0')),
            },
            {
                nome: 'Óbitos',
                arquivo: 'Agregados_por_municipios_obitos_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 93}, (_, i) => 'V' + String(i + 1224).padStart(5, '0')),
            },
            {
                nome: 'Cor ou Raça',
                arquivo: 'Agregados_por_municipios_cor_ou_raca_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 95}, (_, i) => 'V' + String(i + 1317).padStart(5, '0')),
                prefixo: 'V'
            }
        ]
    },
    {
        tema: 'PCT INDÍGENAS',
        subtemas: [
            {
                nome: 'Domicílios Indígenas',
                arquivo: 'Agregados_por_municipios_domicilios_indigenas_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 190}, (_, i) => 'V' + String(i + 1500).padStart(5, '0')),
            },
            {
                nome: 'Pessoas Indígenas',
                arquivo: 'Agregados_por_municipios_pessoas_indigenas_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 839}, (_, i) => 'V' + String(i + 1690).padStart(5, '0')),
                prefixo: 'V'
            }
        ]
    },
    {
        tema: 'PCT QUILOMBOLAS',
        subtemas: [
            {
                nome: 'Domicílios Quilombolas',
                arquivo: 'Agregados_por_municipios_domicilios_quilombolas_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 196}, (_, i) => 'V' + String(i + 3000).padStart(5, '0')),
            },
            {
                nome: 'Pessoas Quilombolas',
                arquivo: 'Agregados_por_municipios_pessoas_quilombolas_BR.csv',
                colunaGeo: 'CD_MUN',
                vars: Array.from({length: 755}, (_, i) => 'V' + String(i + 3196).padStart(5, '0')),
                prefixo: 'V'
            }
        ]
    }
];
