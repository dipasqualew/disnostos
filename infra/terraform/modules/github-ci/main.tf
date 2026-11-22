# Lets GitHub Actions on one repository's main branch deploy one environment,
# through Workload Identity Federation. There are no service account keys.
#
# CI can read, but never change, any IAM policy, including this module's own
# resources. A change to this file must therefore be applied by a human first:
# `infra/tf.sh <env> apply`. Otherwise the CI apply fails with a 403 and nothing
# about CI's access changes.

terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

variable "project_id" {
  type = string
}

variable "github_repository_id" {
  description = "Immutable numeric GitHub repository ID. Unlike a name, it cannot be re-registered by someone else."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "Must be the numeric repository ID."
  }
}

variable "github_ref" {
  description = "The only git ref allowed to obtain credentials."
  type        = string
  default     = "refs/heads/main"
}

variable "state_bucket" {
  description = "Terraform state bucket for this environment."
  type        = string
}

variable "runtime_service_accounts" {
  description = "Cloud Run runtime service account emails CI may deploy as, keyed by a static name."
  type        = map(string)
}

locals {
  apis = toset([
    "iamcredentials.googleapis.com", # Impersonating the CI service account.
    "sts.googleapis.com",            # Exchanging the GitHub token.
  ])

  # Project-level grants. Everything else is scoped to a single resource below.
  project_roles = {
    deployer = google_project_iam_custom_role.deployer.id

    # Deploys revisions. Unlike roles/run.admin it cannot set IAM policy, so CI
    # cannot change who may invoke a service.
    run = "roles/run.developer"

    # Pushes images. Repository settings come from the custom role.
    images = "roles/artifactregistry.writer"
  }
}

resource "google_project_service" "apis" {
  for_each = local.apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "ci" {
  project      = var.project_id
  account_id   = "disnostos-ci"
  display_name = "disnostos GitHub Actions CI"
}

# Replaces broad admin roles with what this Terraform actually calls. It holds
# no setIamPolicy permission and no iam.roles.update, so CI cannot widen its own
# access, and no delete permissions for service accounts or APIs.
resource "google_project_iam_custom_role" "deployer" {
  project     = var.project_id
  role_id     = "disnostosCiDeployer"
  title       = "disnostos CI deployer"
  description = "Applies this environment's Terraform without being able to change IAM."

  permissions = [
    # Provider quota billing (user_project_override) and the API resources.
    "serviceusage.services.enable",
    "serviceusage.services.get",
    "serviceusage.services.list",
    "serviceusage.services.use",

    "resourcemanager.projects.get",
    "resourcemanager.projects.getIamPolicy",

    # Runtime service accounts.
    "iam.serviceAccounts.create",
    "iam.serviceAccounts.get",
    "iam.serviceAccounts.getIamPolicy",
    "iam.serviceAccounts.list",
    "iam.serviceAccounts.update",

    # Read-only refresh of this module's resources.
    "iam.roles.get",
    "iam.workloadIdentityPoolProviders.get",
    "iam.workloadIdentityPools.get",

    # Image repository settings.
    "artifactregistry.repositories.create",
    "artifactregistry.repositories.get",
    "artifactregistry.repositories.list",
    "artifactregistry.repositories.update",
  ]
}

resource "google_project_iam_member" "ci" {
  for_each = local.project_roles

  project = var.project_id
  role    = each.value
  member  = google_service_account.ci.member
}

# Bound on the state bucket only, so it grants nothing on any other bucket.
resource "google_project_iam_custom_role" "state_bucket_reader" {
  project     = var.project_id
  role_id     = "disnostosCiStateBucketReader"
  title       = "disnostos CI state bucket reader"
  description = "Reads the Terraform state bucket's metadata and IAM policy."

  permissions = [
    "storage.buckets.get",
    "storage.buckets.getIamPolicy",
  ]
}

resource "google_storage_bucket_iam_member" "state_objects" {
  bucket = var.state_bucket
  role   = "roles/storage.objectUser"
  member = google_service_account.ci.member
}

resource "google_storage_bucket_iam_member" "state_metadata" {
  bucket = var.state_bucket
  role   = google_project_iam_custom_role.state_bucket_reader.id
  member = google_service_account.ci.member
}

# `gcloud run deploy` must act as each service's runtime identity. Granted per
# account, so CI cannot run a service as any other identity in the project.
resource "google_service_account_iam_member" "act_as_runtime" {
  for_each = var.runtime_service_accounts

  service_account_id = "projects/${var.project_id}/serviceAccounts/${each.value}"
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.ci.member
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub repository"

  # The event check matters: a pull_request_target run reports ref=main while
  # being triggered from a pull request.
  attribute_condition = join(" && ", [
    "assertion.repository_id == \"${var.github_repository_id}\"",
    "assertion.ref == \"${var.github_ref}\"",
    "assertion.event_name == \"push\"",
  ])

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
    "attribute.event_name"    = "assertion.event_name"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_email" {
  value = google_service_account.ci.email
}
