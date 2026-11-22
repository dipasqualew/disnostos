terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # The bucket is passed by infra/tf.sh at init.
  backend "gcs" {
    prefix = "terraform/state"
  }
}

variable "project_id" {
  description = "GCP project ID, supplied by infra/tf.sh."
  type        = string
}

variable "github_repository_id" {
  description = "Immutable numeric GitHub repository ID, supplied by infra/tf.sh."
  type        = string
}

locals {
  project_id = var.project_id
  region     = "europe-west1"
}

# Bills API quota to this project, whatever quota project the local ADC names.
provider "google" {
  project               = local.project_id
  region                = local.region
  billing_project       = local.project_id
  user_project_override = true
}

module "environment" {
  source = "../../modules/environment"

  project_id = local.project_id
  region     = local.region
}

module "github_ci" {
  source = "../../modules/github-ci"

  project_id               = local.project_id
  github_repository_id     = var.github_repository_id
  state_bucket             = "${local.project_id}-tfstate"
  runtime_service_accounts = module.environment.runtime_service_accounts

  # Production deploys only through the manual workflow, never on a push.
  github_event_name = "workflow_dispatch"
}

output "ci_workload_identity_provider" {
  value = module.github_ci.workload_identity_provider
}

output "ci_service_account" {
  value = module.github_ci.service_account_email
}

output "api_url" {
  value = module.environment.api_url
}

output "web_url" {
  value = module.environment.web_url
}

output "web_urls" {
  value = module.environment.web_urls
}

output "image_repository" {
  value = module.environment.image_repository
}
