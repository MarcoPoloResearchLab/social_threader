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
MOBILE_PORT ?= 8081
MOBILE_EXPECT ?= /usr/bin/expect
ANDROID_SDK_ROOT ?= $(HOME)/Library/Android/sdk
ANDROID_HOME ?= $(ANDROID_SDK_ROOT)
ANDROID_STUDIO_JAVA_HOME ?= /Applications/Android Studio.app/Contents/jbr/Contents/Home
ANDROID_TOOL_PATH := $(ANDROID_SDK_ROOT)/emulator:$(ANDROID_SDK_ROOT)/platform-tools:$(ANDROID_SDK_ROOT)/cmdline-tools/latest/bin:$(ANDROID_SDK_ROOT)/tools/bin

.PHONY: test ci mobile-install mobile-check run-ios run-android build-ios build-android mobile-android-bundle submit-ios submit-android

test:
	npm test

ci: test mobile-check

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

submit-android: mobile-android-bundle
	@echo "==> [submit-android] Submitting Social Threader Android App Bundle to Google Play"
	@node "$(MOBILE_ANDROID_PUBLISH_SCRIPT)" --mobile-dir "$(MOBILE_DIR)" $(MOBILE_ANDROID_PUBLISH_ARGS)
