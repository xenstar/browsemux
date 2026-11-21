$ErrorActionPreference = 'Stop'

if (-not $env:BSK_SCOPE) {
  throw 'Set BSK_SCOPE to an existing Agent Window scope.'
}

browsemux run `
  --backend bsk `
  --provider openrouter `
  --model typesafe/jev-1.14 `
  --attach `
  --bsk-scope $env:BSK_SCOPE `
  --goal "Find the latest invoice" `
  --max-steps 12 `
  --jsonl
