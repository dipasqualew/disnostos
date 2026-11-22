# Infrastructure

Terraform owns infrastructure. `scripts/deploy.sh` owns the running image, and
Terraform ignores image changes so an apply never rolls back a release.

Prerequisites: `gcloud` and ADC logins (`gcloud auth login`,
`gcloud auth application-default login`), Terraform 1.9+, and Docker with buildx.
The scripts set the project per command and never change your gcloud config.

Identifiers are kept out of this public repository. Locally, copy
`infra/.env.example` to the gitignored `infra/.env.staging` and fill it in. CI
reads `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_SERVICE_ACCOUNT` from the `staging` GitHub environment, which also stores
`GCP_ORG_ID` and `GCP_BILLING_ACCOUNT_ID` and only admits the `main` branch.
GitHub secrets cannot be read back, so keep your local file.

## 1. Bootstrap (once per environment)

Creates the project, links billing, enables the APIs Terraform needs, and creates
the state bucket. Safe to re-run.

```sh
infra/bootstrap.sh staging
```

## 2. Apply infrastructure

```sh
infra/tf.sh staging init
infra/tf.sh staging plan -out=staging.tfplan
infra/tf.sh staging apply staging.tfplan
```

Always use `infra/tf.sh`: it bills API quota to the environment's project even if
your ADC names a different quota project.

## 3. Deploy

```sh
scripts/deploy.sh staging all   # or: api, web
```

Images are built for `linux/amd64` and tagged with the git SHA. An uncommitted
tree gets a `<sha>-dirty-<timestamp>` tag and a warning.

## CI/CD

`.github/workflows/ci.yml` runs tests, typecheck, build, and credential-free
Terraform checks on pull requests and pushes to `main`. After a push to `main`
passes, `.github/workflows/deploy.yml` runs `terraform apply` and then
`scripts/deploy.sh`, one run per environment at a time.

GitHub authenticates through Workload Identity Federation (`modules/github-ci`).
Only `push` events on `refs/heads/main` of the repository with the pinned numeric
ID can get credentials. No service account keys exist.

CI cannot change IAM. Apply changes to `modules/github-ci`, and any change that
adds an IAM binding, with `infra/tf.sh` as a project owner **before** merging;
otherwise the CI apply fails with a 403.

## Adding an environment

Add `infra/terraform/environments/<env>` using the shared modules, then add the
environment to the `case` statement in `infra/bootstrap.sh`, `infra/tf.sh`, and
`scripts/deploy.sh`. Create `infra/.env.<env>`, apply it locally once to create
its CI identity, create a matching GitHub environment with the secrets above, and
add a `deploy-<env>` job to `ci.yml`.
