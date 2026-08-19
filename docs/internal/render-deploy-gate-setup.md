# Gating Render deploys on CI — the three dashboard steps

**Status:** the workflow half is shipped and live. The three steps below are the half that can only be done from the Render and GitHub dashboards, and until they are done Render still deploys exactly as it does today.

**Written:** 2026-08-19.

---

## Why this exists

Render auto-deploys on every push to `main` and does not read GitHub Actions. A commit whose CI fails still reaches production.

That is not hypothetical. On 2026-08-19:

| Time (UTC) | Event |
|---|---|
| 12:49:24 | `67dd1c41` pushed |
| 12:51:05 | **Render finished deploying it to production** |
| 12:51:17 | CI failed on that same commit |

Production ran a commit with a red build for twelve seconds before anyone could even know it was red. That particular commit was harmless — an unused export, no behaviour change — but nothing about the path depended on it being harmless. The same sequence ships a genuinely broken commit just as willingly.

## What is already done

`.github/workflows/ci.yml` has a `deploy` job that:

- waits for **backend and frontend** to pass,
- runs only on a push to `main` (never on a pull request),
- **fails loudly** if `RENDER_DEPLOY_HOOK_URL` is unset, rather than skipping — a job that silently no-ops on a missing secret is worse than no gate, because it reports success while deploying nothing,
- fails if Render's hook returns anything outside 2xx.

It deliberately does **not** wait for the E2E job. On the same day, E2E hung for 6h02m on a Playwright browser download and was killed by GitHub's job timeout; gating deploys on it would have blocked every deploy for that window over an infrastructure hang unrelated to the code. `backend/__tests__/unit/ci/deployGate.test.ts` asserts this, so a later well-meaning "make the gate stricter" change fails CI instead of quietly reintroducing the hang.

---

## The three steps — order matters

> **Do them in this order.** Doing step 3 before step 2 leaves a window where auto-deploy is off and the hook is not yet wired, so **nothing deploys at all** and it is not obvious why.

### 1. Create the deploy hook in Render

1. Open the service: <https://dashboard.render.com/web/srv-d64iqtffte5s73894h8g>
2. **Settings** → scroll to **Deploy Hook**.
3. Copy the URL. It looks like `https://api.render.com/deploy/srv-d64iqtffte5s73894h8g?key=…`.

**Treat it as a credential.** Anyone holding it can trigger a production deploy. Do not paste it into a commit, an issue, or a chat log.

### 2. Add it as a GitHub secret

1. Go to <https://github.com/Silkroutelogistics/silk-route-logistics/settings/secrets/actions>
2. **New repository secret**.
3. Name — exactly, case-sensitive: `RENDER_DEPLOY_HOOK_URL`
4. Value — the URL from step 1.
5. **Add secret**.

**Verify before continuing.** Push any commit (a docs typo fix is fine) and confirm the `Deploy to Render` job goes green and logs `Render deploy triggered for <sha>`. At this point deploys fire **twice** — once from the hook, once from Render's own auto-deploy. That is expected and harmless for one push; the second is a no-op rebuild of the same commit.

Do not proceed to step 3 until you have seen that job pass.

### 3. Turn Render auto-deploy off — last

1. Same service → **Settings** → **Build & Deploy**.
2. Set **Auto-Deploy** to **No**.
3. Save.

From here the only path to production is a green backend + frontend on `main`.

---

## Checking it worked

- Push a green commit → `Deploy to Render` passes, and `curl -s https://api.silkroutelogistics.ai/api/health` reports the new `sha` within a couple of minutes.
- Push a commit that fails backend CI → the deploy job does not run, and `/api/health` keeps reporting the **previous** `sha`. That second check is the one that proves the gate; the first only proves the hook works.

## Rolling back

Set **Auto-Deploy** back to **Yes**. Behaviour returns to exactly what it is today. The workflow's deploy job keeps running and is harmless alongside it — worst case a commit deploys twice.

## If a deploy is needed while CI is broken

Hit the deploy hook directly:

```
curl -X POST "<the hook URL>"
```

Or use **Manual Deploy** in the Render dashboard. Both bypass the gate on purpose — the gate is there to stop *accidents*, not to remove your ability to ship during an incident.
