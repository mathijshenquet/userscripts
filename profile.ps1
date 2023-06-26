
Set-Alias vscode code

function which($name)
{
    $script:Target = @{Name = 'Location/Target'; Expression = {
        if( $_.CommandType -eq "Alias") { $_.Definition }
        else { $_.ScriptBlock.File ?? $_.Source }
    }}
    Get-Command $name | Select-Object -Property Name, CommandType, $Target
}

function open($thing)
{
    Invoke-Item $thing
}

function path
{
    $env:Path.Split(";")
}

function dump
{
    Param([Parameter(Mandatory, ValueFromPipeline)] $thing)
    $thing | Format-List -Property *
}

function prompt {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal] $identity
  $adminRole = [Security.Principal.WindowsBuiltInRole]::Administrator

  $pre = $(if (Test-Path variable:/PSDebugContext) { '[DBG]: ' }
    elseif($principal.IsInRole($adminRole)) { "[ADMIN]: " }
    else { '' })

  $raw = $(Get-Location).Path
  $path = $raw.Split("\")
  $i = 0
  $location = ""
  if ($raw.StartsWith($HOME))
  {
    $location += "~"
    $i = 3
  }
  else
  {
    $location = "$($path[0])"
    $i = 1
  }

  while ($i -lt $path.Length - 1) {
    $location += "\$($path[$i][0])"
    $i += 1
  }

  if ( $i -eq $path.Length - 1 ) {
      $location += "\$($path[$i])"
  }

  $pre + $location + " " + $(">" * $NestedPromptLevel) + '> '
}

function l {
    param(
        [Parameter(Position=0)]$Target = ".",
        [switch][Alias("a")]$ShowAll,
        [switch][Alias("l")]$ShowList
    )

    $list = Get-ChildItem $Target
    
    if ( ! $ShowAll ) {
        $list = $list | Where-Object {$_.Name -notlike ".*"}
    } 

    $script:Name = @{name = "Name"; expression = { "$($_.Name)$(if ($_.PSIsContainer) { '\' } else { '' } )" }}

    if ( $ShowList ) {
        $list | Format-Table -Property Mode, FileSize, $Name, LastWriteTime
    } else {
        $list | Format-Wide -Property $Name.expression -AutoSize
    }
}

function la {
    param(
        [Parameter(Position=0)]$Target = ".",
        [switch][Alias("l")]$ShowList
    )

    l -a -l:$ShowList
}

function ll {
    param(
        [Parameter(Position=0)]$Target = ".",
        [switch][Alias("a")]$ShowAll
    )

    l -a:$ShowAll -l
}

Update-TypeData -Force -TypeName System.IO.FileInfo -MemberName FileSize -MemberType ScriptProperty -Value { 
    switch($this.length) {
        { $_ -gt 1tb } 
            { "{0:n2} TB" -f ($_ / 1tb) ; break }
        { $_ -gt 1gb } 
            { "{0:n2} GB" -f ($_ / 1gb) ; break }
        { $_ -gt 1mb } 
            { "{0:n2} MB " -f ($_ / 1mb) ; break }
        { $_ -gt 1kb } 
            { "{0:n2} KB " -f ($_ / 1kb) ; break }
        default  
            { "{0} B " -f $_} 
    }
}

Update-TypeData -Force -TypeName System.IO.FileInfo -DefaultDisplayPropertySet Mode,FileSize,Name,LastWriteTime