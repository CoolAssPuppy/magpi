# Finish the dev setup

Everything the code cannot do for itself: the accounts, the keys, and the
badge. Work through it in order. Each section ends with a line telling you what
you should see when it worked, so you never have to guess whether to move on.

This is written to be followed at the end of a long day. Every console path is
written out, every value is named exactly, and nothing is left as "configure
the usual settings".

## What you need before you start

| Thing                           | Why                                        |
| ------------------------------- | ------------------------------------------ |
| A Supabase project              | The database, auth, and the gateway        |
| A Google Cloud project          | Calendar and Gmail                         |
| A Vercel account                | Hosting, and the deploy state page         |
| A PostHog account               | The one number page, and product analytics |
| A Doppler account               | Every secret, in one place                 |
| A Pimoroni Tufty 2350           | The badge                                  |
| A USB-C cable that carries data | Not a charge-only cable                    |

Values already filled in for this repo:

| Value                    | Yours                                      |
| ------------------------ | ------------------------------------------ |
| Supabase project ref     | `bxsgodfrrllijpmimsgs`                     |
| Supabase URL             | `https://bxsgodfrrllijpmimsgs.supabase.co` |
| Doppler project / config | `magpi` / `dev`                            |
| Local Supabase API       | `http://127.0.0.1:56521`                   |
| Local Supabase Studio    | `http://127.0.0.1:56523`                   |

**One thing to fix first.** The git remote points at
`git@github.com:CoolAssPuppy/pimorini.git`, but the product is called Magpi and
the links in the footer point at `CoolAssPuppy/magpi`. Rename the repository on
GitHub, then:

```
git remote set-url origin git@github.com:CoolAssPuppy/magpi.git
```

You will know this worked when `git remote -v` prints `magpi.git` and
`git push` succeeds.

---

## 1. Google Cloud, for Calendar and Gmail

Three of the five pages need this, so do it first.

### 1.1 Choose the project

1. Open <https://console.cloud.google.com/projectselector2/home/dashboard>.
2. Click the project dropdown in the top bar, then **New project**.
3. Name it `magpi`. Leave the organisation as it is. Click **Create**.
4. Wait for the notification, then click **Select project**.

### 1.2 Enable the two APIs

An API you have not enabled returns 403 with a message about the API being
disabled, which reads like a permissions problem and is not one.

1. Go to **APIs & Services → Library**, or
   <https://console.cloud.google.com/apis/library>.
2. Search `Google Calendar API`. Click it. Click **Enable**.
3. Go back to the Library. Search `Gmail API`. Click it. Click **Enable**.

You will know this worked when
<https://console.cloud.google.com/apis/dashboard> lists both **Google Calendar
API** and **Gmail API** under "Enabled APIs and services".

### 1.3 The OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**, or
   <https://console.cloud.google.com/apis/credentials/consent>.
2. Choose **External**. Click **Create**.
3. Fill in:
   - App name: `Magpi`
   - User support email: your address
   - App logo: upload `design/oauth-logo-120.png` from this repo
   - Developer contact information: your address
4. Click **Save and continue**.
5. On the **Scopes** step, click **Add or remove scopes**. Paste each of these
   into the filter box and tick it:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.metadata`
6. Click **Update**, then **Save and continue**.
7. On the **Test users** step, click **Add users** and add your own Google
   address. Click **Save and continue**.

**Why the test user matters.** Both scopes above are restricted, and an app in
production with restricted scopes needs Google's verification review, which
takes weeks and asks for a privacy policy and a demo video. An app left in
**Testing** with you as a test user skips all of it. That is the right state
for a badge on your own desk. The cost is that the refresh token expires every
seven days, so you reconnect Google about once a week. The connections page
tells you when that happens.

**Why `gmail.metadata` and not `gmail.readonly`.** Metadata permits
`messages.list` and `messages.get` with `format=metadata`, which returns
headers including the subject. That covers a count and one subject line. It
does not grant access to message bodies, and this product has no reason to read
one.

You will know this worked when the consent screen summary shows **Publishing
status: Testing**, **User type: External**, and exactly two scopes.

### 1.4 The OAuth client

1. Go to **APIs & Services → Credentials**, or
   <https://console.cloud.google.com/apis/credentials>.
2. Click **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Magpi gateway`.
5. Under **Authorized redirect URIs**, click **Add URI** and paste this
   exactly, with no trailing slash:

   ```
   https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1/connections-callback
   ```

