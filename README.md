# Sir Scribbles

A small ACP (Agent Client Protocol) chat sidebar for your notes. Obsidian on macOS
is the currently supported host. The plugin is intended to work with multiple
ACP agents; Kiro V3 CLI is the currently supported provider, with its launch
arguments and permission handling implemented today. Other ACP providers are
planned and are not yet selectable or validated.

Obsidian hosts the plugin; the ACP agent supplies the conversation and tools.

## Disclosures

- **Runs an external program.** The plugin starts the Kiro CLI executable you
  choose, only when you click **Start agent** or **Open a past chat**, or send
  your first prompt. Each chat tab runs its own Kiro process (up to five at once).
  It never installs, updates or downloads anything.
- **Requires a Kiro account.** Kiro needs its own login; the plugin stores no
  credentials and has no payment features.
- **Network access through Kiro.** The plugin itself makes no network requests.
  Kiro sends your prompts and attached note text to its AI provider.
- **Files outside the vault.** Kiro starts in the vault folder but can read,
  write or run anything its own permissions allow, including outside the vault.
  Actions Kiro asks about appear in the sidebar for approval; actions already
  allowed by Kiro's configuration may run without asking.
- **No telemetry or ads.** The plugin keeps conversations in memory only. Kiro
  keeps its own chat history; **Open a past chat** asks Kiro for it. The only
  saved setting is the executable path, stored on this device.

## Install

Sir Scribbles requires Obsidian 1.5.0 or later on macOS and an already installed
and signed-in Kiro CLI (see [below](#installauthenticate-kiro-separately)).

- **Community plugins:** in Obsidian, open **Settings → Community plugins → Browse**,
  search for **Sir Scribbles**, install it and enable it.
- **Manually:** download `main.js`, `manifest.json` and `styles.css` from the
  [latest release](https://github.com/cabra-arretado/sir-scribbles/releases/latest)
  into `YOUR_VAULT/.obsidian/plugins/sir-scribbles/`, then enable **Sir Scribbles**
  under **Settings → Community plugins**.

Open the sidebar through the ribbon button or the **Sir Scribbles: Open chat** command.

## Use the sidebar

1. On first setup, enter the absolute path to your already installed Kiro executable.
   The path is saved and reused; later chats show **Start agent** without asking
   for the path again. Change it under **Settings → Community plugins → Sir Scribbles**
   if the executable moves or startup fails. Settings
   also provides **Validate and save**, which checks the file without running it.
2. Review the displayed vault directory. With a saved executable, sending your
   first prompt starts ACP and sends after initialization succeeds, using the
   agent's default model. To choose another model, click **Start agent** first and
   pick it from the composer. Until you send, that new chat also lists this vault's
   past chats; choosing one restarts the agent into it and keeps your draft. Opening the sidebar or typing never starts a process.
   Starting Kiro may initialize its configured hooks and MCP servers.
   To continue an earlier conversation, click **Open a past chat**. This starts
   Kiro and lists the chats it has kept for this vault, newest first. Choose one
   to reopen it with its history, or **Start a new chat**. Reopened messages show
   no time, because the agent does not send one. Typing a prompt in the list
   starts a new chat. Agents that cannot list or reopen chats say so here.
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
5. Review the complete JSON action details before choosing an offered option.
   **Allow once** and **Deny once** apply to this request only. When Kiro offers
   **Always allow** or **Always deny**, the card names what the rule covers
   (for example `shell · npm run test`). Choosing it asks Kiro to save that rule
   for this vault only, in Kiro's own workspace settings outside the vault, and
   Kiro stops asking for matching actions in every chat. Kiro reads rules as
   patterns, so a folder rule also covers everything inside it. The plugin never
   widens the rule or saves it for all projects. Always choices are hidden when
   Kiro does not mark the request as persistable, when its workspace is not this
   vault, when the request carries metadata the plugin does not recognize, or
   when the resource contains pattern characters (`* ? [ ] { } \`), which would
   make the saved rule wider than the request. To edit or
   remove a saved rule, change Kiro's workspace `permissions.yaml` (under
   `~/.kiro/workspace-roots/`). Partial requests use earlier details from the same tool
   call; missing arguments are identified in the approval card. Unsupported
   consent semantics still cancel the request.
   Existing Kiro policy may allow actions without asking the sidebar.
6. **Stop** requests cancellation and disables approvals. **Force stop agent**
   becomes available after five seconds if the turn is still unsettled.
7. Chats open in tabs at the top of the sidebar. **+** opens another chat, up to
   five; each has its own Kiro process, model, approvals and status dot, and keeps
   running while you look at another tab. Closing a tab confirms discarding its
   content, ends its process and keeps Kiro's own history, so it can be reopened
   later. Closing the panel or unloading the plugin discards client content and
   stops every owned process group. A tab whose cleanup is uncertain stays open
   with **Force stop agent** until recovery succeeds.

On a normal Obsidian quit, the plugin registers an awaited cleanup task: it ends
ACP, sends SIGTERM to its owned process group, and escalates to SIGKILL after two
seconds if needed. Each conversation is discarded from the sidebar; reopening
the sidebar starts with one fresh tab. Crashes, force quits, and descendants that detach from the process group
cannot be guaranteed to clean up.

Only the executable path is saved, in this device's local storage. The plugin does not archive
prompts, attachments, transcripts, session IDs or tool details. Past chats come
from the agent each time you open the list. Kiro/provider
history, inherited environment, hooks, MCP servers and native permissions remain
outside the plugin's control. The vault directory is context, not a sandbox.

## Install/authenticate Kiro separately

The [official download page](https://kiro.dev/downloads/) provides this command:

```sh
curl -fsSL https://cli.kiro.dev/install | bash
kiro-cli login
command -v kiro-cli
```

The [authentication guide](https://kiro.dev/docs/getting-started/authentication/)
documents the terminal login flow. The plugin neither installs nor authenticates
Kiro.

## Development

Requires Node.js 22+. Runtime uses Node/Electron built-ins, Obsidian's supplied
API, and the pinned markdown-it parser bundled into `main.js`. Build and test
dependencies are pinned.

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run build
```

The build writes `main.js` to the repository root, beside `manifest.json` and
`styles.css`, and copies all three files into `dist/sir-scribbles/`. `main.js`
is not committed; releases attach it. To release, bump the version in
`manifest.json`, `package.json` and `versions.json`, then push a tag equal to
that version (for example `0.0.2`, no `v`). The workflow builds a draft release
to review and publish.
