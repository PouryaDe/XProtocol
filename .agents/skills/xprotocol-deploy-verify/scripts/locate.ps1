param(
  [Parameter(Mandatory=$true)][string]$Pattern,
  [ValidateSet("all","server","web","deploy","tests")][string]$Scope = "all"
)

$paths = switch ($Scope) {
  "server" { @("server/src/**/*.ts") }
  "web"    { @("web/src/**/*.ts", "web/src/**/*.tsx") }
  "deploy" { @("deploy/*.sh", "deploy/*.service") }
  "tests"  { @("server/tests/*.ts") }
  default  { @("server/src/**/*.ts", "web/src/**/*.ts", "web/src/**/*.tsx", "deploy/*.sh") }
}

Select-String -Path $paths -Pattern $Pattern | ForEach-Object {
  $rel = $_.Path.Replace((Get-Location).Path + "\", "")
  "$rel`:$($_.LineNumber): $($_.Line.Trim())"
}
