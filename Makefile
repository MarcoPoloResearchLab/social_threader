MOBILE_DIR ?= mobile
MOBILE_NPM ?= npm
MOBILE_EAS ?= npx eas-cli
MOBILE_BUILD_PROFILE ?= production
MOBILE_IOS_BUILD_PROFILE ?= $(MOBILE_BUILD_PROFILE)
MOBILE_BUILD_ARGS ?=
MOBILE_IOS_BUILD_ARGS ?=
MOBILE_SUBMIT_ARGS ?=
MOBILE_IOS_SUBMIT_ARGS ?=
MOBILE_ANDROID_BUILD_DIR ?= /tmp/social-threader-mobile-android-aab
MOBILE_ANDROID_VERSION_CODE ?= local
MOBILE_ANDROID_BUNDLE_ARGS ?=
MOBILE_ANDROID_PUBLISH_ARGS ?=
MOBILE_ANDROID_BUNDLE_SCRIPT := $(MOBILE_DIR)/scripts/build-android-bundle.mjs
MOBILE_ANDROID_PUBLISH_SCRIPT := $(MOBILE_DIR)/scripts/publish-android-play.mjs
RELEASE_ARGS ?=
RELEASE_HELPER ?=
PUBLISH_RELEASE_ARGS ?=
RELEASE_ARTIFACT_TARGETS ?= mobile-release-artifacts pages-artifact
RELEASE_TOOL_DIR := $(abspath $(CURDIR)/scripts/release)
PAGES_URL ?= https://threader.mprlab.com/
PAGES_BRANCH ?= gh-pages
PAGES_VERSION ?=
PAGES_DEPLOY_ARGS ?=
MOBILE_PORT ?= 8081
MOBILE_EXPECT ?= /usr/bin/expect
ANDROID_SDK_ROOT ?= $(HOME)/Library/Android/sdk
ANDROID_HOME ?= $(ANDROID_SDK_ROOT)
ANDROID_STUDIO_JAVA_HOME ?= /Applications/Android Studio.app/Contents/jbr/Contents/Home
ANDROID_TOOL_PATH := $(ANDROID_SDK_ROOT)/emulator:$(ANDROID_SDK_ROOT)/platform-tools:$(ANDROID_SDK_ROOT)/cmdline-tools/latest/bin:$(ANDROID_SDK_ROOT)/tools/bin

.PHONY: test ci release mobile-release-artifacts pages-artifact publish-release publish deploy pages-deploy mobile-install mobile-check run-ios run-android build-ios build-android mobile-android-bundle submit-ios submit-android

test:
	npm test
	python3 tests/test_pages_release_pipeline.py

ci: test mobile-check

release:
	@RELEASE_HELPER="$(RELEASE_HELPER)" RELEASE_ARTIFACT_TARGETS="$(RELEASE_ARTIFACT_TARGETS)" "$(RELEASE_TOOL_DIR)/prepare_release.sh" $(RELEASE_ARGS)

mobile-release-artifacts: mobile-check
	@test -n "$(RELEASE_ARTIFACT_DIR)" || { echo "error: RELEASE_ARTIFACT_DIR is required" >&2; exit 1; }
	@asset_dir="$(RELEASE_ARTIFACT_DIR)/payloads/release-assets"; \
	mkdir -p "$$asset_dir"; \
	ANDROID_HOME="$(ANDROID_HOME)" ANDROID_SDK_ROOT="$(ANDROID_SDK_ROOT)" ANDROID_STUDIO_JAVA_HOME="$(ANDROID_STUDIO_JAVA_HOME)" node "$(MOBILE_ANDROID_BUNDLE_SCRIPT)" --mobile-dir "$(MOBILE_DIR)" --build-dir "$(MOBILE_ANDROID_BUILD_DIR)" --android-sdk-root "$(ANDROID_SDK_ROOT)" --version-code "$(MOBILE_ANDROID_VERSION_CODE)" --output "$$asset_dir/social-threader-android-release.aab" $(MOBILE_ANDROID_BUNDLE_ARGS)

