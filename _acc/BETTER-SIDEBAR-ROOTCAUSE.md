# better-sidebar `turnTail` interception error — root cause

## Reported symptom

```
[dsh-better-sidebar] interception error: list slot "conversation.chat.turnTail" requires options.id
```

## Where the message is actually thrown

`@deepseek-ai/dsh-client-ui-slots@0.1.7-rc.2` `lib/index.js:182`:

```js
case "list": {
  if (options.id === void 0) throw new Error(`list slot "${options.name}" requires options.id`);
  const occupant = rec.entries.find((e) => e.options.id === options.id && (e.options.priority ?? 0) === priority);
  if (occupant) throw new Error(`list slot "${options.name}" already has an entry with id "${options.id}" ${occupantHint(occupant)}`);
  break;
}
case "chain":
  if (options.select === void 0) throw new Error(`chain slot "${options.name}" requires options.select`);
  break;
```

So the message is emitted when a **`kind: "list"`** slot is registered without `options.id`.
Note the sibling branch: a `chain` slot would instead demand `options.select`.

## What kind `conversation.chat.turnTail` actually is

`packages/client/ui-chat/lib/client.js:3449-3457` — the parent row declares its children table:

```js
{
  key: "turn-tail",
  locale: NS,
  children: {
    "conversation.chat.turnTail":        { kind: "chain", scope: "session" },
    "conversation.chat.assistant-actions": { kind: "list",  scope: "session" }
  }
}
```

`conversation.chat.turnTail` is **`chain`**, not `list`. Its sibling
`conversation.chat.assistant-actions` is the `list` one.

**The thrown message therefore does not match the slot it names.** That mismatch is the
tell that the two sides disagree about the slot's kind, which is a *version skew*, not a
misconfiguration on our side.

## The actual defect — an upstream code bug in `dsh-better-sidebar@0.19.1`

`vendor/better-sidebar/lib/client.js:3477-3505`:

```js
/**
 * Register the turn-tail interception (returns the disposer).
 *
 * The slot is a CHILD slot the host's ui-conversation declares in its
 * `conversation.chat.node` children table (kind: chain, scope: session).
 * ...
 * This mirrors @deepseek-ai/dsh-client-ui-deliverables' registration of the same slot.
 */
function registerTurnTailInterception(ctx, store) {
  return ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
    name: "conversation.chat.turnTail",
    select: (owner) => { ... },          // <- chain-shaped: has `select`
    priority: -1,
    registrant: "dsh-better-sidebar"
  }, SidebarProducedFiles));             // <- and NO `id`
}
```

The row is **chain-shaped** (`select`) but carries **no `id`**. Meanwhile the current
official occupant of the same slot is **list-shaped** and *does* carry an `id`:

`@deepseek-ai/dsh-client-ui-deliverables@0.1.7-rc.2` `lib/client.js:2265-2272`

```js
ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
  name: "conversation.chat.turnTail",
  id: "@deepseek-ai/dsh-client-ui-deliverables",   // <- id present
  locale: NS,
  children: { "deliverables.file.actions": { kind: "list", scope: "session" } },
  inject: () => ({ hooks: { ... } })
}, ProducedFiles));
```

Compare the **same file in our source tree** (`packages/client/ui-deliverables/lib/client.js:440-449`),
which is the shape better-sidebar's comment says it mirrors:

```js
ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
  name: "conversation.chat.turnTail",
  select: selectProducedFiles,        // chain-shaped, no id — the OLD contract
  locale: NS,
  inject: () => ({ ... })
}, ProducedFiles));
```

Between the source tree and `0.1.7-rc.2`, `conversation.chat.turnTail` **changed contract**:
`chain`-with-`select` became `list`-with-`id`. `dsh-better-sidebar@0.19.1` was written against
the old one. Its comment citing "mirrors ui-deliverables" was true when written and is now stale.

## Conclusion