6. Click **Add URI** again and add the local one, for development:

   ```
   http://127.0.0.1:56521/functions/v1/connections-callback
   ```

7. Click **Create**. A dialog shows the client ID and client secret. Leave it
   open; the next step needs both.

Store them in Doppler:

```
doppler secrets set OAUTH_GOOGLE_CLIENT_ID="<the client id>" --project magpi --config dev
doppler secrets set OAUTH_GOOGLE_CLIENT_SECRET="<the client secret>" --project magpi --config dev
```

You will know this worked when
`doppler secrets get OAUTH_GOOGLE_CLIENT_ID --project magpi --config dev --plain`
prints an id ending in `.apps.googleusercontent.com`.

---

## 2. Vercel, for the deploy state page

Vercel is an API key rather than OAuth. OAuth would mean publishing a Vercel
Integration for a review process, which is not worth it for one user.

1. Open <https://vercel.com/account/tokens>.
2. Click **Create Token**.
3. Name: `Magpi badge`.
4. Scope: choose your personal account, or the team whose deployments you want
   on the badge. This decides which projects the page can see.
5. Expiration: **No expiration**, or 1 year if you would rather rotate it. A
   token that expires silently shows the deploy page as an error until you
   notice, and the connections page is where it tells you.
6. Click **Create**. Copy the token now; the page never shows it again.

If you picked a team rather than your personal account, you also need the team
id: open <https://vercel.com/teams> → your team → **Settings → General**, and
copy the value under **Team ID**. It starts with `team_`.

The token goes into the website, not Doppler: open Magpi, go to
**Connections → Vercel**, paste it into **Personal API key**, put the team id
in **Team id** if you have one, and click **Save and test**.

You will know this worked when the Vercel row on the connections page shows a
green dot and the deploy state page lists your projects.

---

## 3. PostHog, for the one number page

PostHog has no OAuth, so this is an API key too.

### 3.1 The personal API key

1. Open <https://us.posthog.com> (or <https://eu.posthog.com> if your project
   is in the EU).
2. Click your avatar, bottom left → **Personal API keys**.
3. Click **Create personal API key**.
4. Label: `Magpi badge`.
5. Scopes: choose **Read** for **Insight**. Nothing else.
6. Click **Create key**. Copy it now; it is shown once.

### 3.2 The host

`us.posthog.com` or `eu.posthog.com`, whichever you just signed into. It is in
your browser's address bar.

### 3.3 The project id

1. Click the project name in the top left → **Project settings**.
2. The **Project ID** is at the top of the general section. It is a number.

### 3.4 The insight id

1. Go to **Product analytics** in the left sidebar.
2. Open the insight you want on the badge, or create one. A single trend line
   works best: this page draws one number and thirty points.
3. Look at the address bar. The URL is
   `https://us.posthog.com/project/<project id>/insights/<insight id>`. The
   insight id is the short code at the end, such as `aX9k2Lp`.

All four go into the website: **Connections → PostHog**, then **Save and
test**.

You will know this worked when the one number page preview on `/pages` shows
your real number rather than the sample.

### 3.5 Analytics for the website itself

Separate from the above, and optional. This is Magpi reporting its own usage.

1. **Project settings → Project API key**. Copy the key beginning `phc_`.
2. Store it:

```
doppler secrets set NEXT_PUBLIC_POSTHOG_KEY="phc_..." --project magpi --config dev
doppler secrets set NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com" --project magpi --config dev
```

