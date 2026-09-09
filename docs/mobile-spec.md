# Mobile spec

This is a contract, not documentation. `/ios` and `/android` are buildable
overnight from this file, with no design decisions left open, and that works
only if the file is maintained as the web app is built.

**Every screen or feature added to web gets an entry here in the same commit.**
`node scripts/mobile-spec-check.mjs` fails the gate when a route exists under
`web/app/(app)/` with no entry.

## How to read an entry

Every entry has the same eleven fields. A field that genuinely does not apply
says `n/a` and why. A field that has not been decided is a bug in this file.

- **Web route.** The path under `web/app/(app)/`.
- **Deep link.** `recall://` scheme plus path. Universal links map the same
  paths off the web origin.
- **Data contract.** The exact RPC or table, and the generated type name from
  `web/lib/database.types.ts`.
- **Loading, empty, error, content.** What each state shows. All four are
  designed, none is defaulted.
- **Navigation.** Position and tab order, stated explicitly.
- **Components.** What web uses and the intended native equivalent.
- **String keys.** From the shared catalog. No hardcoded copy on any platform.
- **Permissions.** What is requested and the user-facing reason string.
- **Offline and refresh.** What survives a cold start with no network, and what
  a pull-to-refresh does.
- **Analytics.** The events emitted.

## Tab order

Fixed across all three platforms. Changing it is a change to this section
first, then three clients in the same task.

1. Chat
2. Spaces
3. Documents
4. Connections
5. Dreams
6. Admin, only when `org_members.role` is `owner` or `admin`

Settings is not a tab. It is reachable from the header on web and from the
profile row on native.

## String catalog

`web/lib/strings/` on web, `Localizable.xcstrings` on iOS, `strings.xml` on
Android. Keys are dot-separated and namespaced by screen: `chat.empty.title`,
`documents.ingest.timeout`. A key added on any platform is added to all three
in the same commit.

## Entries

### Chat

- **Screen name.** Chat
- **Web route.** `/chat`
- **Deep link.** `recall://chat`
- **Data contract.** `conversations` filtered to `user_id = auth.uid()`, type
  `Database['public']['Tables']['conversations']['Row']`. History paginates
  through the `infinite-query-hook` block on web; native pages with a cursor on
  `created_at`.
- **Loading.** Three skeleton rows in the history list, composer disabled.
- **Empty.** The primary screen for a new user. Title, one sentence on what
  Recall does, and two actions: upload a document, connect a source. It does
  not apologize for being empty.
- **Error.** The error text from the failed query, plus a retry.
- **Content.** The composer, the space filter, and the conversation list.
- **Navigation.** Tab 1. Root of its own stack.
- **Components.** Web uses `components/chat/*` over the Library
  `realtime-chat-nextjs` block, adapted for assistant turns. iOS is a
  `List` in a `NavigationStack`. Android is a `LazyColumn` in a `Scaffold`.
- **String keys.** `chat.empty.title`, `chat.empty.body`, `chat.empty.upload`,
  `chat.empty.connect`, `chat.composer.placeholder`, `chat.filter.allSpaces`.
- **Permissions.** None.
- **Offline and refresh.** Conversation list is cached and readable offline.
  The composer is disabled with an offline notice. Pull-to-refresh refetches
  the list.
- **Analytics.** `chat_opened`, `conversation_created`.

### Chat conversation

This is the one screen where the native implementation cannot mirror the web
one line for line, so the transport is spelled out.

- **Screen name.** Conversation
- **Web route.** `/chat/[id]`
- **Deep link.** `recall://chat/{conversationId}`
- **Data contract.** `messages` for the conversation, type
  `Database['public']['Tables']['messages']['Row']`. Citations are chunk ids in
  `messages.citations` and are resolved on read through
  `chunks` under RLS, never stored as text.
