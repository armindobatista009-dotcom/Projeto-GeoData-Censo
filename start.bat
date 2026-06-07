@echo off
title Agregados por Setores Censitários 2022
cd /d "%~dp0"

if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo Erro ao instalar dependencias
        pause
        exit /b 1
    )
)

if not exist "data\geodata.db" (
    if exist "data\geodata.db.gz" (
        echo Descomprimindo banco de dados...
        powershell -Command "$d=[System.IO.File]::ReadAllBytes('data\geodata.db.gz');$m=[System.IO.Compression.GZipStream]::new([System.IO.MemoryStream]::new($d),[System.IO.Compression.CompressionMode]::Decompress);$ms=[System.IO.MemoryStream]::new();$m.CopyTo($ms);[System.IO.File]::WriteAllBytes('data\geodata.db',$ms.ToArray())"
    ) else (
        echo Executando migracao do banco de dados...
        node migrate.js
        if errorlevel 1 (
            echo Erro na migracao
            pause
            exit /b 1
        )
    )
)

echo Iniciando Agregados por Setores Censitários 2022...
node server.js
pause
