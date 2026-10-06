# obsidian-noter — Product specification

Version 0.2 · October 6, 2026 · Status: proposed MVP

## Product decision

Build a small desktop Obsidian plugin that provides one embedded conversation with the locally installed Kiro CLI. Users explicitly start Kiro, type or paste a prompt, optionally attach selected note text, review any requested action, and read the streamed reply without leaving Obsidian.

The security objective is to minimize additional exposure compared with native Kiro CLI. The product must not claim zero additional vulnerabilities, sandboxing, or complete security equivalence. It adds a protocol adapter and permission interface, both of which require verification.

Initial scope: **macOS, Kiro V3, one vault, one process, one conversation, restricted Markdown bot replies, and one-time permission decisions**. Windows, Linux, Kiro V2, and mobile are deferred until separately validated. This platform choice follows the current workspace context and is a product assumption, not a confirmed user requirement.

## User and problem

The initial user already uses Obsidian and has installed and authenticated Kiro CLI. They want to discuss their work and let Kiro perform tasks while keeping the conversation beside their notes.

The reviewed Agent Client plugin provides substantially more functionality than this user needs. The new product reduces its implementation and trust boundaries by leaving authentication, tool execution, configuration, and agent-owned history with Kiro.

## MVP experience

1. Install the plugin. Opening Obsidian or a note does not launch Kiro.
2. Open the **obsidian-noter** sidebar using the ribbon button or command palette.
3. On first use, select the existing Kiro executable. The plugin validates the path without running it. The user authenticates separately through their normal CLI workflow.
4. The panel shows the vault directory and a **Start Kiro** button. A short disclosure states: “Kiro uses its existing permissions and project configuration. Starting it may initialize configured hooks or MCP servers.”
5. Click Start. The panel transitions through Starting to Ready, or displays an actionable error.
6. Type or paste a prompt. Optionally select text in a note and click **Attach selection**, inspect its preview, then click Send. No note content is attached automatically.
7. Read streamed text and tool activity. If Kiro requests permission, inspect the complete action details and select an offered one-time Allow or Deny choice.
8. Click Stop to request cancellation. The panel remains in Stopping until the turn settles. If it does not settle promptly, offer **Force stop Kiro**.
9. Select New chat to end the current process, clear the visible transcript after confirmation when needed, and return to the Start screen. Close the panel to stop its process and discard its conversation.

Typing a prompt alone never launches Kiro. Switching active notes does not change the session directory, read note contents, or send a prompt.

## Interface

| Area | Required behavior |
|---|---|
| Header | obsidian-noter title, current status, and current directory. Show the resolved CLI identity/version after successful initialization when supplied. |
| Transcript | Ordered user text, agent text, and tool activity. Bot replies render Markdown headings, lists, emphasis, tables and code. Prompts and tool activity stay plain text. Timestamp and Copy source on each message. No raw HTML, embeds or automatic link/media loading. |
| Composer | Multiline text field, Attach selection and Attach file buttons, removable context preview, and Send button below the text field. Enter sends; Shift+Enter inserts a newline. Preserve unsent text and the attachment snapshot while switching notes. |
| Permission card | Action title, kind, complete structured input, affected paths, working-directory/consent context when supplied, and the offered one-time decisions. One active card with an explicit queue count. |
| Session controls | Start, Stop, Force stop when necessary, and New chat. Actions have explicit state-dependent availability. |
| Settings | Absolute Kiro executable path only. No credentials, arbitrary launch arguments, custom environment fields, permission overrides, or server definitions. |

Present the working directory as context, not as a promise that Kiro can access only that directory. If Kiro does not send a permission request, the plugin does not invent an approval claim.

## Functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-01 | Explicit startup | No CLI process starts on plugin enablement, vault open, sidebar open, note rendering, or restored layout. Only Start launches it. |
| FR-02 | Single session | Opening another panel focuses the existing panel. Concurrent processes, conversations, and prompts are prevented. |
| FR-03 | Explicit context | Prompts contain only composer text and the selection or full Markdown note explicitly attached by the user. Attach selection snapshots the selected editor text without reading the full note. Show the complete preview and Remove action before sending. No background note/clipboard reads or automatic context changes. |
| FR-04 | Streaming | Text updates appear incrementally and in order. Unknown optional update types do not crash the conversation. |
| FR-05 | Tool visibility | Display bounded, inert tool input/output and status. Tool execution remains agent-owned. |
| FR-06 | Permissions | Display all relevant supplied details and only one-time choices actually offered by the agent. No automatic approval or persistent-consent choice. |
| FR-07 | Cancellation | Stop resolves pending approvals as cancelled, requests turn cancellation, and blocks new prompts until the prior request settles or the process is terminated. |
| FR-08 | Clean closure | Closing, unloading, New chat, and forced termination clean up owned processes, streams, timers, and pending requests. |
| FR-09 | Error recovery | A broken connection displays a failure and requires explicit restart. A prompt is never resent automatically. |
| FR-10 | Ephemeral client state | Composer text, selection snapshots, transcript, tool details, and session handles are never written by the plugin to disk. |