- **Transport.** `POST /api/chat`, body `{ conversationId, message }` where the
  message is trimmed and between 1 and 4000 characters. There is no space filter
  in the request: scope comes from `conversations.space_filter` on the row, which
  is why no client lets a reader change scope mid-conversation.

  The response is `200` with `Content-Type: application/x-ndjson; charset=utf-8`,
  `Cache-Control: no-store` and `X-Accel-Buffering: no`. The body is one JSON
  object per line, each terminated by a newline. Five event types, discriminated
  on `type`, defined in `web/lib/chat/protocol.ts`:

  ```
  { "type": "citations", "citations": Citation[] }
  { "type": "delta",     "text": string }
  { "type": "done",      "messageId": uuid }
  { "type": "title",     "title": string }
  { "type": "error",     "message": string }

  Citation = { chunkId, documentId, documentTitle, excerpt, label }
  ```

  Ordering a client may rely on:

  1. `citations` exactly once, always before any answer text. The array may be
     empty, meaning retrieval found nothing and the answer will say so. Sources
     are on screen before the first token.
  2. `delta` zero or more times. Concatenate in arrival order.
  3. `done` exactly once, carrying the stored `messages.id`.
  4. `title` at most once, only for a conversation that had none, always after
     `done`. Naming a conversation never delays an answer.
  5. `error` is terminal and can replace any of the above from that point. What
     was already delivered stays valid and nothing follows it.

  **Two obligations on every client.** Buffer the trailing fragment: an event can
  be split across two network reads, so split on the newline, keep the remainder,
  and prepend it to the next read. And drop a line that does not parse rather
  than treating it as an error, so adding an event type later does not break an
  older build.

  Failures before the stream opens are a JSON body `{ code, message }` with a
  status, never an event: `unauthorized` 401, `invalid_request` 400, `not_found`
  404, `rate_limited` 429 with a `Retry-After` header in seconds, `server_error` 500. A client has exactly two failure shapes to handle: a JSON body with a
  status, or an `error` event inside a 200.

  iOS uses `URLSession.shared.bytes(for:)` and splits on newlines. Android uses
  OkHttp with a `ResponseBody.source()` read loop. Both must keep the persisted
  user message and reload after a mid-stream disconnect, because the question is
  written before the model call and the answer after it completes. A dropped
  connection leaves the question stored and no answer at all, never a partial
  one.

- **Loading.** The user turn appears immediately. The assistant turn shows a
  caret until the first token arrives.
- **Empty.** Not reachable. A conversation always has at least one message.
- **Error.** A failed stream leaves the user message in place and shows a retry
  on the assistant turn. It never leaves a half-written assistant message.
- **Content.** The turn list, inline citation references that open
  `/documents/{id}` anchored at the chunk, and the composer.
- **Navigation.** Pushed from Chat. Back returns to the list.
- **Components.** Web: `components/chat/message-list.tsx`,
  `components/chat/assistant-turn.tsx`. iOS: `ScrollViewReader` over a
  `LazyVStack`. Android: `LazyColumn` with `rememberLazyListState`.
- **String keys.** `chat.turn.thinking`, `chat.turn.retry`,
  `chat.citation.unavailable`.
- **Permissions.** None.
- **Offline and refresh.** Past turns are cached. Sending requires a network.
- **Analytics.** `question_asked`, `citation_opened`, `stream_failed`.

### Spaces

- **Screen name.** Spaces
- **Web route.** `/spaces`
- **Deep link.** `recall://spaces`
- **Data contract.** `spaces` with `space_members(count)` and
  `documents(count)`, type `Database['public']['Tables']['spaces']['Row']`.
  Ordering is personal, then org, then teams alphabetically, from
  `web/lib/spaces/spaces.ts`. Native reimplements the same ordering and has an
  ordered-tab contract test for it.
- **Loading.** Skeleton list of three rows.
- **Empty.** Not normally reachable: the signup trigger creates a personal and
  an org space. If it is, the copy says to sign out and back in.
- **Error.** Query error text plus retry.
- **Content.** The create-team-space form, then the space list.
- **Navigation.** Tab 2.
- **Components.** Web `components/spaces/space-list.tsx`. iOS `List` with
  `Section`. Android `LazyColumn`.
