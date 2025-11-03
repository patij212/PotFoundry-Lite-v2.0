import os
import sys

import requests

run_id = os.environ.get("CI_RUN_ID", "19022921478")
owner_repo = "patij212/PotFoundry-Lite-v2.0"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not TOKEN:
    print("No GH token found in env (GITHUB_TOKEN or GH_TOKEN).")
    sys.exit(2)
url = f"https://api.github.com/repos/{owner_repo}/actions/runs/{run_id}/logs"
print("GET", url)
resp = requests.get(
    url,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
    },
    allow_redirects=True,
    stream=True,
)
print("status", resp.status_code)
if resp.status_code == 302 or resp.status_code == 200:
    # If redirected, requests follows redirects; write content
    out = os.path.join(os.getcwd(), f".tmp_run_{run_id}_logs.zip")
    with open(out, "wb") as f:
        for chunk in resp.iter_content(8192):
            if chunk:
                f.write(chunk)
    print("Saved", out)
else:
    print("Body:", resp.text[:2000])
    sys.exit(3)
