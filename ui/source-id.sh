#!/bin/sh
# Prints an id for the UI source in this checkout: the git tree of ui/ (which
# changes with any committed change under it), plus a hash of whatever is not
# committed yet.
#
# vite stamps it into every build (build/ui-source.txt and the About box), and
# mxgo.sh compares that stamp with this checkout before serving the build. The
# server serves ui/build as it is, so a build older than the source is exactly
# how a fix that is in git can still be missing from the page.
cd "$(dirname "$0")" || exit 1

# The checkouts on proxima1 are owned by another user than the one running
# MXCuBE, and git refuses to read such a repo ("dubious ownership") unless
# told it is safe. -c safe.directory is ignored by git 2.35.2-2.38, so the
# setting also goes in a throw-away global config (GIT_CONFIG_GLOBAL, git
# >= 2.32), which every version honours. Read-only use: no lock files either.
SAFE_GITCFG=$(mktemp)
trap 'rm -f "$SAFE_GITCFG"' EXIT
printf '[safe]\n\tdirectory = *\n' > "$SAFE_GITCFG"
git() {
    GIT_CONFIG_GLOBAL=$SAFE_GITCFG GIT_OPTIONAL_LOCKS=0 \
        command git -c safe.directory='*' "$@"
}

tree=$(git rev-parse --short=12 HEAD:ui 2> /dev/null) || {
    echo unknown
    exit 0
}

# Uncommitted edits, and the names of new files (build/ and node_modules/
# are ignored, so they never count).
pending=$({
    git diff HEAD -- .
    git ls-files --others --exclude-standard -- .
} 2> /dev/null)

if [ -n "$pending" ]; then
    echo "$tree-dirty-$(printf '%s' "$pending" | git hash-object --stdin | cut -c1-8)"
else
    echo "$tree"
fi
