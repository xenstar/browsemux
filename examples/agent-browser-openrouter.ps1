$ErrorActionPreference = 'Stop'

browsemux run `
  --backend agent-browser `
  --provider openrouter `
  --model typesafe/jev-1.14 `
  --url https://example.com `
  --goal "Open the Learn more documentation link" `
  --success-url-contains iana.org `
  --max-steps 4 `
  --jsonl
