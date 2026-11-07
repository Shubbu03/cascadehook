"""Exercise deployment ordering and recovery without contacting GCP or Docker."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


DEPLOY = Path(__file__).resolve().parents[1]
REVISION = "a" * 40
RELEASE = "20261107T120000Z-aaaaaaaaaaaa-AbCd1234"

# Only external services/privileged commands are faked. Archives, source swaps,
# permissions, stdin redirections, exit traps, and shell control flow are real.
FAKE_COMMAND = r'''
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

command = Path(sys.argv[0]).name
args = sys.argv[1:]
base = Path(os.environ["DEPLOY_TEST_DIR"])
scenario = os.environ["DEPLOY_TEST_SCENARIO"]
state_path = base / "state.json"
state = json.loads(state_path.read_text()) if state_path.exists() else {"timer": True, "running": True, "new": False}
with (base / "calls.jsonl").open("a") as log:
    log.write(json.dumps({"command": command, "args": args, "image": os.environ.get("CASCADEHOOK_SERVER_IMAGE", "")}) + "\n")

def save():
    state_path.write_text(json.dumps(state))

def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)

if command == "id":
    print("operators" if args[0] == "-gn" else "0")
elif command == "getent":
    print(f"deploy-user:x:1000:1000:Deployment user:{base / 'home'}:/bin/bash")
elif command == "flock":
    sys.exit(1 if scenario == "lock_busy" else 0)
elif command in ("chown", "sleep", "go"):
    pass
elif command == "sha256sum":
    checksum, archive = sys.stdin.read().strip().split("  ", 1)
    sys.exit(0 if hashlib.sha256(Path(archive).read_bytes()).hexdigest() == checksum else 1)
elif command == "timeout":
    sys.exit(subprocess.run(args[3:]).returncode)
elif command == "systemctl":
    unit = args[-1]
    if args[0] == "is-active":
        sys.exit(0 if unit.endswith(".timer") and state["timer"] else 3)
    if args[0] in ("start", "stop") and unit.endswith(".timer"):
        state["timer"] = args[0] == "start"
        save()
elif command == "curl":
    if scenario == "readiness_failure":
        fail("readiness failed")
    print('{"status":"ok"}')
elif command == "docker":
    if args[0] == "inspect":
        if args[2] == "{{.Image}}":
            print("sha256:old")
        else:
            print("true false 1 sha256:new" if scenario == "worker_restart" and args[-1] == "new-worker" else "true false 0 sha256:new")
    elif args[:2] == ["image", "inspect"]:
        print("sha256:new")
    elif args[:2] == ["image", "tag"]:
        pass
    elif args[0] == "ps":
        print("old-janitor")
    elif args[0] == "stop":
        pass
    elif args[0] == "compose":
        offset = 1
        while args[offset].startswith("-"):
            offset += 2
        action = args[offset]
        options = args[offset + 1:]
        if action == "ps" and "-q" in options:
            service = options[-1]
            if service == "postgres":
                print("postgres")
            elif state["running"] or "-a" in options:
                print(("new-" if state["new"] else "old-") + service)
        elif action == "build":
            if state["running"] is not True or (scenario != "inactive_timer" and state["timer"] is not True):
                fail("build must happen before the maintenance window")
            if scenario == "build_failure":
                fail("build failed")
        elif action == "stop":
            state["running"] = False
            save()
        elif action == "up":
            state["running"] = True
            state["new"] = "--force-recreate" in options
            save()
        elif action == "exec" and "pg_dump" in options:
            if "--interactive=false" not in options or sys.stdin.buffer.read():
                fail("dump must have closed stdin")
            if scenario == "backup_failure":
                fail("dump failed")
            sys.stdout.buffer.write(b"PGDMP test archive")
        elif action == "exec" and "pg_restore" in options:
            if "--interactive=false" in options or not sys.stdin.buffer.read().startswith(b"PGDMP"):
                fail("pg_restore must receive the dump on stdin")
            if scenario == "invalid_backup":
                fail("invalid archive")
            print("; test archive contents")
        elif action == "run":
            if scenario == "migration_failure":
                fail("migration failed after a prior migration committed")
    else:
        fail("unexpected docker invocation")
elif command == "git":
    if "--show-toplevel" in args:
        print(base / "repo")
    elif args[0] == "status":
        if scenario == "dirty_source":
            print(" M apps/server/go.mod")
    elif args[0] == "rev-parse":
        print("a" * 40)
    elif args[0] == "archive":
        output = next(arg.split("=", 1)[1] for arg in args if arg.startswith("--output="))
        with tarfile.open(output, "w:gz") as bundle:
            content = b"module cascadehook\n"
            entry = tarfile.TarInfo("apps/server/go.mod")
            entry.size = len(content)
            bundle.addfile(entry, io.BytesIO(content))
    elif args[0] == "show":
        print("#!/bin/bash\nexit 0")
elif command == "gcloud":
    if args[1:3] == ["instances", "list"]:
        print("us-central1-a")
    elif args[1] == "ssh":
        sys.exit(1 if scenario == "remote_failure" else 0)
    elif args[1] == "scp" and "--recurse" in args:
        if scenario == "copy_failure":
            fail("backup download failed")
else:
    fail("unexpected command: " + command)
'''


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="cascadehook-deploy-test-")
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.home = self.base / "home"
        self.home.mkdir()
        self.env = dict(os.environ, HOME=str(self.home), DEPLOY_TEST_DIR=str(self.base),
                        PATH=f"{self.bin}:{os.environ['PATH']}", SUDO_USER="deploy-user")
        for command in ("docker", "curl", "systemctl", "timeout", "chown", "id",
                        "flock", "sleep", "sha256sum", "git", "gcloud", "go", "getent"):
            executable = self.bin / command
            executable.write_text(f"#!{sys.executable}\n" + FAKE_COMMAND)
            executable.chmod(0o700)

    def calls(self):
        return [json.loads(line) for line in (self.base / "calls.jsonl").read_text().splitlines()]

    def run_vm(self, scenario):
        root = self.base / "live"
        (root / "apps/server").mkdir(parents=True)
        (root / "deploy").mkdir()
        (root / "apps/server/deleted.go").write_text("old source")
        (root / "deploy/compose.yaml").write_text("old compose")
        (root / "deploy/.env").write_text("PRIVATE=keep-me\n")
        payload = self.base / "payload"
        (payload / "apps/server").mkdir(parents=True)
        (payload / "deploy").mkdir()
        (payload / "apps/server/Dockerfile").write_text("new Dockerfile")
        (payload / "apps/server/main.go").write_text("new source")
        (payload / "deploy/compose.yaml").write_text("new compose")
        archive = self.base / "release.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            bundle.add(payload / "apps", arcname="apps")
            bundle.add(payload / "deploy", arcname="deploy")
        script = (DEPLOY / "backend-vm.sh").read_text()
        script = script.replace("/opt/cascadehook", str(root))
        runner = self.base / "runner.sh"
        runner.write_text(script)
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        if scenario == "checksum_failure":
            checksum = "0" * 64
        if scenario == "inactive_timer":
            (self.base / "state.json").write_text(json.dumps({"timer": False, "running": True, "new": False}))
        self.env["DEPLOY_TEST_SCENARIO"] = scenario
        self.result = subprocess.run(["/bin/bash", str(runner), str(archive), checksum, REVISION, RELEASE],
                                     env=self.env, capture_output=True, text=True, timeout=30)
        return root, self.home / "cascadehook-backups" / RELEASE

    def state(self):
        return json.loads((self.base / "state.json").read_text())

    def test_success_replaces_deleted_files_and_preserves_environment(self):
        root, backup = self.run_vm("success")
        self.assertEqual(self.result.returncode, 0, self.result.stderr)
        self.assertFalse((root / "apps/server/deleted.go").exists())
        self.assertEqual((root / "apps/server/main.go").read_text(), "new source")
        self.assertEqual((root / "deploy/.env").read_text(), "PRIVATE=keep-me\n")
        self.assertEqual((root / "deploy/.backend-release").read_text().strip(), REVISION)
        self.assertTrue((backup / "database.dump").stat().st_size)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
        self.assertEqual((backup / "janitor-timer-before").read_text().strip(), "active")
        with tarfile.open(backup / "server-files.tar.gz") as snapshot:
            self.assertEqual(snapshot.extractfile("deploy/.env").read(), b"PRIVATE=keep-me\n")
            self.assertIn("apps/server/deleted.go", snapshot.getnames())
        self.assertEqual(self.state(), {"timer": True, "running": True, "new": True})
        builds = [c for c in self.calls() if c["command"] == "docker" and "build" in c["args"]]
        self.assertEqual(builds[0]["image"], f"cascadehook-server:release-{RELEASE}")

    def test_failed_build_leaves_old_services_and_source(self):
        root, _ = self.run_vm("build_failure")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertTrue((root / "apps/server/deleted.go").exists())
        self.assertFalse(any("stop" in c["args"] for c in self.calls()))

    def test_lock_blocks_overlapping_deployments(self):
        self.run_vm("lock_busy")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertFalse(any(c["command"] == "docker" for c in self.calls()))

    def test_checksum_failure_stops_before_changes(self):
        self.run_vm("checksum_failure")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertIn("Archive checksum mismatch", self.result.stderr)
        self.assertFalse(any(c["command"] == "docker" for c in self.calls()))

    def test_inactive_janitor_timer_stays_inactive(self):
        _, backup = self.run_vm("inactive_timer")
        self.assertEqual(self.result.returncode, 0, self.result.stderr)
        self.assertEqual(self.state(), {"timer": False, "running": True, "new": True})
        self.assertEqual((backup / "janitor-timer-before").read_text().strip(), "inactive")

    def test_failed_backup_recovers_previous_services(self):
        root, _ = self.run_vm("backup_failure")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertEqual(self.state(), {"timer": True, "running": True, "new": False})
        self.assertEqual((root / "deploy/compose.yaml").read_text(), "old compose")
        self.assertFalse(any("run" in c["args"] for c in self.calls()))

    def test_invalid_archive_blocks_migrations_and_recovers(self):
        self.run_vm("invalid_backup")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertEqual(self.state(), {"timer": True, "running": True, "new": False})
        self.assertFalse(any("run" in c["args"] for c in self.calls()))

    def test_failed_migration_keeps_services_and_janitor_paused(self):
        root, backup = self.run_vm("migration_failure")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertEqual(self.state(), {"timer": False, "running": False, "new": False})
        self.assertTrue((root / "apps/server/deleted.go").exists())
        self.assertTrue((backup / "database.dump").exists())
        self.assertIn("No automatic schema/image rollback", self.result.stderr)

    def test_readiness_failure_does_not_restart_old_image(self):
        self.run_vm("readiness_failure")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertEqual(self.state(), {"timer": False, "running": True, "new": True})

    def test_restarting_worker_fails_deployment(self):
        self.run_vm("worker_restart")
        self.assertNotEqual(self.result.returncode, 0)
        self.assertIn("worker exited, restarted", self.result.stderr)
        self.assertFalse(self.state()["timer"])

    def run_local(self, scenario):
        repo = self.base / "repo"
        (repo / "deploy").mkdir(parents=True)
        (repo / "apps/server").mkdir(parents=True)
        script = repo / "deploy/backend.sh"
        script.write_text((DEPLOY / "backend.sh").read_text())
        if scenario != "missing_config":
            settings = "GCP_PROJECT_ID=example-project\nGCP_VM_NAME=example-backend\nGCP_VM_USER=deploy-user\n"
            if scenario == "config_as_data":
                settings = settings.replace("example-project", f"$(touch {self.base / 'executed-config'})")
            (repo / "deploy/.env.backend").write_text(settings)
        self.env["DEPLOY_TEST_SCENARIO"] = scenario
        return subprocess.run(["/bin/bash", str(script)], env=self.env,
                              capture_output=True, text=True, timeout=30)

    def test_dirty_backend_stops_before_network_access(self):
        result = self.run_local("dirty_source")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Commit or stash", result.stderr)
        self.assertFalse(any(c["command"] == "gcloud" for c in self.calls()))

    def test_missing_config_stops_before_network_access(self):
        result = self.run_local("missing_config")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Copy deploy/.env.backend.example", result.stderr)
        self.assertFalse(any(c["command"] == "gcloud" for c in self.calls()))

    def test_config_values_are_data_and_never_executed(self):
        result = self.run_local("config_as_data")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.base / "executed-config").exists())
        self.assertTrue(any(f"--project=$(touch {self.base / 'executed-config'})" in c["args"] for c in self.calls()))

    def test_local_success_uploads_then_deploys_then_downloads_backup(self):
        result = self.run_local("success")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [c for c in self.calls() if c["command"] == "gcloud"]
        self.assertEqual([c["args"][1] for c in calls], ["instances", "scp", "ssh", "scp"])
        self.assertIn("sudo -n bash", " ".join(calls[2]["args"]))
        self.assertIn("--recurse", calls[3]["args"])
        self.assertTrue(all("--project=example-project" in c["args"] for c in calls))
        self.assertIn("deploy-user@example-backend", calls[2]["args"])

    def test_remote_failure_still_downloads_backup(self):
        result = self.run_local("remote_failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(c["command"] == "gcloud" and "--recurse" in c["args"] for c in self.calls()))

    def test_backup_copy_failure_is_reported_after_deployment(self):
        result = self.run_local("copy_failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Backup copy failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
