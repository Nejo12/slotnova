#!/usr/bin/env bash
set -euo pipefail
# Pinned upstream release and archive digests; no action license/account required.
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_x64; digest=e4eb209d04e20339d77122a3bdf9cd41351255cfb27ebcb75e85325e04f88924 ;;
  Darwin-arm64) platform=darwin_arm64; digest=69836c841d7e648fb30ff4846f8c3587855c5754ed02b8510caaf6008f65d177 ;;
  *) echo 'Unsupported scanner platform' >&2; exit 1 ;;
esac
destination=${1:?Pass a scanner installation directory}
mkdir -p "$destination"
archive="$destination/gitleaks.tar.gz"
curl --fail --silent --show-error --location "https://github.com/gitleaks/gitleaks/releases/download/v8.29.1/gitleaks_8.29.1_${platform}.tar.gz" -o "$archive"
printf '%s  %s\n' "$digest" "$archive" | shasum -a 256 --check
tar -xzf "$archive" -C "$destination" gitleaks
