package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstallerPreservesTasksAxi(t *testing.T) {
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Fatal(err)
	}
	for _, location := range []string{"destination", "path", "previous-install", "bash-login", "bash-profile", "zsh"} {
		t.Run(location, func(t *testing.T) {
			root := t.TempDir()
			home := filepath.Join(root, "home")
			bindir := filepath.Join(home, ".local", "bin")
			mocks := filepath.Join(root, "mocks")
			for _, dir := range []string{bindir, mocks, filepath.Join(home, ".bun", "bin")} {
				if err := os.MkdirAll(dir, 0755); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.Symlink(bun, filepath.Join(home, ".bun", "bin", "bun")); err != nil {
				t.Fatal(err)
			}
			archive := filepath.Join(root, "release.tar.gz")
			f, err := os.Create(archive)
			if err != nil {
				t.Fatal(err)
			}
			gz := gzip.NewWriter(f)
			tw := tar.NewWriter(gz)
			for name, data := range map[string]string{"bin/tasks-backend": "backend", "bin/tasks-tui": "launcher", "opentui/app.ts": "app"} {
				if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0755, Size: int64(len(data))}); err != nil {
					t.Fatal(err)
				}
				if _, err := tw.Write([]byte(data)); err != nil {
					t.Fatal(err)
				}
			}
			if err := tw.Close(); err != nil {
				t.Fatal(err)
			}
			if err := gz.Close(); err != nil {
				t.Fatal(err)
			}
			if err := f.Close(); err != nil {
				t.Fatal(err)
			}
			curl := "#!/bin/sh\nwhile [ \"$1\" != -o ]; do shift; done\ncp \"$FIXTURE_ARCHIVE\" \"$2\"\n"
			if err := os.WriteFile(filepath.Join(mocks, "curl"), []byte(curl), 0755); err != nil {
				t.Fatal(err)
			}
			dist := filepath.Join(root, "existing", "dist")
			if location == "previous-install" {
				dist = filepath.Join(home, ".local", "share", "tasks-tui", "axi", "node_modules", "tasks-axi", "dist")
			}
			for _, dir := range []string{filepath.Join(dist, "bin"), filepath.Join(dist, "src", "backends")} {
				if err := os.MkdirAll(dir, 0755); err != nil {
					t.Fatal(err)
				}
			}
			for _, name := range []string{"src/view.js", "src/backends/markdown-grammar.js"} {
				if err := os.WriteFile(filepath.Join(dist, name), nil, 0644); err != nil {
					t.Fatal(err)
				}
			}
			executable := filepath.Join(dist, "bin", "tasks-axi")
			if err := os.WriteFile(executable, []byte("#!/bin/sh\nprintf 'existing-version\\n'\n"), 0755); err != nil {
				t.Fatal(err)
			}
			linkDir := bindir
			if location == "path" {
				linkDir = mocks
			}
			link := filepath.Join(linkDir, "tasks-axi")
			if err := os.Symlink(executable, link); err != nil {
				t.Fatal(err)
			}
			if location == "previous-install" {
				oldBin := filepath.Join(home, ".local", "share", "tasks-tui", "bin")
				if err := os.MkdirAll(oldBin, 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(oldBin, "tasks-tui"), []byte("#!/bin/sh\nprintf 'old-viewer\\n'\n"), 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Join(oldBin, "tasks-tui"), filepath.Join(bindir, "tasks-tui")); err != nil {
					t.Fatal(err)
				}
			}
			cmd := exec.Command("sh", "install.sh")
			shell := "/bin/sh"
			if location == "destination" || location == "bash-login" || location == "bash-profile" {
				shell = "/bin/bash"
				if err := os.WriteFile(filepath.Join(bindir, "bun"), []byte("#!/bin/sh\nexit 1\n"), 0755); err != nil {
					t.Fatal(err)
				}
			}
			if location == "zsh" {
				shell = "/bin/zsh"
			}
			loginProfile := ""
			if location == "bash-login" {
				loginProfile = ".bash_login"
			}
			if location == "bash-profile" {
				loginProfile = ".profile"
			}
			if loginProfile != "" {
				if err := os.WriteFile(filepath.Join(home, loginProfile), []byte("export EXISTING_PROFILE=kept\n"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			cmd.Env = append(os.Environ(), "HOME="+home, "SHELL="+shell, "BUN_INSTALL="+filepath.Join(home, ".bun"), "TASKS_TUI_BIN_DIR="+bindir, "FIXTURE_ARCHIVE="+archive, "ZDOTDIR="+home, "PATH="+mocks+":"+os.Getenv("PATH"))
			if location == "previous-install" {
				mv := "#!/bin/sh\ncase \"$1\" in */package) exit 1 ;; esac\nexec /bin/mv \"$@\"\n"
				if err := os.WriteFile(filepath.Join(mocks, "mv"), []byte(mv), 0755); err != nil {
					t.Fatal(err)
				}
				if out, err := cmd.CombinedOutput(); err == nil {
					t.Fatalf("expected failed replacement: %s", out)
				}
				for _, check := range []struct{ path, want string }{{link, "existing-version"}, {filepath.Join(bindir, "tasks-tui"), "old-viewer"}} {
					out, err := exec.Command(check.path).CombinedOutput()
					if err != nil || strings.TrimSpace(string(out)) != check.want {
						t.Fatalf("previous command lost: %s, %v", out, err)
					}
				}
				if err := os.Remove(filepath.Join(mocks, "mv")); err != nil {
					t.Fatal(err)
				}
				cmd = exec.Command("sh", "install.sh")
				cmd.Env = append(os.Environ(), "HOME="+home, "SHELL="+shell, "BUN_INSTALL="+filepath.Join(home, ".bun"), "TASKS_TUI_BIN_DIR="+bindir, "FIXTURE_ARCHIVE="+archive, "ZDOTDIR="+home, "PATH="+mocks+":"+os.Getenv("PATH"))
			}
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("installer failed: %v\n%s", err, out)
			}
			if location == "destination" {
				again := exec.Command("sh", "install.sh")
				again.Env = cmd.Env
				if out, err := again.CombinedOutput(); err != nil {
					t.Fatalf("reinstall failed: %v\n%s", err, out)
				}
				for _, profile := range []string{".bash_profile", ".bashrc"} {
					args := []string{"--noprofile", "--norc", "-c", fmt.Sprintf(". %q; command -v bun; command -v tasks-tui; printf '%%s\\n' \"$PATH\"", filepath.Join(home, profile))}
					if profile == ".bashrc" {
						args = []string{"--noprofile", "--rcfile", filepath.Join(home, profile), "-ic", "command -v bun; command -v tasks-tui; printf '%s\\n' \"$PATH\""}
					}
					session := exec.Command("bash", args...)
					session.Env = append(os.Environ(), "HOME="+home, "PATH=/usr/bin:/bin")
					out, err := session.Output()
					expected := filepath.Join(home, ".bun", "bin") + ":" + bindir + ":/usr/bin:/bin"
					if err != nil || strings.TrimSpace(string(out)) != filepath.Join(home, ".bun", "bin", "bun")+"\n"+filepath.Join(bindir, "tasks-tui")+"\n"+expected {
						t.Fatalf("%s session PATH incorrect: %s, %v", profile, out, err)
					}
				}
			}
			if loginProfile != "" {
				if _, err := os.Stat(filepath.Join(home, ".bash_profile")); !os.IsNotExist(err) {
					t.Fatalf("masked existing profile: %v", err)
				}
				command := fmt.Sprintf(". %q; printf '%%s\\n' \"$EXISTING_PROFILE\"; command -v tasks-tui", filepath.Join(home, loginProfile))
				session := exec.Command("bash", "--noprofile", "--norc", "-c", command)
				session.Env = append(os.Environ(), "HOME="+home, "PATH=/usr/bin:/bin")
				out, err := session.Output()
				if err != nil || strings.TrimSpace(string(out)) != "kept\n"+filepath.Join(bindir, "tasks-tui") {
					t.Fatalf("login profile failed: %s, %v", out, err)
				}
			}
			if location == "zsh" {
				zsh, err := exec.LookPath("zsh")
				if err != nil {
					t.Skip("zsh unavailable")
				}
				for _, args := range [][]string{{"-ic", "command -v tasks-tui; command -v bun"}, {"-lic", "command -v tasks-tui; command -v bun"}} {
					session := exec.Command(zsh, args...)
					session.Env = append(os.Environ(), "HOME="+home, "ZDOTDIR="+home, "PATH=/usr/bin:/bin")
					out, err := session.Output()
					if err != nil || strings.TrimSpace(string(out)) != filepath.Join(bindir, "tasks-tui")+"\n"+filepath.Join(home, ".bun", "bin", "bun") {
						t.Fatalf("zsh session failed: %s, %v", out, err)
					}
				}
			}
			got, err := os.Readlink(link)
			if err != nil || got != executable {
				t.Fatalf("existing link replaced: %q, %v", got, err)
			}
			out, err := exec.Command(link, "--version").CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != "existing-version" {
				t.Fatalf("existing executable failed: %s, %v", out, err)
			}
			if location == "path" {
				if _, err := os.Lstat(filepath.Join(bindir, "tasks-axi")); !os.IsNotExist(err) {
					t.Fatalf("existing PATH command shadowed: %v", err)
				}
			}
		})
	}
}
