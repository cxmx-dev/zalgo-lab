# obfuscate.ps1
# Base64 obfuscation with random character substitution

param (
    [string]$InputFile = "$PSScriptRoot\in\input.txt",
    [string]$OutputFile = "$PSScriptRoot\out\obfuscated_$(Get-Date -Format 'HHmmss-MMddyy').txt",
    [int]$Variations = 1,
    [switch]$RandomSub
)

# Function to convert text to Base64
function Convert-ToBase64 {
    param ([string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return [Convert]::ToBase64String($bytes)
}

# Function to apply random character substitution
function Apply-RandomSubstitution {
    param ([string]$Text)
    $chars = $Text.ToCharArray()
    $subChars = @('!', '@', '#', '$', '%', '^', '&', '*', '+', '=', '?', '/', '|', '~', '-', '_', '.', ',', ';', ':', '[', ']', '{', '}', '(', ')', '<', '>')
    for ($i = 0; $i -lt $chars.Length; $i++) {
        if ($RandomSub -and (Get-Random -Maximum 4 -Minimum 0) -eq 0) { # 25% chance to substitute
            $chars[$i] = $subChars | Get-Random
        }
    }
    return -join $chars
}

# Process input and obfuscate
try {
    if (Test-Path $InputFile) {
        $inputText = Get-Content -Path $InputFile -Raw
        for ($i = 1; $i -le $Variations; $i++) {
            $obfuscatedText = Convert-ToBase64 -Text $inputText
            if ($RandomSub) {
                $obfuscatedText = Apply-RandomSubstitution -Text $obfuscatedText
            }
            $outputPath = $OutputFile -replace '\.txt$', "_$i.txt"
            Write-Host "Variation $i Original: $inputText"
            Write-Host "Variation $i Obfuscated: $obfuscatedText"
            $outDir = Split-Path $outputPath -Parent
            if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
            [System.IO.File]::WriteAllText($outputPath, $obfuscatedText, [System.Text.Encoding]::UTF8)
            Write-Host "Variation $i saved to $outputPath"
        }
    } else {
        Write-Host "Input file $InputFile not found. Creating a sample input file."
        Set-Content -Path $InputFile -Value "Sample text to obfuscate" -Encoding UTF8
        $inputText = Get-Content -Path $InputFile -Raw
        for ($i = 1; $i -le $Variations; $i++) {
            $obfuscatedText = Convert-ToBase64 -Text $inputText
            if ($RandomSub) {
                $obfuscatedText = Apply-RandomSubstitution -Text $obfuscatedText
            }
            $outputPath = $OutputFile -replace '\.txt$', "_$i.txt"
            $outDir = Split-Path $outputPath -Parent
            if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
            [System.IO.File]::WriteAllText($outputPath, $obfuscatedText, [System.Text.Encoding]::UTF8)
            Write-Host "Variation $i saved to $outputPath"
        }
    }
}
catch {
    Write-Error "Error processing obfuscation: $_"
}
