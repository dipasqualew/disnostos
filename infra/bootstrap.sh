#!/usr/bin/env bash
# Creates what Terraform cannot create for itself: the GCP project, its billing
# link, the APIs Terraform needs to start, and the Terraform state bucket.
# Safe to re-run. Never changes gcloud config, org policy, or org-level IAM.
#
# Usage: infra/bootstrap.sh <staging|prod>
set -euo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  staging|prod) ;;
  *) echo "Usage: $0 <staging|prod>" >&2; exit 2 ;;
esac

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
load_environment "$ENVIRONMENT"

ORG_ID="${GCP_ORG_ID:?GCP_ORG_ID is not set}"
BILLING_ACCOUNT="${GCP_BILLING_ACCOUNT_ID:?GCP_BILLING_ACCOUNT_ID is not set}"
REGION="europe-west1"
STATE_BUCKET="${PROJECT_ID}-tfstate"

export CLOUDSDK_CORE_DISABLE_PROMPTS=1
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"

die() { echo "ERROR: $*" >&2; exit 1; }

# The Cloud Billing API rate-limits gcloud's shared client quota.
retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    "$@" && return 0
    [[ "$attempt" -lt 5 ]] && sleep $((attempt * 15))
  done
  return 1
}

# 1. Project. An existing project is only accepted if it is in our org.
if parent="$(gcloud projects describe "$PROJECT_ID" --format='csv[no-heading](parent.type,parent.id)' 2>/dev/null)"; then
  [[ "$parent" == "organization,$ORG_ID" ]] \
    || die "project $PROJECT_ID exists outside organization $ORG_ID (parent: $parent)"
  echo "Project $PROJECT_ID already exists."
else
  echo "Creating project $PROJECT_ID..."
  gcloud projects create "$PROJECT_ID" --organization="$ORG_ID" --name="$PROJECT_ID" \
    || die "could not create $PROJECT_ID. If the ID is taken, stop: do not pick another ID."
fi

# 2. Billing. Refuses to move a project that is linked to a different account.
current_billing="$(retry gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)')"
if [[ "$current_billing" == "billingAccounts/$BILLING_ACCOUNT" ]]; then
  echo "Billing already linked."
elif [[ -z "$current_billing" ]]; then
  echo "Linking billing account..."
  retry gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" >/dev/null
else
  die "project is linked to a different billing account: $current_billing"
fi

# 3. APIs Terraform needs before it can manage the rest.
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com \
  storage.googleapis.com --project="$PROJECT_ID"

# 4. Terraform state bucket.
if [[ -n "$(gcloud storage buckets list --project="$PROJECT_ID" \
  --filter="name=$STATE_BUCKET" --format='value(name)')" ]]; then
  echo "State bucket gs://$STATE_BUCKET already exists."
else
  echo "Creating state bucket gs://$STATE_BUCKET..."
  gcloud storage buckets create "gs://$STATE_BUCKET" --project="$PROJECT_ID" \
    --location="$REGION" --uniform-bucket-level-access --public-access-prevention
fi
gcloud storage buckets update "gs://$STATE_BUCKET" --project="$PROJECT_ID" \
  --versioning --uniform-bucket-level-access --public-access-prevention

echo "Bootstrap complete for $PROJECT_ID."
