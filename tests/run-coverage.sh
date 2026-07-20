#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
coverage_directory="$project_root/build/coverage"

rm -rf -- "$coverage_directory"
mkdir -p "$coverage_directory"

gjs \
    --coverage-prefix="file://$project_root/src/application.js" \
    --coverage-prefix="file://$project_root/src/device-detector.js" \
    --coverage-prefix="file://$project_root/src/input-monitor.js" \
    --coverage-prefix="file://$project_root/src/key-mappings.js" \
    --coverage-prefix="file://$project_root/src/status-notifier.js" \
    --coverage-output="$coverage_directory" \
    -m "$project_root/tests/coverage-runner.js"

awk '
    /^LF:/ { total += substr($0, 4) }
    /^LH:/ { covered += substr($0, 4) }
    END {
        percent = total == 0 ? 0 : covered * 100 / total
        printf "GJS line coverage: %.2f%% (%d/%d)\n", percent, covered, total
        if (covered * 100 < total * 80)
            exit 1
    }
' "$coverage_directory/coverage.lcov"