pages-artifact:
	@"$(RELEASE_TOOL_DIR)/prepare_pages_artifact.sh" --source . --domain threader.mprlab.com --exclude .git --exclude .github --exclude .gitignore --exclude .DS_Store --exclude AGENTS.md --exclude CHANGELOG.md --exclude LICENSE --exclude Makefile --exclude README.md --exclude configs --exclude doc.md --exclude mobile --exclude node_modules --exclude package-lock.json --exclude package.json --exclude tests

publish-release:
	@RELEASE_HELPER="$(RELEASE_HELPER)" "$(RELEASE_TOOL_DIR)/publish_release.sh" $(PUBLISH_RELEASE_ARGS)

publish: publish-release submit-android
	@echo "==> [publish] Published the prepared release and Android App Bundle"

deploy: pages-deploy

pages-deploy:
	@"$(RELEASE_TOOL_DIR)/deploy_pages_artifact.sh" --branch "$(PAGES_BRANCH)" --url "$(PAGES_URL)" $(if $(PAGES_VERSION),--version "$(PAGES_VERSION)") $(PAGES_DEPLOY_ARGS)

mobile-install:
	@if [ ! -d "$(MOBILE_DIR)/node_modules" ]; then \
		cd "$(MOBILE_DIR)" && $(MOBILE_NPM) install; \
	fi

mobile-check: mobile-install
	@cd "$(MOBILE_DIR)" && $(MOBILE_NPM) run check

run-ios: mobile-install
	@cd "$(MOBILE_DIR)" && SOCIAL_THREADER_MOBILE_EXPECT="$(MOBILE_EXPECT)" SOCIAL_THREADER_MOBILE_PORT="$(MOBILE_PORT)" $(MOBILE_NPM) run ios -- --port "$(MOBILE_PORT)" --clear

run-android: mobile-install
	@cd "$(MOBILE_DIR)" && ANDROID_HOME="$(ANDROID_HOME)" ANDROID_SDK_ROOT="$(ANDROID_SDK_ROOT)" SOCIAL_THREADER_MOBILE_PORT="$(MOBILE_PORT)" PATH="$(ANDROID_TOOL_PATH):$$PATH" $(MOBILE_NPM) run android -- --port "$(MOBILE_PORT)" --localhost --clear

build-ios: mobile-check
	@cd "$(MOBILE_DIR)" && EAS_BUILD_PROFILE="$(MOBILE_IOS_BUILD_PROFILE)" $(MOBILE_EAS) build --platform ios --profile "$(MOBILE_IOS_BUILD_PROFILE)" $(MOBILE_BUILD_ARGS) $(MOBILE_IOS_BUILD_ARGS)

build-android: mobile-android-bundle

mobile-android-bundle: mobile-check
	@echo "==> [mobile-android-bundle] Building signed Social Threader Android App Bundle"
	@ANDROID_HOME="$(ANDROID_HOME)" ANDROID_SDK_ROOT="$(ANDROID_SDK_ROOT)" ANDROID_STUDIO_JAVA_HOME="$(ANDROID_STUDIO_JAVA_HOME)" node "$(MOBILE_ANDROID_BUNDLE_SCRIPT)" --mobile-dir "$(MOBILE_DIR)" --build-dir "$(MOBILE_ANDROID_BUILD_DIR)" --android-sdk-root "$(ANDROID_SDK_ROOT)" --version-code "$(MOBILE_ANDROID_VERSION_CODE)" $(MOBILE_ANDROID_BUNDLE_ARGS)

submit-ios: mobile-check
	@cd "$(MOBILE_DIR)" && $(MOBILE_EAS) submit --platform ios --latest $(MOBILE_SUBMIT_ARGS) $(MOBILE_IOS_SUBMIT_ARGS)

submit-android:
	@echo "==> [submit-android] Submitting Social Threader Android App Bundle to Google Play"
	@artifact_dir="$$(git rev-parse --git-path mprlab-release)"; \
	if [[ "$$artifact_dir" != /* ]]; then artifact_dir="$(CURDIR)/$$artifact_dir"; fi; \
	"$(RELEASE_TOOL_DIR)/release_helper.py" verify-release-artifact --artifact-dir "$$artifact_dir"; \
	node "$(MOBILE_ANDROID_PUBLISH_SCRIPT)" --mobile-dir "$(MOBILE_DIR)" --aab "$$artifact_dir/payloads/release-assets/social-threader-android-release.aab" $(MOBILE_ANDROID_PUBLISH_ARGS)