Leave `NEXT_PUBLIC_POSTHOG_KEY` empty to run with analytics off. The app
detects the empty value and uses a no-op provider, so nothing else changes.

You will know this worked when PostHog's **Activity** tab shows a `$pageview`
within a minute of loading the site.

---

## 4. Linear

1. Open <https://linear.app/settings/api>.
2. Under **OAuth applications**, click **Create new**.
3. Fill in:
   - Application name: `Magpi`
   - Developer name: your name
   - Developer URL: your GitHub profile
   - Callback URLs, one per line:

     ```
     https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1/connections-callback
     http://127.0.0.1:56521/functions/v1/connections-callback
     ```

4. Leave **Public** off. This app is for you.
5. Click **Create**. Copy the client ID and client secret.

```
doppler secrets set OAUTH_LINEAR_CLIENT_ID="..." --project magpi --config dev
doppler secrets set OAUTH_LINEAR_CLIENT_SECRET="..." --project magpi --config dev
```

Linear ships **enabled** in the provider registry, so it appears on the
connections page as soon as the secrets are set.

You will know this worked when clicking **Connect** on the Linear row sends you
to a Linear authorize page naming Magpi.

---

## 5. Slack, optional

Slack ships **disabled** in the registry, because a connect button that opens a
broken authorize page is worse than no button. Do this section only if you want
mention counts.

1. Open <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name: `Magpi`. Pick your workspace. Click **Create App**.
3. Go to **OAuth & Permissions** in the left sidebar.
4. Under **Redirect URLs**, click **Add New Redirect URL** and add both:

   ```
   https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1/connections-callback
   http://127.0.0.1:56521/functions/v1/connections-callback
   ```

   Click **Save URLs**.

5. Scroll to **User Token Scopes**, not Bot Token Scopes. Click **Add an OAuth
   Scope** and add `search:read`. Searching your own mentions is a thing you do
   as yourself, so it is a user token.
6. Go to **Basic Information** and copy the **Client ID** and **Client
   Secret**.

```
doppler secrets set OAUTH_SLACK_CLIENT_ID="..." --project magpi --config dev
doppler secrets set OAUTH_SLACK_CLIENT_SECRET="..." --project magpi --config dev
```

Then enable it in the registry:

```
cd api && supabase db push
psql "$DATABASE_URL" -c "update public.providers set enabled = true where slug = 'slack';"
```

You will know this worked when Slack appears on the connections page with a
**Connect** link.

---

## 6. Notion, optional

Also ships disabled, for the same reason.

1. Open <https://www.notion.so/my-integrations> → **New integration**.
2. Type: **Public integration**. A public integration is what has an OAuth
   flow; an internal one issues a fixed token instead.
3. Name: `Magpi`. Pick your workspace. Upload
   `design/oauth-logo-120.png` as the logo.
4. Under **Capabilities**, tick **Read content** only. Notion sets permissions
   on the integration rather than through requested scopes, which is why the
   scopes list in the registry is empty by design.
5. Under **Redirect URIs**, add:

   ```
   https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1/connections-callback
   ```

6. Fill in the required company name, website, and privacy policy URLs. Your
   GitHub repo URL is fine for all three on a personal integration.
7. Click **Submit**. Copy the **OAuth client ID** and **OAuth client secret**.

```
doppler secrets set OAUTH_NOTION_CLIENT_ID="..." --project magpi --config dev
doppler secrets set OAUTH_NOTION_CLIENT_SECRET="..." --project magpi --config dev
psql "$DATABASE_URL" -c "update public.providers set enabled = true where slug = 'notion';"
```

After connecting, open **Pages → Counters** and put a database id in **Notion
database id** to count one database. Leave it empty to count everything you
shared with the integration. The database id is the 32-character string in a
database URL: `notion.so/<workspace>/<database id>?v=...`.

