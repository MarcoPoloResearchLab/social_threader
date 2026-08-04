package transformation_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

func TestPromptCatalogBuildsVersionedOperationSpecificMessages(testingInstance *testing.T) {
	testCases := []struct {
		operation       string
		templateVersion string
		requiredPhrase  string
	}{
		{operation: "polish", templateVersion: "polish.v1", requiredPhrase: "approximate length"},
		{operation: "expand", templateVersion: "expand.v1", requiredPhrase: "connective detail"},
		{operation: "punch_up", templateVersion: "punch_up.v1", requiredPhrase: "opening hook"},
	}

	for _, testCase := range testCases {
		testingInstance.Run(testCase.operation, func(subTest *testing.T) {
			operation, operationError := transformation.ParseOperation(testCase.operation)
			if operationError != nil {
				subTest.Fatalf("parse operation: %v", operationError)
			}
			prompt, promptError := transformation.BuildPrompt(operation, "Original @name https://example.com #topic")
			if promptError != nil {
				subTest.Fatalf("build prompt: %v", promptError)
			}
			if prompt.TemplateVersion != testCase.templateVersion {
				subTest.Fatalf("template version=%q", prompt.TemplateVersion)
			}
			if len(prompt.Messages) != 2 || prompt.Messages[0].Role != "system" || prompt.Messages[1].Role != "user" {
				subTest.Fatalf("messages=%#v", prompt.Messages)
			}
			combinedPrompt := prompt.Messages[0].Content + "\n" + prompt.Messages[1].Content
			for _, requiredText := range []string{
				"source material",
				"Preserve the source language",
				"named entities",
				"URLs",
				"mentions",
				"hashtags",
				"Do not invent facts",
				"Return only the revised thread text",
				testCase.requiredPhrase,
			} {
				if !strings.Contains(combinedPrompt, requiredText) {
					subTest.Fatalf("prompt omitted %q", requiredText)
				}
			}
		})
	}
}

func TestPromptFixtureCorpusPreservesEverySourceExactly(testingInstance *testing.T) {
	fixtures := loadPromptFixtures(testingInstance)
	for _, fixture := range fixtures {
		fixture := fixture
		testingInstance.Run(fixture.ID, func(subTest *testing.T) {
			for _, operationValue := range []string{"polish", "expand", "punch_up"} {
				operation, operationError := transformation.ParseOperation(operationValue)
				if operationError != nil {
					subTest.Fatalf("parse operation %s: %v", operationValue, operationError)
				}
				prompt, promptError := transformation.BuildPrompt(operation, fixture.Text)
				if promptError != nil {
					subTest.Fatalf("build %s prompt: %v", operationValue, promptError)
				}
				if len(prompt.Messages) != 2 {
					subTest.Fatalf("%s message count=%d", operationValue, len(prompt.Messages))
				}
				expectedUserMessage := "SOURCE TEXT BEGIN\n" + fixture.Text + "\nSOURCE TEXT END"
				if prompt.Messages[1].Content != expectedUserMessage {
					subTest.Fatalf("%s changed fixture source at the prompt boundary", operationValue)
				}
				if strings.Contains(prompt.Messages[0].Content, fixture.Text) {
					subTest.Fatalf("%s copied fixture source into the system contract", operationValue)
				}
			}
		})
	}
}

func TestParseOperationRejectsUnknownValue(testingInstance *testing.T) {
	for _, operationValue := range []string{"", "POLISH", "translate", "punch-up"} {
		if _, operationError := transformation.ParseOperation(operationValue); operationError == nil {
			testingInstance.Fatalf("expected rejection for %q", operationValue)
		}
	}
}

func TestBuildPromptRejectsInvalidDomainValue(testingInstance *testing.T) {
	if _, promptError := transformation.BuildPrompt(transformation.Operation("translate"), "Source"); promptError == nil {
		testingInstance.Fatal("expected invalid operation error")
	}
}

type promptFixture struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

func loadPromptFixtures(testingInstance *testing.T) []promptFixture {
	testingInstance.Helper()
	_, currentFile, _, callerOK := runtime.Caller(0)
	if !callerOK {
		testingInstance.Fatal("cannot resolve prompt fixture path")
	}
	fixturePath := filepath.Join(filepath.Dir(currentFile), "testdata", "prompt-fixtures.json")
	fixtureBytes, readError := os.ReadFile(fixturePath)
	if readError != nil {
		testingInstance.Fatalf("read prompt fixtures: %v", readError)
	}
	var fixtures []promptFixture
	if decodeError := json.Unmarshal(fixtureBytes, &fixtures); decodeError != nil {
		testingInstance.Fatalf("decode prompt fixtures: %v", decodeError)
	}
	if len(fixtures) == 0 {
		testingInstance.Fatal("prompt fixture corpus is empty")
	}
	return fixtures
}
