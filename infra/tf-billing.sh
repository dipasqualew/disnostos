#!/usr/bin/env bash
# Runs Terraform for an environment's billing root. Owner-only and local: CI has
# no billing permissions and must not manage budgets.
#
# Usage: infra/tf-billing.sh <staging|prod> <terraform args...>
set -euo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|prod) ;;
  *) echo "Usage: $0 <staging|prod> <terraform args...>" >&2; exit 2 ;;
esac
shift

if [[ -n "${CI:-}" ]]; then
  echo "ERROR: the billing root is applied locally, not from CI" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/env.sh"
load_environment "$ENVIRONMENT"

export GOOGLE_CLOUD_QUOTA_PROJECT="$PROJECT_ID"
export GOOGLE_PROJECT="$PROJECT_ID"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export TF_VAR_project_id="$PROJECT_ID"
export TF_VAR_billing_account_id="${GCP_BILLING_ACCOUNT_ID:?GCP_BILLING_ACCOUNT_ID is not set}"

if [[ "${1:-}" == "init" ]]; then
  shift
  set -- init "-backend-config=bucket=${PROJECT_ID}-tfstate" "$@"
fi

exec terraform -chdir="$ROOT/terraform/environments/$ENVIRONMENT-billing" "$@"