## Attach context

**Attach file** explicitly captures the full current Markdown editor contents, including unsaved edits. Show its vault-relative path and complete inert snapshot preview before sending. It replaces any existing context only after the combined UTF-8 prompt limit passes. It never resolves linked notes, launches Kiro, or sends content on attachment. Use the same removal, snapshot stability, and cleanup rules as selection attachments.

### Attach selection

**Attach selection** is an explicit composer action, available when a Markdown editor has a non-empty text selection. Clicking it captures that selection once. Attach selection does not read the full note or resolve linked notes. Capture the selection from the last focused eligible editor in the current vault so clicking the sidebar does not lose the user's selection; revalidate the editor and selection at click time. If unavailable, explain that the user should select text in a note first.

- Allow one selected-text attachment per draft. Attaching another selection requires an explicit Replace selection action.
- Show the note's vault-relative path, line range, and a plain-text preview with the complete captured text inspectable. Avoid sending the absolute filesystem path as attachment metadata.
- The preview is a snapshot: note edits, focus changes, and selection changes do not silently update it. To refresh, attach the new selection explicitly.
- Remove discards the attachment and excludes it from the outgoing prompt. Neither attaching nor removing sends a message or starts Kiro.
- Send includes the composer text and snapshot as separately labelled plain-text context. Labels and delimiters aid presentation; they are not a prompt-injection defense. A selected-text-only message is allowed.
- On successful send, clear the draft attachment and show its source label and exact captured text in the in-memory user message. On failure, retain the draft for inspection; require an explicit send and warn if prior execution may have occurred. Never retry automatically.
- New chat, panel close, plugin unload, and vault change discard the snapshot. It is not persisted or logged.

Kiro may independently read other files through its own tools and permissions. This feature limits what the plugin attaches, not what the agent can access.

## Permission behavior

The permission interface is a primary security feature, not a compact notification.

- Render agent-supplied labels and values as inert text. Show exact argument boundaries through a structured representation rather than an ambiguous joined command string.
- Preserve paths, raw input, content and relevant metadata through the adapter. Clearly label missing details. Do not infer targets or authority from a friendly title.
- Long inputs may be visually collapsed, but must be fully inspectable within the supported limits. Never enable approval of an action whose supplied details have been discarded, truncated, or cannot be interpreted safely.
- Offer `allow_once` and `reject_once` only when present in the request. Do not relabel a persistent option as one-time or synthesize an option ID. If no safe one-time route exists, return a cancelled disposition and explain that the request is unsupported.
- A button applies to one request ID in the current session/process generation. Disable it immediately after a decision. Reject stale, duplicate, or mismatched requests safely.
- Stop, close, disconnect, and process failure cancel every unresolved request. There is no Allow all, Always allow, or keyboard approval shortcut in the MVP.
- Unknown security-relevant consent semantics produce an unsupported-request state rather than silent approval. Kiro's treatment of cancellations and one-time choices must be checked in integration tests.

The panel explains once: “Kiro may run actions already allowed by its own configuration without asking here.” It does not edit native Kiro permissions.

## Security and privacy requirements

