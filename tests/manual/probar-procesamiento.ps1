# Prueba de punta a punta: crea una carga con un archivo, la valida y la procesa.
# Necesita la API (npm run dev) y el servicio de procesamiento (uvicorn) en marcha.
# Pide el correo y la contrasena por teclado: no quedan guardados en ningun archivo.
#
# Uso (desde la carpeta de la API):
#   powershell -ExecutionPolicy Bypass -File .\tests\manual\probar-procesamiento.ps1 -Archivo "C:\ruta\archivo.csv"
param(
    [Parameter(Mandatory = $true)][string]$Archivo,
    [string]$Api = 'http://localhost:3000/api/v1',
    [int]$FuenteId = 0,
    [string]$PeriodoDesde = '2026-10-30',
    [string]$PeriodoHasta = '2026-11-04'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Archivo)) { throw "No existe el archivo: $Archivo" }
$Archivo = (Resolve-Path -LiteralPath $Archivo).Path
$galleta = Join-Path $env:TEMP ("sesion_" + [guid]::NewGuid().ToString('N') + '.txt')

# Llama a la API con curl.exe y devuelve la respuesta ya convertida. Si la API responde con error, se detiene.
function Invoke-Api {
    param([string]$Metodo, [string]$Ruta, $Cuerpo = $null, [string[]]$Formulario = @())
    $argumentos = @('-s', '-X', $Metodo, '-b', $galleta, '-c', $galleta)
    $temporal = $null
    if ($null -ne $Cuerpo) {
        $temporal = Join-Path $env:TEMP ("cuerpo_" + [guid]::NewGuid().ToString('N') + '.json')
        [IO.File]::WriteAllText($temporal, ($Cuerpo | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
        $argumentos += @('-H', 'Content-Type: application/json', '--data-binary', "@$temporal")
    }
    foreach ($campo in $Formulario) { $argumentos += @('-F', $campo) }
    try {
        $salida = & curl.exe @argumentos "$Api$Ruta"
    } finally {
        if ($temporal) { Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue }
    }
    $texto = ($salida -join "`n")
    try { $r = $texto | ConvertFrom-Json } catch { throw "Respuesta inesperada de $Ruta : $texto" }
    if ($r.ok -ne $true) { throw "Error en $Ruta -> $($r.code): $($r.message)" }
    return $r
}

try {
    # 1) Inicio de sesion
    $correo = Read-Host 'Correo'
    $segura = Read-Host 'Contrasena' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $sesion = Invoke-Api 'POST' '/auth/login' @{ email = $correo; password = $clave }
    $clave = $null
    Write-Host "Sesion iniciada: $($sesion.data.usuario.email) ($($sesion.data.usuario.rol))" -ForegroundColor Green

    # 2) Fuente
    if ($FuenteId -le 0) {
        $lista = (Invoke-Api 'GET' '/fuentes').data.fuentes
        $lista | ForEach-Object { Write-Host ("  {0}  {1}  {2}" -f $_.id, $_.codigo, $_.nombre) }
        $respuesta = Read-Host "Id de la fuente (o escribe 'nueva' para crear la fuente Observatorio UPSE)"
        if ($respuesta -eq 'nueva') {
            $fuente = Invoke-Api 'POST' '/fuentes' @{
                codigo      = 'observatorio_upse'
                nombre      = 'Observatorio Turistico de la UPSE'
                institucion = 'Universidad Estatal Peninsula de Santa Elena'
                descripcion = 'Encuestas a turistas y datos de ocupacion de alojamientos levantados en los feriados de la provincia de Santa Elena.'
            }
            $FuenteId = [int]$fuente.data.fuente.id
            Write-Host "Fuente creada con id $FuenteId" -ForegroundColor Green
        } else {
            $FuenteId = [int]$respuesta
        }
    }

    # 3) Carga con el archivo (el original queda guardado sin modificar)
    $campos = @("fuenteId=$FuenteId", 'descripcion=Prueba de punta a punta', "periodoDesde=$PeriodoDesde", "periodoHasta=$PeriodoHasta", "archivo=@$Archivo")
    $carga = Invoke-Api 'POST' '/cargas' -Formulario $campos
    $cargaId = $carga.data.carga.id
    $archivoId = $carga.data.archivos[0].id
    Write-Host "Carga $cargaId creada (archivo $archivoId, estado $($carga.data.carga.estado))" -ForegroundColor Green

    # 4) Validar y 5) procesar
    foreach ($tipo in 'validacion', 'procesamiento') {
        $r = (Invoke-Api 'POST' "/cargas/$cargaId/procesamientos" @{ tipo = $tipo; archivoId = $archivoId }).data
        Write-Host ""
        Write-Host "== $tipo (procesamiento $($r.procesamiento.id)): $($r.procesamiento.estado) ==" -ForegroundColor Cyan
        Write-Host "   estructura: $($r.estructura.codigo)"
        Write-Host "   filas leidas: $($r.resumen.filasLeidas)  validas: $($r.resumen.filasValidas)  excluidas: $($r.resumen.filasExcluidas)"
        Write-Host "   errores: $($r.resumen.errores)  alertas: $($r.resumen.alertas)  registros guardados: $($r.registrosGuardados)"
        $ultimo = $r.procesamiento.id
    }

    # 6) Resumen de lo que se guardo, por regla
    $h = (Invoke-Api 'GET' "/cargas/$cargaId/procesamientos/$ultimo/hallazgos?limite=1").data
    Write-Host ""
    Write-Host "Hallazgos del procesamiento ${ultimo}:" -ForegroundColor Cyan
    $h.resumen | ForEach-Object { Write-Host ("   {0,-10} {1,-34} {2}" -f $_.severidad, $_.regla, $_.total) }
    $estado = (Invoke-Api 'GET' "/cargas/$cargaId").data.carga
    Write-Host ""
    Write-Host "La carga $cargaId quedo en estado '$($estado.estado)', nivel de ingreso $($estado.nivelIngreso)." -ForegroundColor Green
}
finally {
    Remove-Item -LiteralPath $galleta -Force -ErrorAction SilentlyContinue
}
