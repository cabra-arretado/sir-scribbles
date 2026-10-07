# Sir Scribbles

A small ACP (Agent Client Protocol) chat sidebar for your notes. Obsidian on macOS
is the currently supported host. The plugin is intended to work with multiple
ACP agents; Kiro V3 CLI is the currently supported provider, with its launch
arguments and permission handling implemented today. Other ACP providers are
planned and are not yet selectable or validated.

Obsidian hosts the plugin; the ACP agent supplies the conversation and tools.
The product specification is in [product-specification.md](product-specification.md).

**Current stage: installable developer preview.** The sidebar is built and wired
to the headless ACP adapter. The user authorized UI implementation before the
specification's real Kiro compatibility gate. That gate remains open: no installed,
authenticated Kiro V3 was available here. Automated and browser checks use fixtures;
this is not a public release or a claim of verified Kiro/Obsidian integration.

## Build and install

Requires Node.js 22+ for development; runtime uses Node/Electron built-ins,
Obsidian's supplied API, and the pinned
markdown-it parser bundled into main.js. Build/test dependencies are pinned.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run build
```

The build writes `main.js` to the repository root, beside `manifest.json` and
`styles.css`. It also copies all three files into `dist/sir-scribbles/`.
Copy these three files into:

```text
YOUR_VAULT/.obsidian/plugins/sir-scribbles/
  manifest.json
  main.js
  styles.css
```

Enable **Sir Scribbles** under Obsidian's Community plugins. Open the sidebar through
the ribbon button or the **Sir Scribbles: Open Sir Scribbles** command. The manifest declares
Obsidian 1.5.0+ as the initial API baseline; verification in a real app is pending.
macOS is the only supported launch platform for this preview.

When replacing the earlier preview, disable it and rename its plugin folder from
`obsidian-noter` (or `noter`) to `sir-scribbles`, then replace `main.js`, `manifest.json`, and `styles.css`.
The executable path is now stored on this device per vault, not in the vault's
`data.json`, so enter it once more after upgrading. Restart Obsidian and enable
**Sir Scribbles**. Reopen the sidebar and update any shortcut for its renamed command.

## Use the sidebar

1. On first setup, enter the absolute path to your already installed Kiro executable.
   The path is saved and reused; later chats show **Start Kiro** without asking
   for the path again. Change it under **Settings → Community plugins → Sir Scribbles**
   if the executable moves or startup fails. Settings
   also provides **Validate and save**, which checks the file without running it.
2. Review the displayed vault directory. With a saved executable, sending your
   first prompt starts ACP and sends after initialization succeeds. You can also
   click **Start Kiro** first. Opening the sidebar or typing never starts a process.
   Starting Kiro may initialize its configured hooks and MCP servers.
3. Type a prompt. Select text in a Markdown editor and click **+ Selection**
   to capture only that text, with its relative note path and line range. Inspect,
   replace or remove the snapshot before sending. Changes to the note do not
   change the attachment. A selection-only prompt is supported.
   Alternatively, click **+ File** above the message field to attach only the
   current note's vault-relative path. A checkmark shows it is attached. Kiro can
   read the saved file using its own tools; unsaved edits are not sent. The file path and a selected-text snapshot can be attached together.
   Remove each separately, or click the checked file button to clear the file path.
4. Click **Send** or press Enter. Shift+Enter inserts a newline. Bot replies render
   Markdown; prompts, context previews, and tool activity stay
   plain text. Messages have timestamps and Copy controls that preserve the source.
   Raw HTML and images stay inert; web links open only when clicked.
   Note links (`[[Note|Label]]`, Markdown note paths, and `obsidian://open` links
   to this vault) open through Obsidian when clicked. Headings and block references
   are supported. Cmd/Ctrl+click opens a new tab. Relative paths use the note
   attached or active when the prompt was sent, even if you switch notes later.
5. Review the complete JSON action details before choosing an offered one-time
   Allow or Deny option. Partial requests use earlier details from the same tool
   call; missing arguments are identified in the approval card. Unsupported
   consent semantics still cancel the request.
   Existing Kiro policy may allow actions without asking the sidebar.
6. **Stop** requests cancellation and disables approvals. **Force stop Kiro**
   becomes available after five seconds if the turn is still unsettled.
7. **New chat** confirms discarding content, ends the process, then returns to
   Start. Closing the panel or unloading the plugin discards client content and
   stops the owned process group. Uncertain cleanup stays visible and prevents
   starting another process until recovery succeeds.

On a normal Obsidian quit, the plugin registers an awaited cleanup task: it ends
ACP, sends SIGTERM to its owned process group, and escalates to SIGKILL after two
seconds if needed. The conversation is discarded; reopening creates a fresh
session. Crashes, force quits, and descendants that detach from the process group
cannot be guaranteed to clean up.

Only the executable path is saved in plugin settings. The plugin does not archive
prompts, attachments, transcripts, session IDs or tool details. Kiro/provider
history, inherited environment, hooks, MCP servers and native permissions remain
outside the plugin's control. The vault directory is context, not a sandbox.

## Try the UI without Kiro or Obsidian

```sh
npm run preview
```

Open `http://127.0.0.1:8787`. This development-only fixture uses the actual sidebar
component and provides Start screen, Conversation and Approval examples. It never
launches Kiro and is excluded from the plugin bundle. The preview server is a
developer tool; the plugin contains no networking or listening server.

## Install/authenticate Kiro separately

The [official download page](https://kiro.dev/downloads/) provides this command:

```sh
curl -fsSL https://cli.kiro.dev/install | bash
kiro-cli login
command -v kiro-cli
```

The [authentication guide](https://kiro.dev/docs/getting-started/authentication/)
documents the terminal login flow. The plugin neither installs nor authenticates
Kiro. The downloaded release still needs V3 validation.

## Real compatibility exercise

Use a disposable workspace with no secrets. Kiro retains existing native
permissions and may initialize configured hooks/MCP servers.

```sh
npm run spike -- --kiro /absolute/path/to/kiro-cli --cwd /absolute/test/workspace --check
npm run spike -- --kiro /absolute/path/to/kiro-cli --cwd /absolute/test/workspace
```

The interactive spike accepts single-line prompts and `/choose OPTION_ID`,
`/stop`, `/force` (after the delay), `/quit`. Output is JSON-escaped and intentionally
displayed for inspection; do not redirect private content to a disk log.

Follow [the compatibility procedure](docs/compatibility.md). Initialization and
fixture tests alone do not certify the execution gate. Record the validated CLI
release before any public release.

## Source

- `src/main.js`: Obsidian view, commands, settings and editor identity tracking.
- `src/panel.js`: inert sidebar rendering and controls.
- `src/chat.js`, `src/draft.js`: conversation state, draft/selection snapshots.
- `src/acp.js`, `src/permissions.js`, `src/process.js`: bounded ACP and process lifecycle.
- `tests/`: synthetic protocol, process, controller, DOM and Obsidian API-stub checks.
- [Developer boundaries](docs/development.md), [compatibility](docs/compatibility.md)
  and [security review](security-review.md).
