# Security review — compatibility spike and sidebar preview

October 6, 2026. Implementation self-review; **not an independent security audit
or public-release approval**. Real Kiro integration remains unverified.

## Resolved independent-review finding

The sidebar review identified indentation expansion of nested tool output before
the session memory check. Tool output now uses compact JSON, eliminating that
expansion while preserving the full supplied data. A regression test passes a
deeply nested frame through the real frame reader, verifies it fits its compact
budget, and verifies a subsequent over-budget update fails without replacing
retained details. All 55 tests, syntax checks and the rebuilt plugin package pass.

## Compared with native Kiro CLI

Authentication, native execution, existing permissions, project hooks, MCP
servers, provider networking and agent-owned history remain with Kiro. The
spike adds a JSON-RPC parser, protocol state machine, consent validator and
terminal inspection interface. Those are additional trust boundaries, so this
project makes no security-equivalence or zero-vulnerability claim.

## Verified with synthetic cases

- Absolute executable metadata validation and fixed launch arguments.
- Disabled client filesystem/terminal capabilities; unsupported requests return
  protocol errors and invoke no filesystem or execution handlers.
- Ordered text updates, ignored optional update variants, and prompt-response
  completion rather than progress-event completion.
- One-time option filtering; rejection of persistent-only, duplicate, extended
  or unknown choices and missing action details/unknown consent fields.
- Queued approval ordering, single-use decisions, stale session cancellation,
  cancellation of outstanding cards and blocked overlapping prompts.
- Fragmented UTF-8, invalid encodings/JSON, unterminated/oversized frames,
  excessive nesting, oversized prompts and session budget exhaustion.
- Startup failure, transport loss, unresolved cancellation, bounded stderr,
  ignored SIGTERM, owned-group grandchildren, and explicit uncertain cleanup.

Run `npm test` for the current executable assertions. Fixture results do not
establish that real Kiro executes, denies or cancels actions as intended.

## Remaining release work

The real compatibility matrix, representative resource validation, actual
Obsidian/Electron rendering/selection/persistence checks, release-action review
and independent adapter/approval review are pending. The installable developer
preview bundles only Node built-ins and the externally supplied Obsidian API;
esbuild and jsdom are development-only. Local DOM/API-fixture tests cover inert
rendering, selection snapshots, settings persistence and view ownership; a local
repeat build produces identical main-bundle bytes. These checks are not public
release acceptance.

The permission adapter intentionally cancels incomplete tool-call envelopes
rather than inventing details. The inherited environment may expose secrets to
Kiro; working directory is not confinement. Termination cannot control descendants
that detach from the owned group. User content deliberately printed by the spike
can remain in terminal scrollback. Kiro/provider history may persist independently.