1. The error is caused by a **third-party plugin built against a pre-`0.1.7` slot contract**.
   Our bundle neither introduces nor can configure it away — the shape of the row is wrong.
2. The user's instruction — drop better-sidebar and use the official sidebar — is the correct
   fix, and `0.1.7-rc.2`'s own `dsh-web-app` agrees: it has **removed better-sidebar entirely**
   (`grep -nE "better-sidebar|remote-host" cordis.patch.yml` → 0 hits) in favour of the
   official `ui-sidebar` family.
3. The error is **non-fatal but not harmless**: the interception throw happens inside a slot
   registration, so the editor/ephemeral-file interception that better-sidebar was providing
   never installs. The panel it feeds is the one `ui-remote-host` was written against, so the
   two are coupled — which is why removing better-sidebar *requires* migrating
   `ui-remote-host` to the official contract in the same change.

## The official contract to migrate onto (verified from `0.1.7-rc.2` tarballs)

`@deepseek-ai/dsh-client-ui-sidebar-right@0.1.7-rc.2` provides two services
(`lib/client.js:324442-324443`):

```js
const disposeRegistry = ctx.reflect.provide("sidebarRightTabs", tabs);
const disposeService  = ctx.reflect.provide("sidebarRight", controller);
```

and declares these seats (children of `rightbar.session`, `:327059-327075`):

| seat | kind | scope |
| --- | --- | --- |
| `sidebar.right.pane.tab` | `keyed` | session |
| `sidebar.right.pane.tab.title` | `keyed` | session |

Canonical consumer, `@deepseek-ai/dsh-client-ui-sidebar-files@0.1.7-rc.2`:

```js
const FILES_KIND = "files";
const FILES_ID = "@deepseek-ai/dsh-client-ui-sidebar-files";
const inject = ["slots","locale","sidebarRightTabs","sidebarRight","remote","remote.workspaceFiles"];

function filesDefinition(t) {
  return {
    id: FILES_ID,
    kind: FILES_KIND,
    priority: "builtin",
    title: () => t("type.label"),
    guide: [{ id: "workspace", commandId: "workspace.files", order: 10,
              title: () => t("guide.title"), description: () => t("guide.description"),
              icon: GuideArtworkFiles }]
  };
}

ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), "…: type");
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
  name: "sidebar.right.pane.tab", key: FILES_ID, locale: NS, store, inject
}, FilesBody)), "…: tab body");
ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
  name: "sidebar.right.pane.tab.title", key: FILES_ID
}, FilesTitle)), "…: tab title");
```

Tab-type registry rules (`sidebar-right/lib/client.js:311420-311438`):

```js
register(definition) {
  const { id, kind } = definition;
  const entries = definition.guide ?? [];
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error(`sidebarRight: duplicate guide entry id in "${id}"`);
  const band = definition.priority ?? DEFAULT_BAND;             // DEFAULT_BAND = "extension"
  if (this.ids.has(id)) throw new Error(`sidebarRight: tab type id "${id}" is already registered`);
  const held = this.kinds.get(kind);
  if (held !== void 0 && !coexists(held, band)) throw new Error(`sidebarRight: tab kind "${kind}" is already registered (${held.inForce.band})`);
  ...
}
// coexists: an `extension` and a `builtin` pair up once; `fallback` shares with nothing.
function coexists(slot, band) {
  return band !== "fallback" && slot.inForce.band !== "fallback" && slot.inForce.band !== band && slot.shadowed === void 0;
}
```

Consequences for our definition:

- `id` must be unique across the whole registry, in the **reverse-DNS package-name style**
  the official plugins use → `@deepseek-ai/dsh-client-ui-remote-host`.
- `kind` must not collide with an existing one unless the bands differ **and** neither is
  `fallback`. `files` is already taken at `builtin`. Our own kind `remote-hosts` is unclaimed,
  so `priority: "builtin"` is safe.
- `guide` entries need distinct ids if supplied; the config action is what opens the panel, so
  the `commandId` there must match the shortcut we register.