- **String keys.** `spaces.title`, `spaces.body`, `spaces.create.label`,
  `spaces.kind.personal`, `spaces.kind.team`, `spaces.kind.org`.
- **Permissions.** None.
- **Offline and refresh.** Cached and readable. Creating requires a network.
- **Analytics.** `space_created`.

### Space detail

- **Screen name.** Space
- **Web route.** `/spaces/[id]`
- **Deep link.** `recall://spaces/{spaceId}`
- **Data contract.** `spaces` by id, `space_members` for the space, and a head
  count on `documents`. Types
  `Database['public']['Tables']['spaces']['Row']` and
  `Database['public']['Tables']['space_members']['Row']`.
- **Loading.** Header skeleton plus a member list skeleton.
- **Empty.** A team space with one member says so plainly and offers to add
  someone.
- **Error.** A space the caller cannot see returns not found, deliberately.
  "Not found" and "not allowed" are the same answer.
- **Content.** Name, who can see it, the dreaming switch, and the member list.
- **Navigation.** Pushed from Spaces.
- **Components.** Web `components/spaces/dreaming-toggle.tsx` and
  `space-members.tsx`. iOS `Form` with a `Toggle`. Android
  `Column` with a `Switch`.
- **String keys.** `space.dreaming.title`, `space.dreaming.body`,
  `space.members.count`, `space.personal.note`, `space.org.note`.
- **Permissions.** None.
- **Offline and refresh.** Cached. The dreaming switch is disabled offline.
- **Analytics.** `dreaming_toggled`.

### Documents

- **Screen name.** Documents
- **Web route.** `/documents`
- **Deep link.** `recall://documents`
- **Data contract.** `documents` joined to `spaces(name)` and
  `ingest_jobs(status, stage, error)`, type
  `Database['public']['Tables']['documents']['Row']`. Ingest status text comes
  from `describeIngest` in `web/lib/documents/documents.ts` and native
  reimplements the same five cases.
- **Loading.** Upload panel skeleton plus a list skeleton.
- **Empty.** The other screen most new users see first. It names the two ways
  content arrives: upload a file, or connect a source.
- **Error.** Query error text plus retry.
- **Content.** The space selector and the file picker together, then the list.
  The two are on one screen because choosing the space is the permission
  decision.
- **Navigation.** Tab 3.
- **Components.** Web uses the Library `dropzone-nextjs` block. iOS uses
  `.fileImporter` plus `PHPickerViewController` where images apply. Android
  uses the Storage Access Framework `ACTION_OPEN_DOCUMENT`.
- **String keys.** `documents.title`, `documents.body`, `documents.empty.title`,
  `documents.empty.body`, `documents.space.label`, `documents.ingest.queued`,
  `documents.ingest.running`, `documents.ingest.failed`,
  `documents.ingest.timeout`.
- **Permissions.** iOS: none for `.fileImporter`. Photo library access, only if
  image upload ships, reason string "Recall needs access to add a photo to your
  knowledge base." Android: none on API 33 and above for SAF.
- **Offline and refresh.** The list is cached. An upload started offline is
  refused with a clear message rather than queued, because the storage upload
  and the job row have to land together.
- **Analytics.** `document_uploaded`, `ingest_failed`, `ingest_timeout`.

### Document detail

- **Screen name.** Document
- **Web route.** `/documents/[id]`
- **Deep link.** `recall://documents/{documentId}`, with an optional
  `?chunk={chunkId}` fragment that a citation opens directly.
- **Data contract.** `documents` by id, `chunks` for the document ordered by
  `ordinal`, and the latest `ingest_jobs` row. Types
  `Database['public']['Tables']['documents']['Row']` and
  `Database['public']['Tables']['chunks']['Row']`.
- **Loading.** Header skeleton plus three paragraph skeletons.
- **Empty.** A document whose ingest has not finished shows the stage rather
  than an empty body.
- **Error.** Not found for a document in a space the caller cannot see.
- **Content.** Title, origin, the link to the original, and the chunk text with
  the cited chunk highlighted.
