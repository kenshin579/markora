# Markora release automation
#
# Targets:
#   make help                         show this message
#   make bump-version VERSION=x.y.z   edit gradle.properties + commit + push to main
#   make tag VERSION=x.y.z            bump-version + git tag v$(VERSION) + push tag
#   make release VERSION=x.y.z        tag + gh release create v$(VERSION) --generate-notes

.PHONY: help bump-version tag release \
        check-version check-main check-clean check-tag-unique check-gh

VERSION ?=
SEMVER_REGEX := ^[0-9]+\.[0-9]+\.[0-9]+$$

help:
	@echo "Markora release automation"
	@echo ""
	@echo "Usage:"
	@echo "  make bump-version VERSION=x.y.z   # edit gradle.properties + commit + push to main"
	@echo "  make tag VERSION=x.y.z            # bump-version + git tag + push tag"
	@echo "  make release VERSION=x.y.z        # tag + gh release create"

check-version:
	@if [ -z "$(VERSION)" ]; then \
		echo "ERROR: VERSION is required (e.g. make release VERSION=0.2.0)"; exit 1; \
	fi
	@echo "$(VERSION)" | grep -Eq '$(SEMVER_REGEX)' || { \
		echo "ERROR: VERSION must match MAJOR.MINOR.PATCH (got '$(VERSION)')"; exit 1; \
	}

check-main:
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != "main" ]; then \
		echo "ERROR: must be on 'main' branch (currently on '$$branch')"; exit 1; \
	fi

check-clean:
	@git diff --quiet && git diff --cached --quiet || { \
		echo "ERROR: working tree has uncommitted changes"; exit 1; \
	}

check-tag-unique: check-version
	@if git rev-parse --verify "v$(VERSION)" >/dev/null 2>&1; then \
		echo "ERROR: tag v$(VERSION) already exists locally"; exit 1; \
	fi
	@git fetch --tags --quiet
	@if git ls-remote --exit-code --tags origin "refs/tags/v$(VERSION)" >/dev/null 2>&1; then \
		echo "ERROR: tag v$(VERSION) already exists on origin"; exit 1; \
	fi

check-gh:
	@command -v gh >/dev/null 2>&1 || { \
		echo "ERROR: gh CLI not found (install: https://cli.github.com)"; exit 1; \
	}
	@gh auth status >/dev/null 2>&1 || { \
		echo "ERROR: gh CLI is not authenticated (run 'gh auth login')"; exit 1; \
	}
