#!/usr/bin/env bash
# Applies the Identity Platform settings Terraform cannot express, and creates a
# user with an unknown random password. The user sets their own through the
# app's password reset. Safe to re-run; an existing user is left unchanged.
#
# Usage: infra/configure-auth.sh staging <email>
set -euo pipefail

ENVIRONMENT="${1:-}"
EMAIL="${2:-}"
case "$ENVIRONMENT" in
  staging) ;;
  *) echo "Usage: $0 staging <email>" >&2; exit 2 ;;
esac
[[ "$EMAIL" == *@*.* ]] || { echo "Usage: $0 staging <email>" >&2; exit 2; }

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
load_environment "$ENVIRONMENT"

WEB_URL="$(gcloud run services describe disnostos-web --project="$PROJECT_ID" \
  --region=europe-west1 --format='value(status.url)')"
[[ -n "$WEB_URL" ]] || { echo "ERROR: could not read the web URL" >&2; exit 1; }

ACCESS_TOKEN="$(gcloud auth print-access-token --project="$PROJECT_ID")"
export ACCESS_TOKEN PROJECT_ID WEB_URL EMAIL

python3 -I - <<'PY'
import json, os, secrets, sys, urllib.error, urllib.request

project = os.environ["PROJECT_ID"]
email = os.environ["EMAIL"]
base = "https://identitytoolkit.googleapis.com"

def call(method, path, body, tolerate=()):
    request = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": "Bearer " + os.environ["ACCESS_TOKEN"],
            "Content-Type": "application/json",
            "x-goog-user-project": project,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # The API's message only: the request body may hold a password.
        message = json.load(error).get("error", {}).get("message", "unknown error")
        if message in tolerate:
            return {"tolerated": message}
        sys.exit(f"ERROR: {method} failed with {error.code}: {message}")

call("PATCH", f"/admin/v2/projects/{project}/config?updateMask=emailPrivacyConfig.enableImprovedEmailPrivacy", {
    "emailPrivacyConfig": {"enableImprovedEmailPrivacy": True},
})
print("Email enumeration protection enabled.")

# Google refuses this on some projects. Reset emails then use its hosted page,
# which returns to the app afterwards.
result = call("PATCH", f"/admin/v2/projects/{project}/config?updateMask=notification.sendEmail.callbackUri", {
    "notification": {"sendEmail": {"callbackUri": os.environ["WEB_URL"] + "/auth/action"}},
}, tolerate=("EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED",))
if "tolerated" in result:
    print("WARNING: Google does not allow a custom reset link here; using its hosted reset page.")
else:
    print("Reset emails link to the in-app page.")

found = call("POST", f"/v1/projects/{project}/accounts:lookup", {"email": [email]})
if found.get("users"):
    print("User already exists; left unchanged.")
else:
    call("POST", f"/v1/projects/{project}/accounts", {
        "email": email,
        "password": secrets.token_urlsafe(48),
    })
    print("User created.")
PY