- **Navigation.** Pushed from Documents or from a citation in Chat.
- **Components.** Web is plain prose. iOS `ScrollViewReader` scrolls to the
  cited chunk. Android `LazyColumn` with `scrollToItem`.
- **String keys.** `document.origin.upload`, `document.origin.sync`,
  `document.origin.dream`, `document.original.open`.
- **Permissions.** None.
- **Offline and refresh.** Chunk text is cached once read.
- **Analytics.** `document_opened`.

### Connections

- **Screen name.** Connections
- **Web route.** `/connections`
- **Deep link.** `recall://connections`
- **Data contract.** `providers` for the registry and `connections` for what is
  already linked, types
  `Database['public']['Tables']['providers']['Row']` and
  `Database['public']['Tables']['connections']['Row']`. The page renders from
  the `providers` table, so a new provider is a seed row and never a client
  change on any platform.
- **Loading.** Provider list skeleton.
- **Empty.** No connections yet, with the four providers listed and one action
  each.
- **Error.** A `revoked` or `expired` connection shows `status_detail` and a
  reconnect action. It never shows a spinner that does not resolve.
- **Content.** Provider rows with status, last sync, and the reconnect or
  disconnect action.
- **Navigation.** Tab 4.
- **Components.** Web `components/connections/*`. iOS `List` with
  `ASWebAuthenticationSession` for the OAuth leg. Android `LazyColumn` with
  Chrome Custom Tabs.
- **String keys.** `connections.title`, `connections.status.active`,
  `connections.status.syncing`, `connections.status.error`,
  `connections.status.revoked`, `connections.status.expired`,
  `connections.reconnect`, `connections.disconnect`, `connections.resync`.
- **Permissions.** None. The OAuth leg opens a system browser, never an
  embedded webview, because an embedded webview cannot be trusted with a
  provider password.
- **Offline and refresh.** Status is cached. Connecting requires a network.
  Pull-to-refresh refetches status without triggering a sync.
- **Analytics.** `connection_started`, `connection_claimed`,
  `connection_failed`, `resync_requested`.

### Connect a provider

- **Screen name.** Connect
- **Web route.** `/connections/[provider]`
- **Deep link.** `recall://connections/{providerSlug}`
- **Data contract.** `providers` by slug, plus `connections.scope_selection`
  once the connection exists. `providers.scope_selection_kind` says whether the
  picker lists channels, folders, or a whole workspace.
- **Loading.** Skeleton for the space selector and the scope list.
- **Empty.** A provider with no selectable scopes says the whole account will
  be read.
- **Error.** OAuth failure text from `connections.status_detail`.
- **Content.** The space selector and the scope picker on one screen, because
  the connection is bound to one space.
- **Navigation.** Pushed from Connections.
- **Components.** Web `components/connections/scope-picker.tsx`. iOS a `Form`
  with a multi-select `List`. Android a `LazyColumn` of checkboxes.
- **String keys.** `connect.space.label`, `connect.scope.channels`,
  `connect.scope.folders`, `connect.scope.workspace`, `connect.begin`.
- **Permissions.** None.
- **Offline and refresh.** Not usable offline.
- **Analytics.** `scope_selected`.

### Dreams

- **Screen name.** Dreams
- **Web route.** `/dreams`
- **Deep link.** `recall://dreams`
- **Data contract.** `dream_runs` for the visible spaces, type
  `Database['public']['Tables']['dream_runs']['Row']`.
- **Loading.** Run list skeleton.
- **Empty.** Defines dreaming in one sentence, then offers to run one now. This
  is the first place many users meet the word, so the definition is required
  copy and not optional.
- **Error.** A `failed` or `timeout` run shows `dream_runs.error` and the stage.
- **Content.** Runs with kind, status, document count, and output.
- **Navigation.** Tab 5.
- **Components.** Web `components/dreams/*`. iOS `List`. Android `LazyColumn`.
- **String keys.** `dreams.definition`, `dreams.empty.title`,
  `dreams.run.entities`, `dreams.run.digest`, `dreams.run.connections`,
  `dreams.status.timeout`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Triggering a run requires a network.
