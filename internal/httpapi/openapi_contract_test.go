package httpapi_test

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"

	"github.com/MarcoPoloResearchLab/social_threader/internal/transformation"
	"gopkg.in/yaml.v3"
)

func TestOpenAPIContractUsesTheClosedApplicationResource(testingInstance *testing.T) {
	contractBytes := readOpenAPIContract(testingInstance)
	var contract map[string]any
	if decodeError := yaml.Unmarshal(contractBytes, &contract); decodeError != nil {
		testingInstance.Fatalf("decode OpenAPI contract: %v", decodeError)
	}
	if contract["openapi"] != "3.1.0" {
		testingInstance.Fatalf("OpenAPI version=%v", contract["openapi"])
	}

	paths := requireStringMap(testingInstance, contract["paths"], "paths")
	expectedPaths := []string{"/healthz", "/v1/thread-transformations"}
	actualPaths := sortedMapKeys(paths)
	if !reflect.DeepEqual(actualPaths, expectedPaths) {
		testingInstance.Fatalf("OpenAPI paths=%v", actualPaths)
	}

	components := requireStringMap(testingInstance, contract["components"], "components")
	schemas := requireStringMap(testingInstance, components["schemas"], "components.schemas")
	requestSchema := requireStringMap(testingInstance, schemas["TransformationRequest"], "TransformationRequest")
	if requestSchema["additionalProperties"] != false {
		testingInstance.Fatal("TransformationRequest must reject unknown fields")
	}
	properties := requireStringMap(testingInstance, requestSchema["properties"], "TransformationRequest.properties")
	operationSchema := requireStringMap(testingInstance, properties["operation"], "TransformationRequest.operation")
	operationValues := requireStringSlice(testingInstance, operationSchema["enum"], "TransformationRequest.operation.enum")
	expectedOperations := []string{"expand", "polish", "punch_up"}
	sort.Strings(operationValues)
	if !reflect.DeepEqual(operationValues, expectedOperations) {
		testingInstance.Fatalf("OpenAPI operations=%v", operationValues)
	}
	for _, operationValue := range operationValues {
		if _, operationError := transformation.ParseOperation(operationValue); operationError != nil {
			testingInstance.Fatalf("OpenAPI operation %q is not in the server catalog", operationValue)
		}
	}
}

func readOpenAPIContract(testingInstance *testing.T) []byte {
	testingInstance.Helper()
	_, currentFile, _, callerOK := runtime.Caller(0)
	if !callerOK {
		testingInstance.Fatal("cannot resolve OpenAPI contract path")
	}
	contractPath := filepath.Join(filepath.Dir(currentFile), "..", "..", "api", "openapi.yml")
	contractBytes, readError := os.ReadFile(contractPath)
	if readError != nil {
		testingInstance.Fatalf("read OpenAPI contract: %v", readError)
	}
	return contractBytes
}

func requireStringMap(testingInstance *testing.T, value any, fieldName string) map[string]any {
	testingInstance.Helper()
	typedValue, valueOK := value.(map[string]any)
	if !valueOK {
		testingInstance.Fatalf("%s is not an object", fieldName)
	}
	return typedValue
}

func requireStringSlice(testingInstance *testing.T, value any, fieldName string) []string {
	testingInstance.Helper()
	untypedValues, valuesOK := value.([]any)
	if !valuesOK {
		testingInstance.Fatalf("%s is not an array", fieldName)
	}
	values := make([]string, 0, len(untypedValues))
	for _, untypedValue := range untypedValues {
		typedValue, valueOK := untypedValue.(string)
		if !valueOK {
			testingInstance.Fatalf("%s contains a non-string value", fieldName)
		}
		values = append(values, typedValue)
	}
	return values
}

func sortedMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
