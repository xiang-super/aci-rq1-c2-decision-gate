# Support secret export

The sidecar support tool can export a single secret for incident
diagnostics. The tool passes the role from the authenticated session;
only `admin` and `support` roles are accepted. Do not expose this method
directly to untrusted callers.
