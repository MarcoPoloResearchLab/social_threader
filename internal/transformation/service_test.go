package transformation_test

import (
	"context"
	"errors"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
)

type fakeCompletionClient struct {
	response string
	err      error
	requests []transformation.Prompt
}

func (client *fakeCompletionClient) Complete(contextValue context.Context, prompt transformation.Prompt) (string, error) {
	if contextError := contextValue.Err(); contextError != nil {
		return "", contextError
	}
	client.requests = append(client.requests, prompt)
	return client.response, client.err
}

func TestServiceReturnsVersionedPlainTextWithoutChangingRequestIdentity(testingInstance *testing.T) {
	completionClient := &fakeCompletionClient{response: "Revised text"}
	service, serviceError := transformation.NewService(completionClient, 100)
	if serviceError != nil {
		testingInstance.Fatalf("new service: %v", serviceError)
	}
	operation, operationError := transformation.ParseOperation("polish")
	if operationError != nil {
		testingInstance.Fatalf("parse operation: %v", operationError)
	}
	response, transformationError := service.Transform(context.Background(), transformation.Request{
		Operation: operation,
		Text:      "Original text",
		RequestID: "request-12345678",
	})
	if transformationError != nil {
		testingInstance.Fatalf("transform: %v", transformationError)
	}
	if response.Text != "Revised text" || response.Operation != operation || response.RequestID != "request-12345678" {
		testingInstance.Fatalf("response=%#v", response)
	}
	if response.TemplateVersion != "polish.v1" {
		testingInstance.Fatalf("template version=%q", response.TemplateVersion)
	}
	if len(completionClient.requests) != 1 {
		testingInstance.Fatalf("completion calls=%d", len(completionClient.requests))
	}
}

func TestServiceRejectsBlankAndOversizedCompletion(testingInstance *testing.T) {
	testCases := []struct {
		name          string
		response      string
		maximumLength int
		expectedError error
	}{
		{name: "blank", response: " \n\t ", maximumLength: 100, expectedError: transformation.ErrBlankCompletion},
		{name: "oversized", response: "123456", maximumLength: 5, expectedError: transformation.ErrResponseTooLarge},
	}

	for _, testCase := range testCases {
		testingInstance.Run(testCase.name, func(subTest *testing.T) {
			completionClient := &fakeCompletionClient{response: testCase.response}
			service, serviceError := transformation.NewService(completionClient, testCase.maximumLength)
			if serviceError != nil {
				subTest.Fatalf("new service: %v", serviceError)
			}
			operation, operationError := transformation.ParseOperation("polish")
			if operationError != nil {
				subTest.Fatalf("parse operation: %v", operationError)
			}
			_, transformationError := service.Transform(context.Background(), transformation.Request{
				Operation: operation,
				Text:      "Source",
				RequestID: "request-12345678",
			})
			if !errors.Is(transformationError, testCase.expectedError) {
				subTest.Fatalf("transformation error=%v", transformationError)
			}
		})
	}
}
