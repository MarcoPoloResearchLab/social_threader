package deployment_test

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestProductionImageBuildArguments(t *testing.T) {
	const releaseVersionIdentity = "release_version"
	var document struct {
		Selected struct {
			Artifacts struct {
				Images []struct {
					ID    string `yaml:"id"`
					Build struct {
						Arguments []map[string]string `yaml:"arguments"`
					} `yaml:"build"`
				} `yaml:"container_images"`
			} `yaml:"artifacts"`
		} `yaml:"mprlab_resources"`
	}
	manifestBytes := readRepositoryFile(t, findRepositoryRoot(t), ".mprlab/deploy/resources.yml")
	if decodeError := yaml.Unmarshal(manifestBytes, &document); decodeError != nil {
		t.Fatalf("decode image build arguments: %v", decodeError)
	}
	argumentCount := 0
	for _, image := range document.Selected.Artifacts.Images {
		imageID := image.ID
		for _, argument := range image.Build.Arguments {
			argumentName := argument["name"]
			argumentCount++
			t.Run(imageID+"/"+argumentName, func(t *testing.T) {
				if len(argument) != 2 || argumentName == "" {
					t.Fatal("build argument must contain one explicit name and exactly one identity or value")
				}
				if identity, present := argument["identity"]; present {
					if identity != releaseVersionIdentity {
						t.Fatalf("build argument identity = %q, want %q", identity, releaseVersionIdentity)
					}
					return
				}
				value, present := argument["value"]
				if !present || value == "" || value != strings.TrimSpace(value) {
					t.Fatal("build argument must contain a nonempty literal value without surrounding whitespace")
				}
			})
		}
	}
	if argumentCount == 0 {
		t.Fatal("production images must declare build arguments")
	}
}