| ID | Requirement | Verification |
|---|---|---|
| SEC-01 | CLI-owned authentication | No API-key fields, token handlers, credential files, or browser-authentication ownership in the plugin. |
| SEC-02 | Agent-owned execution | Advertise client filesystem and terminal capabilities as unavailable. Unsupported filesystem/terminal requests return a protocol error and execute nothing. |
| SEC-03 | Safe launch | Use an absolute executable and fixed argument array with shell execution disabled. No login-shell sourcing, command-string interpolation, installer, or arbitrary argument setting. |
| SEC-04 | Inert rendering | Render bot Markdown through a pinned parser with raw HTML disabled and image tokens rendered as text and a fixed DOM allowlist. Other content uses text nodes. No raw HTML, ANSI emulation, external images, automatically opened URLs, arbitrary application actions or live note embeds. Note/wiki links and current-vault obsidian://open links navigate through the Obsidian API only on click. |
| SEC-05 | No client archive | Inspect plugin writes and confirm that only the executable setting is persisted. No conversation autosave, export, disk logs, session index, or provider cache. |
| SEC-06 | Bounded resources | Enforce the ceilings below before unbounded parsing/rendering. Overflow cancels approvals, terminates the connection/process, and displays a bounded error without silently resuming. |
| SEC-07 | Process lifecycle | Launch in an owned process group; stop that group on termination, await exit and escalate after a bounded grace period. Do not report successful cleanup until observed. |
| SEC-08 | Minimal diagnostics | Log only operational codes and bounded non-content metadata. Do not log prompts, transcripts, raw RPC frames, environment values, tool arguments/output, or authentication URLs. |
| SEC-09 | No plugin networking | No plugin HTTP calls, analytics, update polling, remote resources, or local listening server. Obsidian's normal plugin distribution and Kiro's own network traffic remain outside this rule. |
| SEC-10 | Permission isolation | Never raise native trust, request an allow-all policy, alter Kiro configuration, or add client-supplied MCP servers/directories. |

Use the OS environment needed for the existing CLI workflow; do not add plugin-owned credentials or environment overrides. Record the inherited-environment boundary in developer documentation. The plugin cannot promise that Kiro, its hooks, or independently detached processes will not access secrets or continue running. Failed or uncertain cleanup must remain visible.

“In-memory only” means the plugin does not deliberately persist content. It does not promise secure erasure from OS memory, exclusion from system crash dumps, or absence of Kiro/provider-owned history.

## Resource defaults

These are proposed product limits to validate with representative conversations, not ACP-mandated limits.

| Resource | MVP limit/behavior |
|---|---|
| Prompt text and selected context | 128 KiB UTF-8 combined, including source labels and delimiters. Reject oversized attachments without truncating; oversized drafts remain unsent with a clear message. |
| One incoming RPC frame | 8 MiB; enforce while reading, before JSON parsing. |
| Cumulative retained session content | 16 MiB including transcript, tool details and request metadata. End the session on overflow; do not discard unseen approval details to stay under budget. |
| Retained stderr | 64 KiB ring buffer; not logged or displayed raw. |
| Pending permission requests | Maximum 16; overflow fails the session safely. |
| Startup | 15 seconds before startup failure and owned-process cleanup. |
| Cancellation | After 5 seconds unresolved, show Force stop. Do not automatically treat timeout as consent or turn completion. |
| Forced shutdown | SIGTERM to owned group, then SIGKILL after a 2-second grace period if still running; verify observed exit. |
| UI updates | Batch streamed rendering to maintain responsive typing and Stop. |

Do not set an arbitrary turn-duration timeout: long tasks may be legitimate. The user retains cancellation and force-stop controls.

## Kiro integration contract

