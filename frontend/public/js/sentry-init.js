(function () {
  if (typeof Sentry === "undefined") return;

  var dsn = window.SENTRY_DSN || "https://461f8ff4ae22d71ba26038b4417bb2f9@o4510959811166208.ingest.us.sentry.io/4510959855403008";
  if (!dsn) return;

  Sentry.init({
    dsn: dsn,
    environment: window.location.hostname === "localhost" ? "development" : "production",
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });

  // Set user context from JWT in sessionStorage/localStorage
  try {
    var token = localStorage.getItem("token");
    if (token) {
      var parts = token.split(".");
      if (parts.length === 3) {
        var payload = JSON.parse(atob(parts[1]));
        Sentry.setUser({ id: payload.userId || payload.sub, email: payload.email });
      }
    }
  } catch (e) {
    // Token decode failed — no user context
  }
})();
