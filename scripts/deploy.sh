#!/usr/bin/env bash
# Builds, pushes, and releases service images. Non-interactive, for local and CI use.
# Infrastructure changes belong in Terraform; this only replaces the running image.
#
# Usage: scripts/deploy.sh staging <api|web|all>
#
# Image tags are immutable:
#   clean tree   <12-char git SHA>; an existing image for that SHA is reused
#   dirty tree   <12-char git SHA>-dirty-<UTC timestamp>
set -euo pipefail

usage() { echo "Usage: $0 staging <api|web|all>" >&2; exit 2; }

[[ $# -eq 2 ]] || usage
case "$1" in
  staging) ;;
  *) usage ;;
esac
source "$(dirname "${BASH_SOURCE[0]}")/../infra/env.sh"
load_environment "$1"
case "$2" in
  api) TARGETS=(api) ;;
  web) TARGETS=(web) ;;
  all) TARGETS=(api web) ;; # API first: the web build needs its URL.
  *) usage ;;
esac

REGION="europe-west1"
REGISTRY="$REGION-docker.pkg.dev"
REPOSITORY="$REGISTRY/$PROJECT_ID/disnostos"

export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHA="$(git rev-parse --short=12 HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "ERROR: refusing to deploy a dirty tree from CI:" >&2
    git status --short >&2
    exit 1
  fi
  TAG="$SHA-dirty-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "WARNING: uncommitted changes; deploying as $TAG" >&2
else
  TAG="$SHA"
fi

# Log in through a throwaway Docker config so the user's is never modified.
DOCKER_HOST="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}"
export DOCKER_HOST
USER_DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
if [[ -d "$USER_DOCKER_CONFIG/cli-plugins" ]]; then
  ln -s "$USER_DOCKER_CONFIG/cli-plugins" "$DOCKER_CONFIG/cli-plugins"
fi
gcloud auth print-access-token --project="$PROJECT_ID" \
  | docker login -u oauth2accesstoken --password-stdin "https://$REGISTRY" >/dev/null

service_url() {
  gcloud run services describe "disnostos-$1" --project="$PROJECT_ID" --region="$REGION" \
    --format='value(status.url)'
}

image_exists() {
  gcloud artifacts docker images describe "$1" --project="$PROJECT_ID" >/dev/null 2>&1
}

deploy() {
  local target="$1" image="$REPOSITORY/$1:$TAG"
  local build_args=()

  if [[ "$target" == "web" ]]; then
    local api_url
    api_url="$(service_url api)"
    [[ -n "$api_url" ]] || { echo "ERROR: could not read the API URL" >&2; exit 1; }
    build_args=(--build-arg "VITE_API_URL=$api_url")
  fi

  if [[ "$TAG" == "$SHA" ]] && image_exists "$image"; then
    echo "Reusing existing image $image"
  else
    echo "Building $image"
    docker buildx build --platform linux/amd64 --provenance=false --push \
      -f "apps/$target/Dockerfile" -t "$image" ${build_args[@]+"${build_args[@]}"} .
  fi

  gcloud run deploy "disnostos-$target" --project="$PROJECT_ID" --region="$REGION" \
    --image="$image" --quiet
  echo "Deployed disnostos-$target: $(service_url "$target")"
}

for target in "${TARGETS[@]}"; do
  deploy "$target"
done
