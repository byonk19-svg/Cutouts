$ErrorActionPreference = "Stop"

$prototypeRoot = $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $prototypeRoot "..\..\..")).Path
$venvRoot = Join-Path $prototypeRoot "work\venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"

Push-Location $prototypeRoot
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
    if (-not (Test-Path -LiteralPath $venvPython)) {
        python -m venv $venvRoot
        if ($LASTEXITCODE -ne 0) { throw "virtual environment creation failed with exit code $LASTEXITCODE" }
    }
    & $venvPython -m pip install --disable-pip-version-check -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed with exit code $LASTEXITCODE" }
    node segment.mjs
    if ($LASTEXITCODE -ne 0) { throw "semantic segmentation failed with exit code $LASTEXITCODE" }
    $env:PYTHONPATH = $repoRoot
    & $venvPython build_evidence.py
    if ($LASTEXITCODE -ne 0) { throw "evidence generation failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}
