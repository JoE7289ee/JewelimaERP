#!/usr/bin/env bash
#
# Jewelima demo data — load or clear a fully-populated sandbox.
#
# Copy this file anywhere on a machine that runs your bench, then from the
# frappe-bench directory:
#
#   ./jewelima_demo.sh <site>           # load dummy data  (default action)
#   ./jewelima_demo.sh <site> make      # load dummy data
#   ./jewelima_demo.sh <site> clear     # remove the dummy data again
#
# Works identically on a Mac dev box or an Ubuntu server — it just shells out to
# `bench execute`, so the Jewelima app only needs to be installed on the site.
#
set -euo pipefail

SITE="${1:?usage: jewelima_demo.sh <site> [make|clear]}"
ACTION="${2:-make}"

case "$ACTION" in
  make|load)  FN="make_demo" ;;
  clear|wipe) FN="clear_demo" ;;
  *) echo "unknown action '$ACTION' (use: make | clear)"; exit 1 ;;
esac

echo ">> jewelima.demo.demo_data.${FN} on site '${SITE}'"
bench --site "$SITE" execute "jewelima.demo.demo_data.${FN}"
