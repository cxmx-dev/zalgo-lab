# garbler.ps1
# Expanded set of Unicode diacritics, symbols, and emojis for enhanced garbling

param (
    [string]$InputFile = "$PSScriptRoot\in\input.txt",
    [string]$OutputFile = "$PSScriptRoot\out\garbled_$(Get-Date -Format 'HHmmss-MMddyy').txt",
    [int]$MaxIntensity = 5,
    [switch]$Alternate,
    [switch]$RandomIntensity,
    [string]$DiacriticSet = "both",
    [int]$Variations = 1,
    [switch]$RandomCase,
    [switch]$Reverse,
    [switch]$ShuffleWords
)

# Function to convert Unicode escape sequence to character
function Convert-FromUnicodeEscape {
    param ([string]$unicode)
    if ($unicode -match '\\u\{([0-9A-Fa-f]+)\}') {
        return [char]::ConvertFromUtf32([int]::Parse($matches[1], [System.Globalization.NumberStyles]::HexNumber))
    }
    return $unicode
}

# Convert Unicode escape sequences to characters
$diacriticsAbove = @(
    (Convert-FromUnicodeEscape "\u{0300}"), # Grave accent
    (Convert-FromUnicodeEscape "\u{0301}"), # Acute accent
    (Convert-FromUnicodeEscape "\u{0302}"), # Circumflex
    (Convert-FromUnicodeEscape "\u{0303}"), # Tilde
    (Convert-FromUnicodeEscape "\u{0304}"), # Macron
    (Convert-FromUnicodeEscape "\u{0305}"), # Overline
    (Convert-FromUnicodeEscape "\u{0306}"), # Breve
    (Convert-FromUnicodeEscape "\u{0307}"), # Dot above
    (Convert-FromUnicodeEscape "\u{0308}"), # Diaeresis
    (Convert-FromUnicodeEscape "\u{0309}"), # Hook above
    (Convert-FromUnicodeEscape "\u{0310}"), # Candrabindu
    (Convert-FromUnicodeEscape "\u{0311}"), # Inverted breve
    (Convert-FromUnicodeEscape "\u{0312}"), # Turned comma above
    (Convert-FromUnicodeEscape "\u{0313}"), # Comma above
    (Convert-FromUnicodeEscape "\u{035F}")  # Combining double breve below
)

$diacriticsBelow = @(
    (Convert-FromUnicodeEscape "\u{0323}"), # Dot below
    (Convert-FromUnicodeEscape "\u{0324}"), # Two dots below
    (Convert-FromUnicodeEscape "\u{0327}"), # Cedilla
    (Convert-FromUnicodeEscape "\u{0328}"), # Ogonek
    (Convert-FromUnicodeEscape "\u{0332}"), # Low line
    (Convert-FromUnicodeEscape "\u{0333}"), # Double low line
    (Convert-FromUnicodeEscape "\u{0325}"), # Ring below
    (Convert-FromUnicodeEscape "\u{0326}"), # Comma below
    (Convert-FromUnicodeEscape "\u{0329}")  # Vertical line below
)

$specialSymbols = @(
    (Convert-FromUnicodeEscape "\u{2605}"), # Black star
    (Convert-FromUnicodeEscape "\u{266A}"), # Eighth note
    (Convert-FromUnicodeEscape "\u{2713}"), # Check mark
    (Convert-FromUnicodeEscape "\u{26A1}"), # Lightning bolt
    (Convert-FromUnicodeEscape "\u{262F}"), # Yin yang
    (Convert-FromUnicodeEscape "\u{269B}"), # Atom symbol
    (Convert-FromUnicodeEscape "\u{267B}"), # Recycle symbol
    (Convert-FromUnicodeEscape "\u{1F5FF}"), # Moyai
    (Convert-FromUnicodeEscape "\u{1F4AC}"), # Speech balloon
    (Convert-FromUnicodeEscape "\u{1F3E0}"), # House building
    (Convert-FromUnicodeEscape "\u{1F50C}"), # Electric plug
    (Convert-FromUnicodeEscape "\u{1F4A1}"), # Light bulb
    (Convert-FromUnicodeEscape "\u{1F4A3}"), # Bomb
    (Convert-FromUnicodeEscape "\u{1F4A8}"), # Dash symbol
    (Convert-FromUnicodeEscape "\u{1F4AB}")  # Dizzy symbol
)

$emojis = @(
    (Convert-FromUnicodeEscape "\u{1F600}"), # Grinning face
    (Convert-FromUnicodeEscape "\u{1F525}"), # Fire
    (Convert-FromUnicodeEscape "\u{1F680}"), # Rocket
    (Convert-FromUnicodeEscape "\u{1F60D}"), # Heart eyes
    (Convert-FromUnicodeEscape "\u{1F44D}"), # Thumbs up
    (Convert-FromUnicodeEscape "\u{1F389}"), # Party popper
    (Convert-FromUnicodeEscape "\u{1F3C6}"), # Trophy
    (Convert-FromUnicodeEscape "\u{1F4BB}"), # Computer
    (Convert-FromUnicodeEscape "\u{1F310}"), # Globe
    (Convert-FromUnicodeEscape "\u{1F4A5}"), # Collision
    (Convert-FromUnicodeEscape "\u{1F602}"), # Face with tears of joy
    (Convert-FromUnicodeEscape "\u{1F914}"), # Thinking face
    (Convert-FromUnicodeEscape "\u{1F92F}"), # Exploding head
    (Convert-FromUnicodeEscape "\u{1F973}"), # Partying face
    (Convert-FromUnicodeEscape "\u{1F609}"), # Winking face
    (Convert-FromUnicodeEscape "\u{1F62E}"), # Face with open mouth
    (Convert-FromUnicodeEscape "\u{1F631}"), # Face screaming in fear
    (Convert-FromUnicodeEscape "\u{1F47B}"), # Ghost
    (Convert-FromUnicodeEscape "\u{1F383}"), # Jack-O-Lantern
    (Convert-FromUnicodeEscape "\u{1F47D}")  # Alien
)

