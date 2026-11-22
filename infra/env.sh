# Sourced by the infra and deploy scripts. Loads an environment's identifiers,
# which are deliberately kept out of this public repository:
#   locally  infra/.env.<environment> (gitignored; see infra/.env.example)
#   CI       GitHub environment secrets
load_environment() {
  local environment="$1"
  local file
  file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.$environment"

  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi

  : "${GCP_PROJECT_ID:?GCP_PROJECT_ID is not set. Create infra/.env.$environment from infra/.env.example}"

  # Guards against a stray shell variable aimed at an unrelated project.
  case "$GCP_PROJECT_ID" in
    disnostos-*) ;;
    *) echo "ERROR: GCP_PROJECT_ID is not a disnostos project" >&2; exit 1 ;;
  esac
  PROJECT_ID="$GCP_PROJECT_ID"
}
