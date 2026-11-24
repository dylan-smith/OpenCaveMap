#!/usr/bin/env bash
# Seeds a preview environment with the sample projects in preview-seed-data.json, through the API so the data
# goes through the same validation as real use. Runs after the smoke tests, which have already waited for the API
# to be ready.
#
# Each sample project has a unit system and a list of segments, so reviewers can see survey data straight away. A
# segment has its survey date, name, note, and stations and shots with their readings and notes. Readings are typed
# in the project's unit system (feet for imperial, metres for metric), and each segment is sent with it.
#
# Every deployment starts the preview over: it deletes every project of the seed's user first, which also removes
# their segments, so whatever reviewers changed as that user is gone and the samples are never duplicated. Projects
# other test users made are left alone. A seed that stops partway is redone in full by the next deployment, and a
# sample the API rejects stops the seed with the API's response.
# Requires API_URL and API_AUTH_TOKEN (the test sign-in the projects are created for), and runs from the
# repository root.
set -euo pipefail

seed_file=.github/scripts/preview-seed-data.json

api() {
  curl --fail-with-body --silent --show-error --max-time 60 -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${API_AUTH_TOKEN}" "$@"
}

# Sends the JSON on stdin with the given method and URL and prints the response. If the API rejects it, prints what
# was being added and the API's response, and stops.
send() {
  local description="$1"
  shift
  local response
  if ! response="$(api --data @- "$@")"; then
    echo "::error::The API rejected ${description}" >&2
    echo "${response}" >&2
    exit 1
  fi
  echo "${response}"
}

# Only reads are retried: a retried POST or DELETE whose first attempt did go through would fail or duplicate.
existing="$(api --retry 3 --retry-all-errors "${API_URL}/api/projects")"
deleted=0
for id in $(jq -r '.[].id' <<<"${existing}"); do
  api -X DELETE "${API_URL}/api/projects/${id}" --output /dev/null
  deleted=$((deleted + 1))
done
echo "Deleted the preview's ${deleted} project(s)"

count="$(jq length "${seed_file}")"
segments=0
for i in $(seq 0 $((count - 1))); do
  name="$(jq -r ".[${i}].name" "${seed_file}")"
  unit_system="$(jq -r ".[${i}].unitSystem" "${seed_file}")"
  project="$(jq -c ".[${i}] | {name, unitSystem}" "${seed_file}" |
    send "project \"${name}\"" -X POST "${API_URL}/api/projects")"
  id="$(jq -r .id <<<"${project}")"
  echo "Added project ${id}, \"${name}\" (${unit_system})"

  segment_count="$(jq ".[${i}].segments | length" "${seed_file}")"
  for j in $(seq 0 $((segment_count - 1))); do
    segment="$(jq -c ".[${i}] | .segments[${j}] + {unitSystem}" "${seed_file}" |
      send "segment $((j + 1)) of \"${name}\"" -X POST "${API_URL}/api/projects/${id}/segments")"
    echo "  Added segment $(jq -r '"\(.number), \(.surveyDate), \(.stations | length) stations"' <<<"${segment}")"
    segments=$((segments + 1))
  done
done

echo "Seeded the preview with ${count} projects and ${segments} segments"
