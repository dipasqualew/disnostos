#!/usr/bin/env bash
# Runs Terraform for one environment, with quota billed to that environment's
# project rather than whatever quota project the local ADC names.
#
# Usage: infra/tf.sh <staging|prod> <terraform args...>
set -euo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|prod) ;;
  *) echo "Usage: $0 <staging|prod> <terraform args...>" >&2; exit 2 ;;
esac
shift

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/env.sh"
load_environment "$ENVIRONMENT"

export GOOGLE_CLOUD_QUOTA_PROJECT="$PROJECT_ID"
export GOOGLE_PROJECT="$PROJECT_ID"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export TF_VAR_project_id="$PROJECT_ID"
export TF_VAR_github_repository_id="${GH_REPOSITORY_ID:?GH_REPOSITORY_ID is not set}"

if [[ "${1:-}" == "init" ]]; then
  shift
  set -- init "-backend-config=bucket=${PROJECT_ID}-tfstate" "$@"
fi

exec terraform -chdir="$ROOT/terraform/environments/$ENVIRONMENT" "$@"