# Function to garble text with customizable diacritic sets
function Garble-Text {
    param (
        [string]$InputText,
        [int]$MaxIntensity = 5,
        [switch]$Alternate,
        [switch]$RandomIntensity,
        [string]$DiacriticSet = "both",
        [switch]$RandomCase,
        [switch]$Reverse,
        [switch]$ShuffleWords
    )
    try {
        $output = ""
        $isAbove = $true
        $allSets = @($diacriticsAbove, $diacriticsBelow, $specialSymbols, $emojis)
        # Prepare text for garbling
        $textToGarble = $InputText
        if ($Reverse) {
            $textToGarble = $textToGarble.ToCharArray() | Sort-Object -Descending | ForEach-Object { $_ } -join ''
        }
        if ($ShuffleWords) {
            $words = $textToGarble -split '\s+' | Where-Object { $_ }
            if ($words.Count -gt 0) {
                $words = $words | Get-Random -Count $words.Count
                $textToGarble = $words -join ' '
            }
        }
        foreach ($char in $textToGarble.ToCharArray()) {
            # Apply random case if enabled
            if ($RandomCase -and (Get-Random -Maximum 2) -eq 0) {
                $char = if ([char]::IsUpper($char)) { $char.ToString().ToLower() } else { $char.ToString().ToUpper() }
            }
            $output += $char
            $intensity = if ($RandomIntensity) { Get-Random -Minimum 0 -Maximum ($MaxIntensity + 3) } else { $MaxIntensity }
            $diacriticSet = switch ($DiacriticSet.ToLower()) {
                "above" { $diacriticsAbove }
                "below" { $diacriticsBelow }
                "special" { $specialSymbols }
                "emoji" { $emojis }
                "both" { if ($Alternate) { if ($isAbove) { $diacriticsAbove } else { $diacriticsBelow } } else { $allSets | Get-Random } }
                default { $allSets | Get-Random }
            }
            if ($diacriticSet) {
                if ((Get-Random -Maximum 3) -ne 0) {
                    for ($i = 0; $i -lt $intensity; $i++) {
                        $randomDiacritic = $diacriticSet | Get-Random
                        $output += $randomDiacritic
                    }
                }
            }
            if ($Alternate -and $DiacriticSet -eq "both") { $isAbove = -not $isAbove }
        }
        return $output
    }
    catch {
        Write-Error "Error garbling text: $_"
        return $null
    }
}

# Process input from file and save multiple outputs
try {
    if (Test-Path $InputFile) {
        $inputText = Get-Content -Path $InputFile -Raw
        for ($i = 1; $i -le $Variations; $i++) {
            $garbledText = Garble-Text -InputText $inputText -MaxIntensity $MaxIntensity -Alternate:$Alternate -RandomIntensity:$RandomIntensity -DiacriticSet $DiacriticSet -RandomCase:$RandomCase -Reverse:$Reverse -ShuffleWords:$ShuffleWords
            if ($null -eq $garbledText) { throw "Garbling failed." }
            $outputPath = $OutputFile -replace '\.txt$', "_$i.txt"
            Write-Host "Variation $i Original: $inputText"
            Write-Host "Variation $i Garbled: $garbledText"
            $outDir = Split-Path $outputPath -Parent
            if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
            [System.IO.File]::WriteAllText($outputPath, $garbledText, [System.Text.Encoding]::UTF8)
            Write-Host "Variation $i saved to $outputPath"
        }
    } else {
        Write-Host "Input file $InputFile not found. Creating a sample input file."
        # Ensure the 'in' directory exists before creating the file
        $inDir = Join-Path $PSScriptRoot "in"
        if (!(Test-Path $inDir)) { New-Item -ItemType Directory -Path $inDir -Force | Out-Null }
        Set-Content -Path $InputFile -Value "Sample text to garble" -Encoding UTF8
        $inputText = Get-Content -Path $InputFile -Raw
        for ($i = 1; $i -le $Variations; $i++) {
            $garbledText = Garble-Text -InputText $inputText -MaxIntensity $MaxIntensity -Alternate:$Alternate -RandomIntensity:$RandomIntensity -DiacriticSet $DiacriticSet -RandomCase:$RandomCase -Reverse:$Reverse -ShuffleWords:$ShuffleWords
            if ($null -eq $garbledText) { throw "Garbling failed." }
            $outputPath = $OutputFile -replace '\.txt$', "_$i.txt"
            $outDir = Split-Path $outputPath -Parent
            if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
            [System.IO.File]::WriteAllText($outputPath, $garbledText, [System.Text.Encoding]::UTF8)
            Write-Host "Variation $i saved to $outputPath"
        }
    }
}
catch {
    Write-Error "Error processing input/output: $_"
}
