# Billing resources for prod. Kept apart from the prod root because CI has
# no billing permissions: apply this root locally with infra/tf-billing.sh.
terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # The bucket is passed by infra/tf-billing.sh at init.
  backend "gcs" {
    prefix = "terraform/billing"
  }
}

variable "project_id" {
  description = "GCP project ID, supplied by infra/tf-billing.sh."
  type        = string
}

variable "billing_account_id" {
  description = "Billing account ID, supplied by infra/tf-billing.sh."
  type        = string
  sensitive   = true
}

# Bills API quota to this project, whatever quota project the local ADC names.
provider "google" {
  project               = var.project_id
  billing_project       = var.project_id
  user_project_override = true
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "billingbudgets" {
  project            = var.project_id
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

# Alerts only: a budget does not cap spending. With no all_updates_rule, alerts
# go to the default recipients (billing account admins and users).
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "${var.project_id} monthly budget"

  budget_filter {
    projects        = ["projects/${data.google_project.this.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = "GBP"
      units         = "10"
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.billingbudgets]
}
