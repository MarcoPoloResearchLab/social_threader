package deployment_test

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestProductionImageBuildArguments(t *testing.T) {
	const releaseVersionIdentity = "release_version"
	var document struct {
		Resources struct {
			Resources []struct {
				ID     string `yaml:"id"`
				Images []struct {
					ID    string `yaml:"id"`
					Build struct {
						Arguments map[string]map[string]string `yaml:"arguments"`
					} `yaml:"build"`
				} `yaml:"images"`
			} `yaml:"resources"`
		} `yaml:"mprlab_resources"`
	}
	manifestBytes := readRepositoryFile(t, findRepositoryRoot(t), ".mprlab/deploy/resources.yml")
	if decodeError := yaml.Unmarshal(manifestBytes, &document); decodeError != nil {
		t.Fatalf("decode image build arguments: %v", decodeError)
	}
	argumentCount := 0
	for _, resource := range document.Resources.Resources {
		for _, image := range resource.Images {
			for argumentName, argument := range image.Build.Arguments {
				argumentCount++
				t.Run(resource.ID+"/"+image.ID+"/"+argumentName, func(t *testing.T) {
					if len(argument) != 1 {
						t.Fatal("build argument must contain exactly one identity or value")
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
	}
	if argumentCount == 0 {
		t.Fatal("production images must declare build arguments")
	}
}