Target one explicitly validated V3 CLI release for the MVP, record it in the compatibility matrix, and test negotiated behavior. The launch is a direct executable invocation with fixed arguments `acp`, `--agent-engine=v3`, `--auth-method=cli`. Kiro documents this authentication ownership and V3 launch route in its [ACP migration guide](https://kiro.dev/docs/cli/v3/acp-migration/).

Register update and permission handlers before session creation. Use standard initialization, new-session, prompt, and cancel operations; decide support from negotiated capabilities. Do not implement historical session discovery/resume, private slash-command routing, persistent consent, or client-supplied tools. A turn ends when its prompt response settles, not when a progress message appears. Unsupported requests receive explicit errors. These protocol choices follow the [Kiro migration guide](https://kiro.dev/docs/cli/v3/acp-migration/).

Capability negotiation is part of the [ACP initialization contract](https://agentclientprotocol.com/protocol/v1/initialization). Opening a session identifies its directory and agent inputs through the [ACP session setup contract](https://agentclientprotocol.com/protocol/v1/session-setup). An empty client-supplied MCP list does not establish that Kiro's existing servers are disabled.

**Feasibility gate:** demonstrate real Kiro execution with client filesystem and terminal capabilities disabled, including safe permission decisions and cancellation. If this fails, stop implementation at the spike and revisit the product choice. Do not silently add plugin-side execution to make it work.

## States and failure behavior

| State | Available actions and behavior |
|---|---|
| Not started | Edit prompt, configure path, Start. No process exists. |
| Starting | Startup status and Stop; sending disabled. |
| Ready | Send, New chat, close. |
| Working | Stream updates; Stop. Composer may hold an unsent draft, but sending is disabled. |
| Waiting for approval | Inspect and decide the active request, or Stop. No background approval. |
| Stopping | Sending and approval disabled; Force stop appears after the stated delay. |
| Failed/terminated | Preserve bounded visible content for copying where available. Explicit New chat/restart required; no replay or retry. |

For an invalid path, explain how to select the installed executable. For authentication failure, direct the user to their terminal login workflow. For unsupported CLI/capabilities, identify compatibility failure without launching a different engine. On transport loss, say the outcome of the previous task may be uncertain; never label it undone or resend it automatically.

## Deliberate exclusions

The MVP has no automatic note mentions, note picker, arbitrary binary/image/audio attachments, live note transclusions, executable code blocks, chat buttons in notes, transcript persistence/export, session resume/fork, multiple agents, model/mode selectors, custom tools, terminal emulation, notifications, background automation, installers, or provider settings. Users configure agents and tools through Kiro separately.

These exclusions remove features associated with the earlier audit findings. They do not remove Kiro's existing tool access, prompt-injection exposure, provider retention, or agent-owned history.

## Release acceptance

Release requires all of the following:

1. The feasibility gate passes against a real installed, authenticated Kiro V3 release.
2. End-to-end test: start, send, streamed reply, one-time approval, denial, continued conversation, cancellation and explicit restart.
3. Synthetic permission cases cover sensitive paths, structured arguments, missing details, absent one-time options, oversized input, duplicate requests, queue overflow and stale session IDs. Approval never changes scope or silently omits supplied action data.
4. Adversarial messages containing HTML, script-like links, agent code fences, remote images and terminal escapes stay inert; code fences render as code and unsafe links are non-navigable. Rendering causes no process launch, network request or navigation.
5. Process tests cover grandchildren, ignored SIGTERM, startup failure, transport loss, close and unload. Uncertain cleanup is reported; outstanding approvals settle safely.
6. Resource tests cover huge/unterminated frames, rapid streaming, large tool outputs and session overflow. UI remains responsive until an orderly bounded failure.
7. Disk/network inspection confirms no plugin transcript/credential storage, plugin content logs, remote-media fetches or telemetry. Independently document Kiro traffic and storage as outside the plugin's control.
8. Dependencies and release actions are pinned appropriately, production dependencies scanned, packaged files reviewed, and a clean reproducible build compared with the distributed asset.
9. User documentation accurately describes the working directory, existing Kiro permissions, provider processing, ephemeral client transcript, and the limits of Stop.
10. Selection tests verify capture of only the chosen text, complete inert preview, explicit replacement/removal, unchanged snapshots after note edits or focus changes, source labels, combined size enforcement, selected-text-only sends, no transmission/startup on attach, and cleanup on close/unload/vault change. Removed or unattached selections never enter prompts.

A security-focused review must assess the adapter and approval UI before first public release. Passing this checklist is evidence for the stated requirements, not a guarantee of vulnerability absence.

## Delivery plan and decisions

| Stage | Deliverable | Exit condition |
|---|---|---|
| 1. Compatibility spike | Headless experiment using the intended capability/authentication contract | Real Kiro passes the feasibility gate. |
| 2. Minimal product | Sidebar, composer, explicit selection attachment, streaming, permission cards and lifecycle controls | Happy-path experience works without adding excluded features. |
| 3. Hardening | Bounds, failure handling, lifecycle and security regression tests | Release acceptance criteria pass. |
| 4. Packaging | Installable desktop plugin, concise guide and compatibility matrix | Built artifact matches reviewed source/build evidence. |

Working estimate: approximately 1–2 weeks for an experienced developer, subject to the compatibility spike. This is an estimate, not a commitment.

Decisions for this draft: macOS first; Kiro V3 only; native Kiro defaults for model/agent selection; vault root as fixed session directory; explicit selected-text attachment with preview and removal; transcript discarded on panel close; one-time approvals only. Actual supported CLI and minimum Obsidian versions must be selected and recorded during the spike. Any scope expansion should be separately specified and reviewed.

Related artifact: [security review](security-review.md), including the comparison with native Kiro CLI.