You will know this worked when the Notion counter on `/pages` shows a number
other than zero.

---

## 7. GitHub, twice, for two different jobs

GitHub appears twice in this product and the two are easy to confuse.

- **Sign in.** Proves who you are. Configured in Supabase Auth.
- **The connection.** Reads your review requests. Configured as a provider.

They can share one OAuth app. The catch is the callback: a GitHub OAuth app has
exactly one authorization callback URL, and the two flows send different ones.

```
sign in     https://bxsgodfrrllijpmimsgs.supabase.co/auth/v1/callback
connection  https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1/connections-callback
```

GitHub accepts a `redirect_uri` that is a subdirectory of the registered
callback, so registering the host root covers both. Registering either full
path covers that flow and breaks the other.

1. Open <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth
   App**.
2. Fill in:
   - Application name: `Magpi`
   - Homepage URL: `https://magpi.app`, or your Vercel URL
   - Authorization callback URL, the host root and nothing more:

     ```
     https://bxsgodfrrllijpmimsgs.supabase.co
     ```

3. Click **Register application**.
4. Upload `design/app-icon-dark.png` as the logo.
5. Copy the **Client ID**. Click **Generate a new client secret** and copy that
   too.

```
doppler secrets set OAUTH_GITHUB_CLIENT_ID="..." --project magpi --config dev
doppler secrets set OAUTH_GITHUB_CLIENT_SECRET="..." --project magpi --config dev
```

You will know this worked when
`doppler secrets get OAUTH_GITHUB_CLIENT_ID --project magpi --config dev --plain`
prints a value and `supabase start` no longer warns about a missing variable.

---

## 8. Supabase

### 8.1 GitHub sign in

1. Open <https://supabase.com/dashboard/project/bxsgodfrrllijpmimsgs/auth/providers>.
2. Find **GitHub**. Toggle it on.
3. Paste the **Client ID** and **Client Secret** from section 7.
4. Note the **Callback URL** Supabase shows. It is
   `https://bxsgodfrrllijpmimsgs.supabase.co/auth/v1/callback`, which is a
   subdirectory of what you registered, so it works.
5. Click **Save**.

### 8.2 Site URL and the redirect allowlist

1. Open <https://supabase.com/dashboard/project/bxsgodfrrllijpmimsgs/auth/url-configuration>.
2. **Site URL**: your production URL, for example `https://magpi.app`.
3. Under **Redirect URLs**, click **Add URL** for each of these:

   ```
   https://magpi.app/**
   https://magpi-*.vercel.app/**
   http://localhost:3001/**
   http://127.0.0.1:3001/**
   http://localhost:3002/**
   http://127.0.0.1:3002/**
   http://localhost:3003/**
   http://127.0.0.1:3003/**
   http://localhost:3004/**
   http://127.0.0.1:3004/**
   ```

**Why four ports on two hosts.** The dev server takes the first free port in
3001 to 3004, and the pre-push gate's end-to-end run takes another from the
same range. Playwright uses `127.0.0.1` where the dev server uses `localhost`,
and the auth callback treats those as different origins. Registering all eight
means a sign-in never fails because something else was already on 3001.

The `magpi-*.vercel.app` entry covers preview deployments. Without it, signing
in on a preview URL lands on an error page.

### 8.3 The encryption key

This is what encrypts every provider token at rest. Generate one:

```
openssl rand -base64 32
```

A key already exists in Doppler `dev` from setup. For staging and production,
generate a new one for each. Never reuse the dev key.

```
doppler secrets set TOKEN_ENCRYPTION_KEY="<the base64 output>" --project magpi --config prd
doppler secrets set TOKEN_ENCRYPTION_KEY_ID="1" --project magpi --config prd
```

**Losing this key means losing every stored connection.** There is no recovery:
the ciphertext is unreadable without it and everyone reconnects. Put a copy in
your password manager before you move on.

