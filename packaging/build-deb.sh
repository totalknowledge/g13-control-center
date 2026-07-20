#!/bin/sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

package=$(dpkg-parsechangelog -SSource)
version=$(dpkg-parsechangelog -SVersion)
architecture=$(dpkg-architecture -qDEB_HOST_ARCH)
output_directory="$project_root/dist"

mkdir -p "$output_directory"

G13_DEB_OUTPUT_DIR="$output_directory" dpkg-buildpackage \
    --build=binary \
    --no-check-builddeps \
    --no-sign \
    --buildinfo-file="$output_directory/${package}_${version}_${architecture}.buildinfo" \
    --buildinfo-option="-u$output_directory" \
    --changes-file="$output_directory/${package}_${version}_${architecture}.changes" \
    --changes-option="-u$output_directory"

printf '%s\n' "$output_directory/${package}_${version}_${architecture}.deb"
