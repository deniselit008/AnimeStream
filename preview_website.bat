@echo off
setlocal
chcp 65001 >nul
title AnimeStream - Vista Previa de la P?gina Web de Descargas

echo =================================================================
echo ?? AnimeStream - Servidor Local de la P?gina de Descargas (SEO)
echo =================================================================
echo.
echo Iniciando servidor web local en http://localhost:8080 ...
echo Presiona Ctrl+C en esta consola para detener el servidor.
echo.

set "NODE_CMD="
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)

if defined NODE_CMD (
    start http://localhost:8080/
    "%NODE_CMD%" -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let f=path.join(__dirname,'website',req.url==='/'?'index.html':req.url.split('?')[0]);if(!fs.existsSync(f))f=path.join(__dirname,'website','index.html');const ext=f.split('.').pop();const m={'html':'text/html;charset=utf-8','css':'text/css','js':'application/javascript','svg':'image/svg+xml','json':'application/json','txt':'text/plain','xml':'application/xml'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':m});fs.createReadStream(f).pipe(res);}).listen(8080,()=>console.log('[i] Servidor activo en http://localhost:8080'));"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        start http://localhost:8080/
        python -m http.server 8080 --directory website
    ) else (
        echo [i] Abriendo directamente website\index.html en tu navegador...
        start "" "%~dp0website\index.html"
    )
)