- **Analytics.** `dream_triggered`, `dream_opened`.

### Entities

- **Screen name.** Entities
- **Web route.** `/dreams/entities`
- **Deep link.** `recall://dreams/entities`, with an optional `?space={spaceId}`
  filter that mirrors the web query parameter.
- **Data contract.** `entities` joined to `entity_mentions` and `documents`,
  grouped by `entity_kind`. Types
  `Database['public']['Tables']['entities']['Row']` and
  `Database['public']['Tables']['entity_mentions']['Row']`. Loaded through
  `loadEntities` in `web/lib/dreams/queries.ts`.
- **Loading.** Four group skeletons, one per entity kind, holding their heights
  so the page does not jump when they resolve.
- **Empty.** The common case before the first entities run. It says what an
  entities run does and offers the two ways to get one: trigger it from Runs, or
  wait for tonight.
- **Error.** Query error text plus retry.
- **Content.** People, projects, customers and decisions, each with the
  documents it was mentioned in. Tapping a mention opens the document at the
  cited chunk.
- **Navigation.** Subtab under Dreams, second after Runs. Subtabs sit outside
  cards and the strip stays put through every content state.
- **Components.** Web `components/dreams/entity-groups.tsx`. iOS `List` with a
  `Section` per kind. Android `LazyColumn` with sticky headers.
- **String keys.** `entities.empty.title`, `entities.empty.body`,
  `entities.kind.person`, `entities.kind.project`, `entities.kind.customer`,
  `entities.kind.decision`, `entities.mentions.count`.
- **Permissions.** None.
- **Offline and refresh.** Cached and readable offline. Pull-to-refresh refetches.
- **Analytics.** `entities_opened`, `entity_mention_opened`.

### Dream run

- **Screen name.** Dream run
- **Web route.** `/dreams/[id]`
- **Deep link.** `recall://dreams/{runId}`
- **Data contract.** `dream_runs` by id, `dream_links` for the run, and
  `documents` for the output. Types
  `Database['public']['Tables']['dream_runs']['Row']` and
  `Database['public']['Tables']['dream_links']['Row']`.
- **Loading.** Header skeleton plus a candidate list skeleton.
- **Empty.** A run that produced nothing says so, rather than showing an empty
  output document.
- **Error.** The run error and the stage it reached.
- **Content.** What ran, over how many documents, what came out, and for the
  `connections` kind, the candidate document pairs with their rationale, each
  confirmable or dismissable.
- **Navigation.** Pushed from Dreams.
- **Components.** Web `components/dreams/run-detail.tsx`. iOS `Form`. Android
  `Column`.
- **String keys.** `dream.output.none`, `dream.link.confirm`,
  `dream.link.dismiss`, `dream.delete.warning`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Confirming a link requires a network.
- **Analytics.** `dream_link_confirmed`, `dream_link_dismissed`,
  `dream_output_deleted`.

### Admin

- **Screen name.** Admin
- **Web route.** `/admin`
- **Deep link.** `recall://admin`
- **Data contract.** `usage_events`, `model_calls`, `messages`, `connections`,
  `ingest_jobs` and `documents.last_retrieved_at`. Access is
  `org_members.role in ('owner','admin')` and it is enforced in RLS, so a
  non-admin gets zero rows rather than a hidden tab. Native still hides the tab,
  as a courtesy and not as the control.
- **Loading.** Chart skeletons that hold their final height, so the page does
  not jump.
- **Empty.** An organization with no traffic yet says which number will appear
  first.
- **Error.** Query error text plus retry.
- **Content.** Ingest health, search volume and latency, top questions, dead
  content, usage against plan.
- **Navigation.** Tab 6, present only for owners and admins.
- **Components.** Web `components/admin/*` and `components/charts/*` following
  the `dataviz` rules. iOS Swift Charts. Android Vico.
- **String keys.** `admin.ingest.title`, `admin.latency.title`,
  `admin.questions.title`, `admin.dead.title`, `admin.usage.title`.
