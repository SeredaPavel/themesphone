"""Deployment transition checks using fake Docker/HTTP; no VPS or real credentials."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
OLD = 'a' * 40
NEW = 'b' * 40
DOCKER = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
base = pathlib.Path(os.environ['FIXTURE'])
scenario = os.environ.get('SCENARIO', 'success')
with (base / 'docker-calls').open('a') as f:
    f.write(json.dumps(args) + '\n')
if args[0] == 'info': sys.exit(0)
if args[0] == 'exec':
    if scenario == 'promotion_validate_failure' and 'validate' in args: sys.exit(9)
    if scenario == 'promotion_reload_failure' and 'reload' in args and 'reverse_proxy' in (base / 'edge/Caddyfile').read_text(): sys.exit(9)
    sys.exit(0)
if args[:2] == ['image', 'inspect']:
    print(('0' if scenario == 'unsafe_image' else '1') if 'public-proxy-ready' in ' '.join(args) else ('wrong-revision' if scenario == 'bad_revision' else 'b' * 40))
    sys.exit(0)
if args[0] == 'inspect':
    service = 'backend' if args[-1] == 'backend-id' else 'frontend'
    print('ghcr.io/seredapavel/themesphone/' + service + ':' + 'a' * 40)
    sys.exit(0)
if args[0] != 'compose': sys.exit(99)
if 'ps' in args and '-q' in args:
    print('backend-id' if args[-1] == 'themesphone-backend' else 'frontend-id')
    sys.exit(0)
if 'pull' in args and scenario == 'pull_failure': sys.exit(9)
if 'stop' in args: (base / 'stopped').touch()
if 'exec' in args and any('pg_dump' in a for a in args):
    if scenario == 'dump_failure': sys.exit(11)
    sys.stdout.buffer.write(b'PGDMPfake-binary-archive\x00\xff')
    sys.exit(0)
if 'exec' in args and 'pg_restore' in args:
    data = sys.stdin.buffer.read()
    sys.exit(0 if data.startswith(b'PGDMP') and scenario != 'dump_list_failure' else 12)
if 'down' in args: (base / 'preview-stopped').touch()
if 'up' in args and '--env-file' not in args:
    (base / 'preview-restarted').touch()
    sys.exit(0)
if 'up' in args:
    envpath = pathlib.Path(args[args.index('--env-file') + 1])
    tag = next(s.split('=', 1)[1] for s in envpath.read_text().splitlines() if s.startswith('IMAGE_TAG='))
    with (base / 'ups').open('a') as f: f.write(tag + '\n')
    if scenario == 'startup_failure' and tag == 'b' * 40: sys.exit(8)
    if scenario == 'rollback_failure': sys.exit(8)
sys.exit(0)
'''
CURL = r'''#!/usr/bin/env python3
import os, pathlib, sys
base = pathlib.Path(os.environ['FIXTURE'])
scenario = os.environ.get('SCENARIO', 'success')
new = 'IMAGE_TAG=' + 'b' * 40 in (base / 'deployment/.env').read_text()
preview = any(':9443' in arg for arg in sys.argv)
url = sys.argv[-1]
mode_file = base / 'deployment/access-mode'
public_mode = mode_file.exists() and mode_file.read_text().strip() == 'public'
code = '200'
if url.endswith('/_health'): code = '204'
if not preview and 'themesphone' in url and not public_mode: code = '503'
if public_mode and any(url.endswith(p) for p in ['/api/download', '/api/users', '/api/orders']): code = '410'
if scenario == 'promotion_after_stop_failure' and public_mode and (base / 'preview-stopped').exists(): code = '500'
if public_mode and new and scenario == 'unsafe_api' and url.endswith('/api/download'): code = '200'
if scenario == 'preflight_failure': sys.exit(7)
if new and scenario == 'http_failure': sys.exit(22)
if new and scenario == 'public_exposure' and not preview and 'themesphone' in url: code = '200'
with (base / 'curl-calls').open('a') as f: f.write(' '.join(sys.argv[1:]) + '\n')
print(code, end='')
'''

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.deployment = self.base / 'deployment'
        self.deployment.mkdir()
        self.original = 'EXISTING_SETTING=preserved\nIMAGE_TAG=' + OLD + '\n'
        (self.deployment / '.env').write_text(self.original)
        (self.deployment / 'frontend.env').write_text('STRAPI_API_TOKEN=fake-test-value\n')
        (self.deployment / 'compose.yaml').write_text('name: themesphone\n')
        self.uploads = self.base / 'uploads'
        self.uploads.mkdir()
        (self.uploads / 'image.txt').write_text('fake-image')
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        for name, text in [('docker', DOCKER), ('curl', CURL)]:
            p = self.bin / name
            p.write_text(text)
            p.chmod(0o755)
        self.script = self.base / 'deploy-themesphone.sh'
        self.script.write_text(self.rewrite((SOURCE / 'deploy-themesphone.sh').read_text()))
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'],
                        FIXTURE=str(self.base), SSH_ORIGINAL_COMMAND='deploy ' + NEW)

    def rewrite(self, text):
        for old, new in [('/opt/hosting/themesphone', str(self.deployment)),
                         ('/opt/hosting/backups/themesphone/releases', str(self.base / 'snapshots')),
                         ('/opt/hosting-data/themesphone/uploads', str(self.uploads)),
                         ('/run/lock/themesphone-deploy.lock', str(self.base / 'lock'))]:
            text = text.replace(old, new)
        return text

    def run_script(self, scenario='success', command=None):
        env = dict(self.env, SCENARIO=scenario)
        if command is not None: env['SSH_ORIGINAL_COMMAND'] = command
        return subprocess.run(['bash', str(self.script)], env=env, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)

    def ups(self):
        p = self.base / 'ups'
        return p.read_text().splitlines() if p.exists() else []

    def assert_clean(self):
        self.assertEqual(list(self.deployment.glob('.env-next.*')), [])

    def test_check_is_read_only(self):
        result = self.run_script(command='check')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('READY: ThemesPhone', result.stdout)
        self.assertEqual(self.ups(), [])
        self.assertFalse((self.base / 'stopped').exists())

    def test_denied_commands_never_reach_docker(self):
        for cmd in ['', 'bash', 'deploy latest', 'deploy ' + NEW + '; id',
                    'deploy ' + NEW.upper(), 'check extra', 'deploy ' + NEW + '\ncheck']:
            with self.subTest(cmd=cmd):
                self.assertEqual(self.run_script(command=cmd).returncode, 64)
        self.assertFalse((self.base / 'docker-calls').exists())

    def test_success_preserves_settings_and_creates_data_snapshot(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.ups(), [NEW])
        self.assertIn('IMAGE_TAG=' + NEW, (self.deployment / '.env').read_text())
        self.assertIn('EXISTING_SETTING=preserved', (self.deployment / '.env').read_text())
        self.assertEqual((self.deployment / 'previous.env').read_text(), self.original)
        snapshots = list((self.base / 'snapshots').iterdir())
        self.assertEqual(len(snapshots), 1)
        snap = snapshots[0]
        self.assertEqual((snap / '.env').read_text(), self.original)
        self.assertTrue((snap / 'database.dump').read_bytes().startswith(b'PGDMP'))
        subprocess.run(['tar', '-tzf', str(snap / 'uploads.tar.gz')], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(['sha256sum', '-c', 'SHA256SUMS'], cwd=snap, check=True, stdout=subprocess.DEVNULL)
        self.assertEqual(snap.stat().st_mode & 0o777, 0o700)
        calls = [json.loads(s) for s in (self.base / 'docker-calls').read_text().splitlines()]
        stop = next(i for i,c in enumerate(calls) if 'stop' in c)
        dump = next(i for i,c in enumerate(calls) if any('pg_dump' in a for a in c))
        up = next(i for i,c in enumerate(calls) if 'up' in c)
        self.assertLess(stop, dump)
        self.assertLess(dump, up)
        self.assert_clean()

    def test_failures_before_stop_leave_running_release_untouched(self):
        for scenario in ['pull_failure', 'bad_revision', 'preflight_failure']:
            with self.subTest(scenario=scenario):
                result = self.run_script(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.ups(), [])
                self.assertFalse((self.base / 'stopped').exists())
                self.assertEqual((self.deployment / '.env').read_text(), self.original)
                self.assert_clean()

    def test_snapshot_failures_resume_previous_apps_without_switching(self):
        for scenario in ['dump_failure', 'dump_list_failure']:
            with self.subTest(scenario=scenario):
                (self.base / 'ups').unlink(missing_ok=True)
                result = self.run_script(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.ups(), [OLD])
                self.assertEqual((self.deployment / '.env').read_text(), self.original)
                self.assert_clean()

    def test_failed_release_restores_images_but_never_automatically_restores_db(self):
        for scenario in ['startup_failure', 'http_failure', 'public_exposure']:
            with self.subTest(scenario=scenario):
                (self.base / 'ups').unlink(missing_ok=True)
                result = self.run_script(scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.ups(), [NEW, OLD])
                self.assertEqual((self.deployment / '.env').read_text(), self.original)
                self.assertIn('Previous application images and checked HTTPS routes restored.', result.stderr)
                self.assertIn('NOT automatically restored', result.stderr)
                calls = [json.loads(s) for s in (self.base / 'docker-calls').read_text().splitlines()]
                restores = [c for c in calls if 'pg_restore' in c]
                self.assertTrue(all('--list' in c for c in restores))
                self.assert_clean()

    def test_rollback_failure_is_reported(self):
        result = self.run_script('rollback_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.ups(), [NEW, OLD])
        self.assertIn('ROLLBACK FAILED', result.stderr)

    def test_public_mode_does_not_depend_on_preview_listener(self):
        (self.deployment / 'access-mode').write_text('public\n')
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.ups(), [NEW])
        self.assertNotIn('9443', (self.base / 'curl-calls').read_text())

    def test_public_mode_rejects_unsafe_images_before_stop(self):
        (self.deployment / 'access-mode').write_text('public\n')
        result = self.run_script('unsafe_image')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.ups(), [])
        self.assertFalse((self.base / 'stopped').exists())

    def test_public_mode_checks_disabled_endpoints(self):
        (self.deployment / 'access-mode').write_text('public\n')
        result = self.run_script('unsafe_api')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.ups(), [NEW, OLD])

    def test_invalid_access_mode_is_rejected(self):
        (self.deployment / 'access-mode').write_text('invalid\n')
        result = self.run_script()
        self.assertEqual(result.returncode, 65)
        self.assertEqual(self.ups(), [])

    def test_concurrent_deployment_is_rejected(self):
        with (self.base / 'lock').open('w') as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_script()
        self.assertEqual(result.returncode, 75)
        self.assertEqual(self.ups(), [])

    def test_installer_preserves_other_keys_and_does_not_restart(self):
        source = self.base / 'installer'
        source.mkdir()
        (source / 'deploy-themesphone.sh').write_text(self.script.read_text())
        (source / 'compose.yaml').write_text((SOURCE / 'compose.yaml').read_text())
        ssh = self.base / 'ssh'
        ssh.mkdir()
        (ssh / 'authorized_keys').write_text('existing-admin-key\nexisting-geoconverter-key\nexisting-profitsite-key\n')
        key = ssh / 'themesphone_actions'
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key)], check=True)
        installed = self.base / 'installed-deploy'
        text = self.rewrite((SOURCE / 'install-actions-key.sh').read_text())
        text = text.replace('/root/.ssh', str(ssh)).replace('/usr/local/sbin/deploy-themesphone', str(installed))
        installer = source / 'install-actions-key.sh'
        installer.write_text(text)
        for _ in range(2):
            result = subprocess.run(['bash', str(installer), str(key) + '.pub'], env=self.env,
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
        keys = (ssh / 'authorized_keys').read_text()
        for marker in ['existing-admin-key', 'existing-geoconverter-key', 'existing-profitsite-key']:
            self.assertIn(marker + '\n', keys)
        self.assertEqual(keys.count('github-actions-themesphone'), 1)
        self.assertIn('restrict,command="' + str(installed) + '"', keys)
        self.assertEqual((ssh / 'authorized_keys').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.ups(), [])
        self.assertEqual((self.deployment / '.env').read_text(), self.original)
        self.assertEqual(len(list(self.deployment.glob('before-actions-*'))), 2)

class PublicationTests(unittest.TestCase):
    setUp = DeploymentTests.setUp
    rewrite = DeploymentTests.rewrite

    def prepare_publisher(self):
        edge = self.base / 'edge'
        edge.mkdir()
        self.original_caddy = (
            'geoconverter.ru { respond "existing geoconverter" }\n'
            'profitsite.ru { respond "existing profitsite" }\n'
            'themesphone.ru, www.themesphone.ru, themesphone.com, www.themesphone.com, cms.themesphone.ru {\n'
            '    respond "ThemesPhone: сайт восстанавливается." 503\n}\n'
        )
        (edge / 'Caddyfile').write_text(self.original_caddy)
        preview = self.base / 'preview'
        preview.mkdir()
        (preview / 'compose.yaml').write_text('name: themesphone-preview\n')
        installed = self.base / 'installed-deploy'
        installed.write_text(self.script.read_text())
        installed.chmod(0o755)
        source = self.base / 'publisher'
        source.mkdir()
        (source / 'themesphone-public.caddy').write_text((SOURCE / 'themesphone-public.caddy').read_text())
        text = (SOURCE / 'publish-public.sh').read_text()
        text = text.replace('/opt/hosting/themesphone-preview/compose.yaml', str(preview / 'compose.yaml'))
        text = self.rewrite(text)
        text = text.replace('/opt/hosting/edge/conf', str(edge))
        text = text.replace('/opt/hosting/backups', str(self.base / 'backups'))
        text = text.replace('/usr/local/sbin/deploy-themesphone', str(installed))
        self.publisher = source / 'publish-public.sh'
        self.publisher.write_text(text)
        self.edge = edge

    def publish(self, scenario='promotion_success'):
        return subprocess.run(['bash', str(self.publisher)], env=dict(self.env, SCENARIO=scenario),
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)

    def test_publication_preserves_neighbours_and_removes_preview(self):
        self.prepare_publisher()
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.deployment / 'access-mode').read_text(), 'public\n')
        text = (self.edge / 'Caddyfile').read_text()
        self.assertIn('existing geoconverter', text)
        self.assertIn('existing profitsite', text)
        self.assertIn('reverse_proxy themesphone-frontend:3000', text)
        self.assertNotIn('сайт восстанавливается', text)
        self.assertTrue((self.base / 'preview-stopped').exists())

    def test_validation_failure_does_not_change_live_config(self):
        self.prepare_publisher()
        result = self.publish('promotion_validate_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.edge / 'Caddyfile').read_text(), self.original_caddy)
        self.assertFalse((self.deployment / 'access-mode').exists())
        self.assertFalse((self.base / 'preview-stopped').exists())

    def test_reload_failure_restores_placeholder(self):
        self.prepare_publisher()
        result = self.publish('promotion_reload_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.edge / 'Caddyfile').read_text(), self.original_caddy)
        self.assertFalse((self.deployment / 'access-mode').exists())

    def test_failure_after_preview_shutdown_restores_private_access(self):
        self.prepare_publisher()
        result = self.publish('promotion_after_stop_failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.edge / 'Caddyfile').read_text(), self.original_caddy)
        self.assertFalse((self.deployment / 'access-mode').exists())
        self.assertTrue((self.base / 'preview-restarted').exists())

if __name__ == '__main__':
    unittest.main(verbosity=2)
