# Developer boundaries

## Scope and next stage

The stage-1 experiment and stage-2 Obsidian sidebar are implemented. The user
authorized the UI before the real gate in [compatibility.md](compatibility.md).
It is an installable developer preview with explicit Start, selection snapshots,
restricted Markdown reply rendering, approval inspection, Stop and New chat. The
manifest declares an initial Obsidian 1.5.0+ baseline; real app verification is
pending. The product specification includes the requested composer, full-note context, and Markdown reply updates.

Runtime modules use Node/Electron built-ins and Obsidian's API, plus a bundled, pinned markdown-it parser, without a network
client, logging framework or content archive. Bot Markdown is parsed into tokens
and rendered with a fixed DOM tag/attribute allowlist. Raw HTML parsing and image loading are
disabled; only explicit HTTP(S) and mail links are navigable. Tool and note context
remain text nodes. No embeds, resource loads, or Markdown plugins are used. esbuild and jsdom are pinned
development dependencies, excluded from the plugin runtime. `npm run build`
produces the three plugin files. Build determinism was checked locally by
rebuilding and comparing the main bundle hash. Public-release acceptance and an
independent security review are still pending.

## Sidebar verification

The DOM suite exercises the actual `ChatPanel` component, including inert HTML,
links/media syntax, terminal escapes, snapshot previews/removal, stale decisions,
copy fidelity, keyboard behavior and stable rows during streaming. Obsidian
API-stub tests check enablement/restored views without launch, duplicate panel
ownership, content cleanup on close and settings writes containing only the path.
Controller tests cover delayed-start closure, reset generations, draft recovery,
selection-only sends, removed-context exclusion and uncertain cleanup recovery.
These do not replace Electron/Obsidian or Kiro integration tests.

`npm run preview` exposes only local developer UI fixtures, outside the plugin
bundle. Saved browser screenshots are in `docs/screenshots/`. Fixture actions
never spawn Kiro or edit vault files. The production plugin contains no server.

## Launch and inherited environment

`launchKiro` uses an absolute executable and the fixed array:

```text
acp --agent-engine=v3 --auth-method=cli
```

It uses `shell: false`, a detached owned process group and piped stdio. It does
not source a shell, add arbitrary arguments, inject credentials, or change the
native agent configuration. Executable validation checks file type and execute
permission, following a symlink to an existing file; it is not an authenticity
check and cannot prevent another process replacing that executable later.

The process inherits the execution host's existing OS environment. That may
contain PATH, HOME, proxy settings, or secrets, just as an existing CLI workflow
may. No environment values are logged. The parent does not access credential
files or run login. The working directory and empty client MCP list do not
restrict native Kiro filesystem access or disable configured servers/hooks.

## Protocol and state

Handlers attach before initialization and session creation. Updates received
while session creation is pending are bounded and routed after the session ID
is known. Standard text prompting needs no optional prompt capability. Optional
features (session resume, extensions, images, client tools) are not invoked.
Unknown notifications/update variants are ignored safely; unknown request
methods receive an explicit protocol error.

Each `AcpSession` is one process generation. Request maps and approval choices
are instance-local. A broken connection fails the session, rejects pending
prompts and begins owned-group cleanup; it never reconnects or retries.

`session/prompt` settlement owns turn completion. Progress metadata cannot change
Working to Ready. Stop first disables approvals, returns cancelled dispositions,
then sends `session/cancel`. After five seconds only the availability of force
stop changes. There is no total turn timeout.

The fixture suite uses a synthetic agent and real local subprocesses. Fixture
choices prove client response handling, not native Kiro's effect or cancellation
semantics. The same distinction applies to client-method rejection tests.

## Consent adapter limitations

The initial spike requires a tool ID, title, kind and non-null raw input in the
permission request itself. It does not merge incomplete permission payloads with
previous tool updates. ACP permits partial tool-call updates, so real Kiro may
produce requests this spike conservatively cancels. Inspect observed envelopes
and specify a tested lossless merge if needed before relaxing this gate.

Only `allow_once` and `reject_once` choices are actionable, using original IDs.
Persistent choices never receive an alternate one-time label. Known Kiro consent
fields are preserved; unknown consent metadata, extended option semantics and
unsupported MCP envelope versions cancel the request. MCP hints never grant
authority. This is a conservative compatibility policy, not a complete semantic
validator for every future server release.

The interactive spike shows the entire JSON permission request and exact option
IDs. JSON serialization preserves array boundaries and escapes terminal control
characters. The eventual UI must independently prove inert text-node rendering,
complete inspection and disabled buttons on stale/unsupported decisions.

## Resource and cleanup boundaries

Frame limit is 8 MiB before JSON parsing, plus a conservative maximum JSON nesting
depth of 64 before parsing. UTF-8 decoding rejects invalid byte sequences.
Outgoing writes are bounded, including buffered bytes. Session budget is 16 MiB;
the client counts all inbound frames cumulatively, including ignored metadata,
plus prompt text and the sidebar's reconstructed display strings. This is stricter
than retained content alone, bounds request-ID tracking, and may reject long
sessions earlier than the proposed product limit.
Validate representative conversations before finalizing retention accounting.

Stderr retains only the last 64 KiB in memory and is never emitted raw. Approval
queue limit is 16. Startup covers initialization and session creation together
with a 15-second deadline. Oversized prompts remain unsent. Transport/retention
failure ends the session rather than dropping supplied approval details.

Termination sends SIGTERM to the owned process group, waits up to two seconds,
then SIGKILL and waits up to two more seconds. Success requires group disappearance
and observed direct-child exit. Cleanup failures remain visible and set an error
exit code in the harness. Independently detached descendants escape this group;
this is not a sandbox or universal process-tree guarantee.

Content is held in memory only by the client; the spike writes nothing to disk.
Its terminal output is an explicit inspection surface and terminal scrollback
may retain it. It is not production plugin diagnostics. Kiro/provider storage,
OS swap and crash dumps remain outside this promise.
