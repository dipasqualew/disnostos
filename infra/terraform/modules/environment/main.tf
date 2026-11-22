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

variable "region" {
  type = string
}

variable "max_instances" {
  type    = number
  default = 3
}

variable "bootstrap_image" {
  description = "Public placeholder used only when a service is first created."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

locals {
  apis = toset([
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "identitytoolkit.googleapis.com",
    "run.googleapis.com",
    "securetoken.googleapis.com",
    "storage.googleapis.com",
  ])
}

resource "google_project_service" "apis" {
  for_each = local.apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "disnostos"
  format        = "DOCKER"
  description   = "disnostos service images"

  docker_config {
    immutable_tags = true
  }

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }

  depends_on = [google_project_service.apis]
}

module "web" {
  source = "../cloud-run-service"

  project_id         = var.project_id
  region             = var.region
  name               = "disnostos-web"
  service_account_id = "disnostos-web-run"
  bootstrap_image    = var.bootstrap_image
  max_instances      = var.max_instances

  depends_on = [google_project_service.apis]
}

module "api" {
  source = "../cloud-run-service"

  project_id         = var.project_id
  region             = var.region
  name               = "disnostos-api"
  service_account_id = "disnostos-api-run"
  bootstrap_image    = var.bootstrap_image
  max_instances      = var.max_instances
  memory             = "512Mi" # Holds image uploads and downloads of up to 10 MB.

  # A Cloud Run service answers on more than one URL; allow only the web service's own.
  env = {
    ALLOWED_ORIGINS = join(",", module.web.urls)
    AUTH_PROJECT_ID = var.project_id
    GCP_PROJECT_ID  = var.project_id
    IMAGES_BUCKET   = local.images_bucket
  }

  depends_on = [google_project_service.apis]
}

locals {
  images_bucket = "${var.project_id}-images"

  # Generated from the entity definitions in packages/model.
  firestore_indexes = jsondecode(file("${path.module}/../../../../packages/model/generated/firestore.indexes.json")).indexes
}

# All access goes through the API, whose service account bypasses these rules.
resource "google_firestore_database" "default" {
  project                           = var.project_id
  name                              = "(default)"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "PESSIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"

  depends_on = [google_project_service.apis]
}

resource "google_firestore_index" "generated" {
  for_each = { for index in local.firestore_indexes : "${index.collection}:${join(",", [for field in index.fields : "${field.field}:${field.order}"])}" => index }

  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = each.value.collection
  query_scope = "COLLECTION"

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path = fields.value.field
      order      = fields.value.order
    }
  }

  # Firestore appends this implicitly, which would otherwise show as drift.
  fields {
    field_path = "__name__"
    order      = "DESCENDING"
  }
}

# Browsers and mobile clients can never reach Firestore directly.
resource "google_firebaserules_ruleset" "firestore_deny_all" {
  project = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = <<-RULES
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if false;
            }
          }
        }
      RULES
    }
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_release" "firestore" {
  project      = var.project_id
  name         = "cloud.firestore"
  ruleset_name = "projects/${var.project_id}/rulesets/${google_firebaserules_ruleset.firestore_deny_all.name}"
}

resource "google_project_iam_member" "api_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${module.api.service_account_email}"
}

# Private images. Only the API's identity can reach them; it proxies every read.
resource "google_storage_bucket" "images" {
  project                     = var.project_id
  name                        = local.images_bucket
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # A deleted image must really be gone, and retained copies would be billed.
  soft_delete_policy {
    retention_duration_seconds = 0
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "api_images" {
  bucket = google_storage_bucket.images.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${module.api.service_account_email}"
}

locals {
  web_hosts = [for url in module.web.urls : trimprefix(url, "https://")]
}

# Accounts are created only by administrators: see infra/configure-auth.sh, which
# also sets the options this resource cannot express (email enumeration protection
# and, where Google permits it, the in-app reset link).
resource "google_identity_platform_config" "auth" {
  project            = var.project_id
  authorized_domains = local.web_hosts

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = true
    }

    anonymous {
      enabled = false
    }

    phone_number {
      enabled = false
    }
  }

  client {
    permissions {
      disabled_user_signup   = true
      disabled_user_deletion = true
    }
  }

  depends_on = [google_project_service.apis]
}

# Ships in the browser bundle, so it is restricted to the auth APIs and this site.
resource "google_apikeys_key" "web_auth" {
  project      = var.project_id
  name         = "disnostos-web-auth"
  display_name = "disnostos web sign-in"

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }

    api_targets {
      service = "securetoken.googleapis.com"
    }

    browser_key_restrictions {
      # The second entry is Google's hosted password reset page, which reset emails
      # link to while this project cannot use a custom action URL.
      allowed_referrers = concat(
        [for host in local.web_hosts : "https://${host}/*"],
        ["https://${var.project_id}.firebaseapp.com/*"],
      )
    }
  }

  depends_on = [google_project_service.apis]
}

output "api_url" {
  value = module.api.uri
}

output "web_url" {
  value = module.web.uri
}

output "web_urls" {
  value = module.web.urls
}

output "runtime_service_accounts" {
  description = "Runtime service account emails, keyed by service."
  value = {
    api = module.api.service_account_email
    web = module.web.service_account_email
  }
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}