- **Permissions.** None.
- **Offline and refresh.** Last fetched values are cached with their timestamp
  shown, so a stale number is never presented as live.
- **Analytics.** `admin_opened`.

### Admin members

- **Screen name.** Members
- **Web route.** `/admin/members`
- **Deep link.** `recall://admin/members`
- **Data contract.** `org_members` and `org_invites`, types
  `Database['public']['Tables']['org_members']['Row']` and
  `Database['public']['Tables']['org_invites']['Row']`.
- **Loading.** List skeleton.
- **Empty.** A one-person organization offers to invite someone.
- **Error.** Query error text plus retry.
- **Content.** Members with roles, pending invites, invite and remove.
- **Navigation.** Subtab under Admin. Subtabs sit outside cards.
- **Components.** Web table. iOS `List`. Android `LazyColumn`.
- **String keys.** `members.invite.label`, `members.role.owner`,
  `members.role.admin`, `members.role.member`, `members.remove.confirm`.
- **Permissions.** None.
- **Offline and refresh.** Cached. Inviting requires a network.
- **Analytics.** `member_invited`, `member_removed`.

### Admin billing

- **Screen name.** Billing
- **Web route.** `/admin/billing`
- **Deep link.** `recall://admin/billing`
- **Data contract.** `organizations.plan`, `stripe_customer_id`,
  `stripe_subscription_id`, `seats`, type
  `Database['public']['Tables']['organizations']['Row']`.
- **Loading.** Plan card skeleton.
- **Empty.** Not reachable. Every organization has a plan.
- **Error.** A Stripe failure shows the message from the checkout session
  creation, not a generic one.
- **Content.** A plan card and a button. Nothing else. Stripe Checkout for
  signup, the Customer Portal for everything after.
- **Navigation.** Subtab under Admin.
- **Components.** Web plan card. iOS and Android open the Checkout or Portal
  URL in a system browser. **Neither native client implements in-app purchase.**
  The Team plan is a business-to-business subscription sold on the web.
- **String keys.** `billing.plan.free`, `billing.plan.team`,
  `billing.plan.enterprise`, `billing.portal.open`, `billing.upgrade`.
- **Permissions.** None.
- **Offline and refresh.** The plan is cached. Both buttons need a network.
- **Analytics.** `checkout_started`, `portal_opened`.

### Settings

- **Screen name.** Settings
- **Web route.** `/settings`
- **Deep link.** `recall://settings`
- **Data contract.** `auth.users` through `supabase.auth.getUser()`, plus the
  personal space from `spaces` where `kind = 'personal'`.
- **Loading.** Form skeleton.
- **Empty.** Not reachable.
- **Error.** The auth error text.
- **Content.** Profile, the personal space, theme, and sign out.
- **Navigation.** Not a tab. Header on web, profile row on native.
- **Components.** Web form. iOS `Form`. Android `PreferenceScreen`.
- **String keys.** `settings.theme.system`, `settings.theme.light`,
  `settings.theme.dark`, `settings.signOut`, `settings.signOutAll`.
- **Permissions.** None.
- **Offline and refresh.** Readable offline. Changes need a network.
- **Analytics.** `theme_changed`, `signed_out`.

## Parity rules

Three rules, taken from mistakes that have already cost time.

**Functional parity does not prove visual parity.** Before shipping a native
surface, compare it with two adjacent screens in the simulator. A screen that
passes its own test and looks nothing like the one before it is still wrong.

**When web adds or reorders a subtab, audit iOS and Android in the same task.**
Keep an ordered-tab contract test per platform, asserting the order in the
"Tab order" section above.

**A web bug is a cross-platform defect class.** Map the root cause, the date and
timezone semantics, and the validation boundary onto both native clients before
closing it.

## Native builds stay out of hosted triggers

macOS runners, emulators and release packaging go behind `workflow_dispatch`
only. `.github/workflows/native.yml` is dispatch-only and
`scripts/workflow-contract-check.mjs` fails the gate if that changes.
