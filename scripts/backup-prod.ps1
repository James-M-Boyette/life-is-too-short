# Run from the Angular project's root directory

$backupDir = "D:\Coding - Code Files\+_DATA_BACKUPS\LifeIsTooShort"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $backupDir "app-data-$timestamp.sql"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

pnpm exec supabase db dump `
    --linked `
    --data-only `
    --schema public `
    --file $backupFile

if ($LASTEXITCODE -ne 0) {
    throw "Supabase backup failed."
}

if (!(Test-Path $backupFile) -or (Get-Item $backupFile).Length -eq 0) {
    throw "Backup is missing or empty."
}

Write-Host "Backup saved to: $backupFile"
Get-Item $backupFile | Select-Object Name, Length, LastWriteTime

# Check that both expected data sections exist
$projectsFound = [bool](Select-String -Path $backupFile -SimpleMatch 'INSERT INTO "public"."projects"' -Quiet)
$tasksFound = [bool](Select-String -Path $backupFile -SimpleMatch 'INSERT INTO "public"."tasks"' -Quiet)
$completed = [bool](Select-String -Path $backupFile -SimpleMatch 'PostgreSQL database dump complete' -Quiet)

if (!$projectsFound -or !$tasksFound -or !$completed) {
    throw "Backup verification failed: expected SQL sections were not found."
}

Write-Host "Basic backup checks passed."
