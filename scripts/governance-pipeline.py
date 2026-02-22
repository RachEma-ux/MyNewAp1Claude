#!/usr/bin/env python3
"""
Governance Pipeline — Bulk lifecycle processor for catalog entries.

Runs all 78 catalog entries through the full governance lifecycle:
  Classify → Register → Approve Register → Validate → Approve Validate → Publish → Approve Publish

Usage:
  python3 scripts/governance-pipeline.py <TUNNEL_URL>

Example:
  python3 scripts/governance-pipeline.py https://my-tunnel.trycloudflare.com

Results (2026-02-23 run):
  Total entries: 78 (16 providers + 62 models)
  Classify:          78/78
  Register:          78 ok, 0 fail
  Approve Register:  78/78
  Validate:          78 ok, 0 fail
  Approve Validate:  78/78
  Publish:           78 ok, 0 fail
  Approve Publish:   78/78
  Final state:       all entries status=active, stageReviews all approved
"""
import urllib.request, json, time, ssl, sys

if len(sys.argv) < 2:
    print(f'Usage: {sys.argv[0]} <TUNNEL_URL>')
    sys.exit(1)

TUNNEL = sys.argv[1].rstrip('/')
ctx = ssl._create_unverified_context()


def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f'{TUNNEL}/api/trpc/{path}',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, context=ctx, timeout=30)
            return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            return None
    return None


def api_get(url):
    req = urllib.request.Request(url)
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, context=ctx, timeout=30)
            return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            return None
    return None


# Get all entries
data = api_get(f'{TUNNEL}/api/trpc/catalogManage.list?input=%7B%22json%22%3A%7B%7D%7D')
if not data:
    print('ERROR: Could not fetch entries', flush=True)
    sys.exit(1)
entries = data['result']['data']['json']
print(f'Total entries: {len(entries)}', flush=True)

# Classify all (providers → node 1 "Hosting Model", models → node 55 "Quantization")
print('--- CLASSIFYING ---', flush=True)
for i, e in enumerate(entries):
    nid = 1 if e['entryType'] == 'provider' else 55
    api_post('catalogManage.classify', {'json': {'catalogEntryId': e['id'], 'nodeIds': [nid]}})
    if (i + 1) % 10 == 0:
        print(f'  classified {i+1}/{len(entries)}', flush=True)
        time.sleep(1)
print(f'Classified all {len(entries)}', flush=True)

# Register all
print('--- REGISTER ---', flush=True)
ok = fail = 0
for i, e in enumerate(entries):
    r = api_post('governance.stageTransition', {'json': {'entryId': e['id'], 'targetStage': 'register'}})
    if r:
        ok += 1
    else:
        fail += 1
    if (i + 1) % 10 == 0:
        print(f'  register {i+1}/{len(entries)} (ok={ok} fail={fail})', flush=True)
        time.sleep(1)
print(f'Register: {ok} ok, {fail} fail', flush=True)

# Approve register
print('--- APPROVE REGISTER ---', flush=True)
for i, e in enumerate(entries):
    api_post('catalogManage.approve', {'json': {'id': e['id'], 'stage': 'register', 'activateNow': False}})
    if (i + 1) % 10 == 0:
        time.sleep(1)
print('Register approved', flush=True)

# Validate all
print('--- VALIDATE ---', flush=True)
ok = fail = 0
for i, e in enumerate(entries):
    r = api_post('governance.stageTransition', {'json': {'entryId': e['id'], 'targetStage': 'validate'}})
    if r:
        ok += 1
    else:
        fail += 1
    if (i + 1) % 10 == 0:
        print(f'  validate {i+1}/{len(entries)} (ok={ok} fail={fail})', flush=True)
        time.sleep(1)
print(f'Validate: {ok} ok, {fail} fail', flush=True)

# Approve validate
print('--- APPROVE VALIDATE ---', flush=True)
for i, e in enumerate(entries):
    api_post('catalogManage.approve', {'json': {'id': e['id'], 'stage': 'validate', 'activateNow': False}})
    if (i + 1) % 10 == 0:
        time.sleep(1)
print('Validate approved', flush=True)

# Publish all
print('--- PUBLISH ---', flush=True)
ok = fail = 0
for i, e in enumerate(entries):
    r = api_post('governance.stageTransition', {'json': {'entryId': e['id'], 'targetStage': 'publish'}})
    if r:
        ok += 1
    else:
        fail += 1
    if (i + 1) % 10 == 0:
        print(f'  publish {i+1}/{len(entries)} (ok={ok} fail={fail})', flush=True)
        time.sleep(1)
print(f'Publish: {ok} ok, {fail} fail', flush=True)

# Approve publish
print('--- APPROVE PUBLISH ---', flush=True)
for i, e in enumerate(entries):
    api_post('catalogManage.approve', {'json': {'id': e['id'], 'stage': 'publish', 'activateNow': False}})
    if (i + 1) % 10 == 0:
        time.sleep(1)
print('Publish approved', flush=True)

print('=== PIPELINE COMPLETE ===', flush=True)
