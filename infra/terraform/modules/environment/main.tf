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
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
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

  # A Cloud Run service answers on more than one URL; allow only the web service's own.
  env = {
    ALLOWED_ORIGINS = join(",", module.web.urls)
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
