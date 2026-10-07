# Kiro compatibility gate

Date: October 6, 2026. Stages 1 and 2 are implemented; real integration is **unverified**.
The user explicitly authorized building the UI before passing the real gate.

## Compatibility matrix

| Component | Version/status | Evidence |
|---|---|---|
| Development OS | macOS | Local development environment |
| Headless runtime | Node.js 26.8.1 | Local automated checks |
| Minimum headless runtime | Node.js 22+ | Uses built-in ESM, tests, streams; minimum-version run pending |
| Kiro V3 | Not selected / not available | Not on PATH or in common installation paths; no authenticated integration run |
| ACP | Protocol version 1 | Negotiation and synthetic fixtures verified |
| Obsidian | Manifest baseline 1.5.0+ (unverified) | UI/registration checked with DOM/API fixtures; no real application run |

Do not infer a Kiro release or V3 server generation from the ACP protocol number.
The launch explicitly requests V3. Record the returned `agentInfo` and separately
check the installed release through the user's normal CLI workflow. The spike
validates executable file metadata without running a version command.

## Required real exercise

Use a disposable directory with no secrets. Review existing Kiro configuration
through the normal CLI workflow, including preapproved actions. The spike must
not modify it. Kiro's hooks and native MCP servers may still initialize.

1. Run `--check` with absolute executable and workspace paths. Verify successful
   initialization and new session, protocol version 1, supplied CLI identity,
   and observed process cleanup. Client capabilities sent by this implementation
   disable filesystem read/write and terminal execution.
2. Start the interactive spike. Ask for a short textual reply. Verify multiple
   ordered text updates and a settled prompt response. Send a second prompt and
   verify that the existing conversation continues.
3. Ask Kiro to perform a harmless native action, such as creating a known test
   file with fixed contents in the disposable workspace. If the native policy
   preapproves it, choose a different operation requiring consent; absence of a
   card is not evidence of approval routing. Inspect complete structured input,
   paths and consent context; select the actual `allow_once` option ID.
4. Independently verify the action's result. Record that Kiro performed it while
   the client advertised no filesystem or terminal capabilities. An unsupported
   client execution request receives `-32601` and executes nothing.
5. Request a different harmless action that needs consent. Select its actual
   `reject_once` option ID. Independently verify it did not occur, inspect Kiro's
   response, then continue the conversation. Partial requests must show earlier
   details for the same tool-call ID, or identify missing arguments and wait for
   a user decision. Unsupported consent semantics still cancel the request.
6. Request an operation that waits on permission. Use `/stop`. Verify outstanding
   approvals settle as cancelled, new prompts remain blocked until the original
   prompt response settles, and cancellation does not become consent.
7. Exercise cancellation during active work. Inspect the response's stop reason
   and actual action outcome. A progress notification alone must not end the turn.
   If cancellation does not settle, verify `/force` becomes available after five
   seconds, invoke it, and confirm observed owned-group cleanup.
8. Quit and restart explicitly. Verify a new process/session, no automatic prompt
   replay, and no client transcript archive. Native Kiro/provider history is
   independent and is not erased by this client.

Record CLI release, OS/runtime, returned identity, action observations, permission
kinds/consent semantics, cancellation results and cleanup outcomes here. Keep
private action arguments, transcripts and credentials out of committed evidence.

**Pass only when all required behaviors are observed against real Kiro.** If
Kiro requires client execution or a safe one-time route is unavailable, stop at
this spike and revisit the product choice. Do not substitute a different engine,
add client tools, disable consent, or infer success from synthetic tests.

## Evidence record

| Observation | Result |
|---|---|
| Real initialization and session creation | Pending installed/authenticated Kiro |
| Real streamed reply and continued conversation | Pending |
| Native execution with client capabilities disabled | Pending |
| One-time allow and verified effect | Pending |
| One-time denial and verified absence of effect | Pending |
| Pending-approval and active-turn cancellation | Pending |
| Force stop and observed owned-group cleanup | Pending |
| Explicit restart without replay | Pending |

## Official contract references

Reviewed on October 6, 2026:

- [Official downloads](https://kiro.dev/downloads/): CLI installer at
  `https://cli.kiro.dev/install`. Installation is a separate user setup step.
- [Authentication](https://kiro.dev/docs/getting-started/authentication/):
  browser/device sign-in through `kiro-cli login`.
- [Kiro V3 ACP migration](https://kiro.dev/docs/cli/v3/acp-migration/): fixed V3
  launch, CLI-owned authentication, standard one-time options, turn response semantics.
- [ACP initialization](https://agentclientprotocol.com/protocol/v1/initialization):
  capability negotiation; unsupported omitted/disabled client execution.
- [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup):
  explicit working directory and empty client-supplied MCP list.
- [ACP tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls): structured
  action updates and permission decisions with offered option IDs.
- [ACP prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn):
  streaming, prompt completion and cancellation.

The general [Kiro ACP page](https://kiro.dev/docs/cli/acp/) still includes V2
examples. Use the V3 migration guide for this project's launch, permission and
turn-completion behavior. The public docs establish the intended contract; they
do not demonstrate native execution with client capabilities disabled against
an installed release. That observation remains part of the real gate above.
