#!/usr/bin/env node
// Harness-only executable. It is never a compatibility substitute for Kiro.
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['acp', '--agent-engine=v3', '--auth-method=cli'])) {
  process.exit(2);
}
process.argv[2] = 'normal';
await import('./agent.js');
