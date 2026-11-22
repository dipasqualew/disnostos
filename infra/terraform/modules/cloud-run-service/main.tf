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

variable "name" {
  description = "Cloud Run service name."
  type        = string
}

variable "service_account_id" {
  description = "Account ID of the dedicated runtime service account."
  type        = string
}

variable "bootstrap_image" {
  description = "Image used only when the service is first created. Later images are deployed by gcloud."
  type        = string
}

variable "max_instances" {
  type = number
}

variable "memory" {
  type    = string
  default = "256Mi"
}

variable "env" {
  description = "Plain (non-secret) environment variables."
  type        = map(string)
  default     = {}
}

# Has no roles here. A service that calls a GCP API is granted them by its caller.
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = var.service_account_id
  display_name = "${var.name} runtime"
}

resource "google_cloud_run_v2_service" "this" {
  project  = var.project_id
  location = var.region
  name     = var.name
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      image = var.bootstrap_image

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = var.memory
        }
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  # Images are released by scripts/deploy.sh; Terraform must not revert them.
  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].revision,
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}

output "urls" {
  description = "Every URL that serves this service."
  value       = google_cloud_run_v2_service.this.urls
}

output "service_account_email" {
  value = google_service_account.runtime.email
}