`TOKEN_ENCRYPTION_KEY_ID` is a number naming the key. It exists so a key can be
rotated without a data-loss event: to rotate, move the old key into
`TOKEN_ENCRYPTION_KEYS_PREVIOUS` as `1:<old key>`, set the new key, and bump
the id to `2`. Old rows still decrypt under the old key while new writes use
the new one.

### 8.4 Edge function secrets

The edge functions do not read Doppler. They read secrets set on the Supabase
project, so push them across:

```
cd api
supabase link --project-ref bxsgodfrrllijpmimsgs

supabase secrets set \
  TOKEN_ENCRYPTION_KEY="$(doppler secrets get TOKEN_ENCRYPTION_KEY --project magpi --config prd --plain)" \
  TOKEN_ENCRYPTION_KEY_ID="1" \
  WEB_BASE_URL="https://magpi.app" \
  WEB_ORIGINS="https://magpi.app" \
  PAIRING_URL="https://magpi.app/link" \
  OAUTH_GOOGLE_CLIENT_ID="$(doppler secrets get OAUTH_GOOGLE_CLIENT_ID --project magpi --config dev --plain)" \
  OAUTH_GOOGLE_CLIENT_SECRET="$(doppler secrets get OAUTH_GOOGLE_CLIENT_SECRET --project magpi --config dev --plain)" \
  OAUTH_GITHUB_CLIENT_ID="$(doppler secrets get OAUTH_GITHUB_CLIENT_ID --project magpi --config dev --plain)" \
  OAUTH_GITHUB_CLIENT_SECRET="$(doppler secrets get OAUTH_GITHUB_CLIENT_SECRET --project magpi --config dev --plain)" \
  OAUTH_LINEAR_CLIENT_ID="$(doppler secrets get OAUTH_LINEAR_CLIENT_ID --project magpi --config dev --plain)" \
  OAUTH_LINEAR_CLIENT_SECRET="$(doppler secrets get OAUTH_LINEAR_CLIENT_SECRET --project magpi --config dev --plain)"
```

`SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, and `SUPABASE_PUBLISHABLE_KEYS` are
injected by the edge runtime. Do not set them yourself.

You will know this worked when `supabase secrets list` shows every name above
with a digest beside it.

---

## 9. Doppler

Everything in one table. The right-hand column is the one that matters: two of
these must never reach Vercel.

| Secret                                 | dev                                   | Syncs to Vercel |
| -------------------------------------- | ------------------------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `http://127.0.0.1:56521`              | Yes             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | local publishable key                 | Yes             |
| `BADGE_API_URL`                        | `http://127.0.0.1:56521/functions/v1` | Yes             |
| `NEXT_PUBLIC_POSTHOG_KEY`              | `phc_...` or empty                    | Yes             |
| `NEXT_PUBLIC_POSTHOG_HOST`             | `https://us.i.posthog.com`            | Yes             |
| `SUPABASE_SECRET_KEY`                  | local secret key                      | **No**          |
| `TOKEN_ENCRYPTION_KEY`                 | generated                             | **No**          |
| `TOKEN_ENCRYPTION_KEY_ID`              | `1`                                   | **No**          |
| `TOKEN_ENCRYPTION_KEYS_PREVIOUS`       | empty until you rotate                | **No**          |
| `WEB_BASE_URL`                         | `http://localhost:3001`               | No              |
| `WEB_ORIGINS`                          | the eight local origins               | No              |
| `PAIRING_URL`                          | `http://localhost:3001/link`          | No              |
| `OAUTH_GITHUB_CLIENT_ID` / `_SECRET`   | section 7                             | **No**          |
| `OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`   | section 1                             | **No**          |
| `OAUTH_LINEAR_CLIENT_ID` / `_SECRET`   | section 4                             | **No**          |
| `OAUTH_SLACK_CLIENT_ID` / `_SECRET`    | section 5                             | **No**          |
| `OAUTH_NOTION_CLIENT_ID` / `_SECRET`   | section 6                             | **No**          |
| `SUPABASE_ACCESS_TOKEN`                | for CI                                | **No**          |
| `SUPABASE_PROJECT_REF`                 | `bxsgodfrrllijpmimsgs`                | No              |
| `SUPABASE_DB_PASSWORD`                 | for CI                                | **No**          |

