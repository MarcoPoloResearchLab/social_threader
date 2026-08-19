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
LOCAL_ENV_FILE ?= .env
MOBILE_PORT ?= 8081
MOBILE_EXPECT ?= /usr/bin/expect
ANDROID_SDK_ROOT ?= $(HOME)/Library/Android/sdk
ANDROID_HOME ?= $(ANDROID_SDK_ROOT)
ANDROID_STUDIO_JAVA_HOME ?= /Applications/Android Studio.app/Contents/jbr/Contents/Home
ANDROID_TOOL_PATH := $(ANDROID_SDK_ROOT)/emulator:$(ANDROID_SDK_ROOT)/platform-tools:$(ANDROID_SDK_ROOT)/cmdline-tools/latest/bin:$(ANDROID_SDK_ROOT)/tools/bin

.PHONY: test browser-test go-test go-vet go-format-check shell-check lint go-mod-verify ci release publish deploy local-config local-up local-down local-logs local-smoke container-check mobile-install mobile-check run-ios run-android build-ios build-android mobile-android-bundle submit-ios submit-android

browser-test:
	npm test

go-test:
	go test ./... -count=1 -timeout=45s

go-vet:
	go vet ./...

go-format-check:
	@unformatted_files="$$(gofmt -l cmd internal)"; \
	test -z "$$unformatted_files" || { printf 'Go files require gofmt:\n%s\n' "$$unformatted_files" >&2; exit 1; }

shell-check:
	bash -n scripts/local-smoke.sh

lint: go-vet go-format-check shell-check

go-mod-verify:
	go mod verify

test: browser-test go-test

ci: test lint go-mod-verify mobile-check

release publish deploy:
	@application_root="$$(git rev-parse --show-toplevel)"; \
	gateway_root="$$(dirname "$${application_root}")/mprlab-gateway"; \
	if [ ! -d "$${gateway_root}" ]; then \
		printf "required sibling gateway is missing: %s; clone mprlab-gateway at exactly %s\n" \
			"$${gateway_root}" "$${gateway_root}" >&2; \
		exit 2; \
	fi; \
	$(MAKE) --no-print-directory -C "$${gateway_root}" "app-$@" \
		MPRLAB_APP_ROOT="$${application_root}"

local-config:
	@SOCIAL_THREADER_ENV_FILE="$(LOCAL_ENV_FILE)" docker compose --env-file "$(LOCAL_ENV_FILE)" config --quiet

local-up:
	@test -f "$(LOCAL_ENV_FILE)" || { printf 'missing local environment file: %s\n' "$(LOCAL_ENV_FILE)" >&2; exit 2; }
	@SOCIAL_THREADER_ENV_FILE="$(LOCAL_ENV_FILE)" docker compose --env-file "$(LOCAL_ENV_FILE)" up --build --detach --wait --wait-timeout 120

local-down:
	@SOCIAL_THREADER_ENV_FILE="$(LOCAL_ENV_FILE)" docker compose --env-file "$(LOCAL_ENV_FILE)" down

local-logs:
	@SOCIAL_THREADER_ENV_FILE="$(LOCAL_ENV_FILE)" docker compose --env-file "$(LOCAL_ENV_FILE)" logs --follow

local-smoke:
	@bash scripts/local-smoke.sh

container-check:
	docker build --target api .
	docker build --target fake-llm-proxy .
	docker build --target local-web .
	docker build --target pages .

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
	@node "$(MOBILE_ANDROID_PUBLISH_SCRIPT)" --mobile-dir "$(MOBILE_DIR)" $(MOBILE_ANDROID_PUBLISH_ARGS)
