MOBILE_DIR ?= mobile
MOBILE_NPM ?= npm
MOBILE_EAS ?= npx eas-cli
MOBILE_BUILD_PROFILE ?= production
MOBILE_IOS_BUILD_PROFILE ?= $(MOBILE_BUILD_PROFILE)
MOBILE_ANDROID_BUILD_PROFILE ?= $(MOBILE_BUILD_PROFILE)
MOBILE_BUILD_ARGS ?=
MOBILE_IOS_BUILD_ARGS ?=
MOBILE_ANDROID_BUILD_ARGS ?=
MOBILE_SUBMIT_ARGS ?=
MOBILE_IOS_SUBMIT_ARGS ?=
MOBILE_ANDROID_SUBMIT_ARGS ?=
MOBILE_PORT ?= 8081
MOBILE_EXPECT ?= /usr/bin/expect
ANDROID_SDK_ROOT ?= $(HOME)/Library/Android/sdk
ANDROID_HOME ?= $(ANDROID_SDK_ROOT)
ANDROID_TOOL_PATH := $(ANDROID_SDK_ROOT)/emulator:$(ANDROID_SDK_ROOT)/platform-tools:$(ANDROID_SDK_ROOT)/cmdline-tools/latest/bin:$(ANDROID_SDK_ROOT)/tools/bin

.PHONY: test ci mobile-install mobile-check run-ios run-android build-ios build-android submit-ios submit-android

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

build-android: mobile-check
	@cd "$(MOBILE_DIR)" && EAS_BUILD_PROFILE="$(MOBILE_ANDROID_BUILD_PROFILE)" $(MOBILE_EAS) build --platform android --profile "$(MOBILE_ANDROID_BUILD_PROFILE)" $(MOBILE_BUILD_ARGS) $(MOBILE_ANDROID_BUILD_ARGS)

submit-ios: mobile-check
	@cd "$(MOBILE_DIR)" && $(MOBILE_EAS) submit --platform ios --latest $(MOBILE_SUBMIT_ARGS) $(MOBILE_IOS_SUBMIT_ARGS)

submit-android: mobile-check
	@cd "$(MOBILE_DIR)" && $(MOBILE_EAS) submit --platform android --latest $(MOBILE_SUBMIT_ARGS) $(MOBILE_ANDROID_SUBMIT_ARGS)
