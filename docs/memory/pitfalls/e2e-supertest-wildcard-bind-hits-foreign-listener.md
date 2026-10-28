---
name: e2e-supertest-wildcard-bind-hits-foreign-listener
description: supertest(app) binds the wildcard `::` per request; on macOS a foreign listener on 127.0.0.1:<same port> can answer instead (seen: IntelliJ's built-in server, 404). Use the loopback helper in apps/api/test/support/http.ts.
type: pitfall
---
**What happened (#55, DEC-116):** an e2e failed with `expected 201, received 404`, about 1 in 20000 requests. The 404 came from IntelliJ IDEA's built-in web server on 127.0.0.1:63343, not from the app. supertest's `request(server)` calls `server.listen(0)` for every request, and Node binds the wildcard `::`. On macOS that bind succeeds even while another process holds 127.0.0.1:<same port>, so a request to 127.0.0.1 reaches the foreign listener.

**Why:** an ephemeral wildcard bind per request does not reserve the loopback address. The OS picks a port that is free for `::` but may already be taken on 127.0.0.1 by another process.

**How to apply:**
- In e2e specs use `startApp(app)` and `http(app)` from `apps/api/test/support/http.ts`. `startApp` listens once on `127.0.0.1`, and `http` points supertest at that URL.
- ESLint (`no-restricted-syntax` in root `eslint.config.mjs`) blocks direct `import`/literal `require('supertest')` under `apps/api/test/**` except the helper. Dynamic `import()` is not caught.
- If an e2e shows a non-JSON 404 or a foreign `Server` header, suspect a local listener (IDE servers, dev tools) on that port.

**What guards the regression (honest scope):** only the helper spec H1 (bind address) and the ESLint rule hold it. The throttle suite and H2 do NOT detect the old pattern or wildcard binding; H2 proves only the new behaviour. Calling listen before the trust-proxy override is a convention, not a tested invariant.