**The encryption key and the secret key never reach Vercel.** The web app never
decrypts anything: it reads `connections_public`, a view with the token columns
absent by construction, and every decrypt happens in an edge function. A web
app holding the encryption key is a web app that could leak one, for no benefit
at all. If you set up a Vercel sync in Doppler, exclude every row marked **No**.

The repo is already pointed at the right config by `doppler.yaml`. To confirm:

```
cd /Users/prashant/Developer/consumer-apps/magpi
doppler setup
doppler secrets --only-names
```

You will know this worked when that last command lists 28 names and
`doppler run -- printenv TOKEN_ENCRYPTION_KEY` prints your key.

---

## 10. GitHub Actions

Three repository secrets, for the job that pushes migrations and deploys the
edge functions.

1. Open `https://github.com/CoolAssPuppy/magpi/settings/secrets/actions`.
2. Click **New repository secret** three times:

| Name                    | Where it comes from                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | <https://supabase.com/dashboard/account/tokens> → **Generate new token**                                          |
| `SUPABASE_PROJECT_REF`  | `bxsgodfrrllijpmimsgs`                                                                                            |
| `SUPABASE_DB_PASSWORD`  | Project settings → Database → the password you set at project creation. Reset it there if you never wrote it down |

**Confirming the deploy actually ran, rather than assuming.** A green build is
not a deploy. The CI file has a `supabase` job that is skipped entirely when
the secrets are absent, and it exits 0 when it skips, so the run is green
either way.

1. Open the Actions tab and click the run for your push.
2. Look for the job **Migrate Supabase and deploy edge functions**. If it is
   not in the list, the `needs:` chain failed earlier.
3. Open it and read the log. `Supabase secrets not set; skipping` means the
   repository secrets are missing and nothing deployed.
4. A real deploy prints `Deploying edge function: gateway` and any other
   changed function.
5. Confirm from the other side:
   <https://supabase.com/dashboard/project/bxsgodfrrllijpmimsgs/functions>
   shows a **Last deployed** time matching your push.

A change to `_shared/**` redeploys every function that imports it. The plan
script works that out and a guard fails the job if any importer was missed,
which keeps a stale function from shipping green.

You will know this worked when the functions dashboard shows today's date
against `gateway`.

---

## 11. Vercel project

1. Open <https://vercel.com/new>.
2. Import `CoolAssPuppy/magpi`.
3. **Root directory**: click **Edit** and set it to `web`. This is the one
   setting people miss; without it the build cannot find `package.json`.
4. Framework preset: Next.js, detected automatically.
5. Under **Environment Variables**, add the four rows marked **Yes** in section
   9, with production values:

   ```
   NEXT_PUBLIC_SUPABASE_URL             https://bxsgodfrrllijpmimsgs.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sb_publishable_2mGoZ-Ycap2-ozm-0UUytg_GDwTiwjs
   BADGE_API_URL                        https://bxsgodfrrllijpmimsgs.supabase.co/functions/v1
   NEXT_PUBLIC_POSTHOG_KEY              phc_...
   NEXT_PUBLIC_POSTHOG_HOST             https://us.i.posthog.com
   ```

6. Click **Deploy**.
7. For the domain: **Settings → Domains → Add**, enter `magpi.app`, and follow
   the DNS instructions.

**Do not judge a deploy at one minute.** CI then build takes about four
minutes.

You will know this worked when your domain serves the homepage with the folded
bird, and the theme toggle in the header switches between light and dark.

---

## 12. Installing on the badge

### 12.1 Put the badge in disk mode

