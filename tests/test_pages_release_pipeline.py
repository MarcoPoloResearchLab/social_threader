+from __future__ import annotations

import json
import os
import pathlib
import subprocess
import tarfile
import tempfile
import unittest


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE_SCRIPTS = REPOSITORY_ROOT / "scripts" / "release"
RELEASE_HELPER = RELEASE_SCRIPTS / "release_helper.py"
PREPARE_RELEASE = RELEASE_SCRIPTS / "prepare_release.sh"
PREPARE_PAGES = RELEASE_SCRIPTS / "prepare_pages_artifact.sh"
DEPLOY_PAGES = RELEASE_SCRIPTS / "deploy_pages_artifact.sh"


class PagesReleasePipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary_directory.name)
        self.remote = self.root / "origin.git"
        self.repository = self.root / "repository"

        self.command("git", "init", "--bare", str(self.remote), cwd=self.root)
        self.command("git", "clone", str(self.remote), str(self.repository), cwd=self.root)
        self.command("git", "config", "user.name", "Pages Release Test", cwd=self.repository)
        self.command(
            "git",
            "config",
            "user.email",
            "pages-release-test@example.invalid",
            cwd=self.repository,
        )

        site_directory = self.repository / "site"
        site_directory.mkdir()
        (site_directory / "index.html").write_text(
            "<!doctype html><title>Pages release fixture</title>\n",
            encoding="utf-8",
        )
        (self.repository / "Makefile").write_text(
            "ci:\n\t@true\n\n"
            "pages-artifact:\n"
            f'\t@"{PREPARE_PAGES}" --source site\n',
            encoding="utf-8",
        )
        self.command("git", "add", "Makefile", "site/index.html", cwd=self.repository)
        self.command("git", "commit", "-m", "Add Pages fixture", cwd=self.repository)
        self.command("git", "branch", "-M", "master", cwd=self.repository)
        self.command("git", "push", "-u", "origin", "master", cwd=self.repository)
        self.command(
            "git",
            "symbolic-ref",
            "HEAD",
            "refs/heads/master",
            cwd=self.remote,
            git_dir=True,
        )
        self.command("git", "remote", "set-head", "origin", "-a", cwd=self.repository)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def command(
        self,
        *command: str,
        cwd: pathlib.Path,
        check: bool = True,
        git_dir: bool = False,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        actual_command = list(command)
        if git_dir:
            actual_command = [actual_command[0], f"--git-dir={cwd}", *actual_command[1:]]
            cwd = self.root
        return subprocess.run(
            actual_command,
            cwd=cwd,
            check=check,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )

    def test_pages_artifact_and_public_marker_use_source_commit(self) -> None:
        release_environment = os.environ.copy()
        release_environment["RELEASE_HELPER"] = str(RELEASE_HELPER)
        release_environment["RELEASE_ARTIFACT_TARGETS"] = "pages-artifact"
        self.command(
            str(PREPARE_RELEASE),
            "--version",
            "v1.2.0",
            cwd=self.repository,
            env=release_environment,
        )

        source_commit = self.command(
            "git", "rev-parse", "HEAD^", cwd=self.repository
        ).stdout.strip()
        release_commit = self.command(
            "git", "rev-parse", "HEAD", cwd=self.repository
        ).stdout.strip()
        self.assertNotEqual(source_commit, release_commit)

        artifact_directory = pathlib.Path(
            self.command(
                "git",
                "rev-parse",
                "--git-path",
                "mprlab-release",
                cwd=self.repository,
            ).stdout.strip()
        )
        if not artifact_directory.is_absolute():
            artifact_directory = self.repository / artifact_directory

        manifest = json.loads(
            (artifact_directory / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["source_commit"], source_commit)
        self.assertEqual(manifest["release_commit"], release_commit)

        pages_archive_path = (
            artifact_directory / "payloads" / "release-assets" / "pages.tar.gz"
        )
        with tarfile.open(pages_archive_path, "r:gz") as pages_archive:
            members = {
                member.name.removeprefix("./"): member
                for member in pages_archive.getmembers()
            }
            self.assertIn(".nojekyll", members)
            self.assertEqual(members[".nojekyll"].size, 0)
            marker_file = pages_archive.extractfile(
                members[".mprlab-release.json"]
            )
            self.assertIsNotNone(marker_file)
            marker = json.load(marker_file)

        self.assertEqual(marker["source_commit"], source_commit)
        self.command(
            "git",
            "push",
            "origin",
            "HEAD:refs/heads/master",
            cwd=self.repository,
        )
        self.command(
            "git",
            "push",
            "origin",
            "refs/tags/v1.2.0:refs/tags/v1.2.0",
            cwd=self.repository,
        )

        fake_bin = self.root / "fake-bin"
        fake_bin.mkdir()
        fake_gh = fake_bin / "gh"
        fake_gh.write_text(
            "#!/bin/sh\n"
            "set -eu\n"
            "destination=''\n"
            "while [ \"$#\" -gt 0 ]; do\n"
            "  if [ \"$1\" = '--dir' ]; then destination=\"$2\"; shift 2; else shift; fi\n"
            "done\n"
            "cp \"$FAKE_RELEASE_DIR/manifest.json\" \"$destination/manifest.json\"\n"
            "cp \"$FAKE_RELEASE_DIR/payloads/release-assets/pages.tar.gz\" \"$destination/pages.tar.gz\"\n",
            encoding="utf-8",
        )
        fake_curl = fake_bin / "curl"
        fake_curl.write_text(
            "#!/bin/sh\nset -eu\ncat \"$FAKE_PAGES_MARKER\"\n",
            encoding="utf-8",
        )
        fake_gh.chmod(0o755)
        fake_curl.chmod(0o755)

        public_marker_path = self.root / "public-marker.json"
        public_marker_path.write_text(json.dumps(marker), encoding="utf-8")
        deploy_environment = os.environ.copy()
        deploy_environment["PATH"] = (
            f"{fake_bin}{os.pathsep}{deploy_environment['PATH']}"
        )
        deploy_environment["FAKE_RELEASE_DIR"] = str(artifact_directory)
        deploy_environment["FAKE_PAGES_MARKER"] = str(public_marker_path)
        deploy_environment["PAGES_VERIFY_ATTEMPTS"] = "1"
        deploy_environment["PAGES_VERIFY_DELAY_SECONDS"] = "0"

        accepted = self.command(
            str(DEPLOY_PAGES),
            "--version",
            "v1.2.0",
            "--url",
            "https://pages.example.invalid",
            "--skip-configure",
            cwd=self.repository,
            env=deploy_environment,
        )
        self.assertIn(
            f"Verified https://pages.example.invalid at source {source_commit}.",
            accepted.stdout,
        )
        self.assertNotIn(release_commit, accepted.stdout)

        public_marker_path.write_text(
            json.dumps({**marker, "source_commit": release_commit}),
            encoding="utf-8",
        )
        rejected = self.command(
            str(DEPLOY_PAGES),
            "--version",
            "v1.2.0",
            "--url",
            "https://pages.example.invalid",
            "--skip-configure",
            cwd=self.repository,
            env=deploy_environment,
            check=False,
        )
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn(f"source {source_commit}", rejected.stderr)


if __name__ == "__main__":
    unittest.main()