1. Plug the badge into your machine with a data cable.
2. Hold **BOOT** on the back.
3. While holding it, tap **RESET**.
4. Release **BOOT**.

A drive named `TUFTY` mounts. Its root is the device's `/system`.

### 12.2 Copy the files

The packager does the naming for you. The launcher lists every folder that
holds an `icon.png` and names the tile from the folder, turning underscores
into spaces and capitalising each word. There is no title field, so the
deployed folder name is the label.

```
cd /Users/prashant/Developer/consumer-apps/magpi
COPYFILE_DISABLE=1 pnpm badge:package
```

That copies:

```
device/notifier-app  →  /Volumes/TUFTY/apps/Notifier
device/pomodoro-app  →  /Volumes/TUFTY/apps/Pomodoro
device/badge-sdk/sb  →  /Volumes/TUFTY/badge/sdk/sb
```

**`COPYFILE_DISABLE=1` matters.** Without it macOS writes an AppleDouble `._`
file beside every real file, and the launcher tries to load `._notifier.py` as
an app. Sweep any that got through:

```
find /Volumes/TUFTY -name '._*' -delete
find /Volumes/TUFTY -name '.DS_Store' -delete
```

### 12.3 WiFi

Notifier needs the network. Pomodoro never does.

Create `/Volumes/TUFTY/secrets.py` with:

```python
WIFI_SSID = "your network"
WIFI_PASSWORD = "your password"
```

2.4GHz only. The Tufty has no 5GHz radio, and a network that is 5GHz-only
looks to the badge like a network that is not there.

### 12.4 Eject

Eject `TUFTY` from Finder, or:

```
diskutil eject /Volumes/TUFTY
```

Pulling the cable without ejecting can leave a half-written file, and the
badge then fails on an import with no clue why.

You will know this worked when the badge reboots to the launcher and shows two
new tiles, **Notifier** and **Pomodoro**, each with the folded magpie on it.

---

## 13. First run

In order. Each step depends on the one before it.

1. **Sign in.** Open your site, click **Sign in with GitHub**, authorize. You
   land on `/link`, because an account with no badge has nothing to configure
   yet.
2. **Connect Google.** Go to **Connections → Google → Authorize**. Approve both
   scopes. Google warns that the app is unverified: click **Advanced** →
   **Go to Magpi (unsafe)**. That warning is what section 1.3 explained, and it
   appears because the app is in Testing.
3. **Turn on a page.** Go to **Pages** and toggle **Next thing** on. The
   preview beside it fills with your real next meeting.
4. **Pair the badge.** Open **Notifier** on the badge. It joins WiFi, which
   takes about twenty seconds on a cold start, then shows a code. Type that
   code into **Link a badge** and click **Pair this badge**.
5. **Watch it arrive.** Within one poll interval, thirty seconds by default,
   the badge draws your next meeting. Press **DOWN** to page.

You will know the whole thing worked when the badge shows a real meeting title
from your own calendar, and `/dashboard` shows the badge as seen a few seconds
ago with its battery voltage.

---

## When something does not work

| What you see                                 | What it means                                                         |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Badge sits on "Joining WiFi"                 | Wrong password, or a 5GHz-only network. Check `secrets.py`            |
| Badge shows "Not paired" right after pairing | The token file did not write. Re-pair; if it repeats, reflash the SDK |
| A page reads "Not connected"                 | That provider has no connection. The connections page says which      |
| A page reads an error                        | The provider refused us. The connections page carries the reason      |
| Google connection dies after a week          | Expected while the app is in Testing. Reauthorize                     |
| Sign-in lands on an error page               | The URL is not in the Supabase redirect allowlist. See 8.2            |
| Deploy state page is empty                   | The Vercel token is scoped to the wrong account or team               |
| Build fails on Vercel with "no package.json" | Root directory is not set to `web`. See section 11                    |
| CI green but nothing deployed                | Repository secrets missing. See section 10                            |
