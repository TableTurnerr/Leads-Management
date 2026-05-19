#!/usr/bin/env bash
# setup-cf-tunnel.sh
#
# Add an ingress hostname for supabase.tableturnerr.com -> http://localhost:48321
# on the existing `home-server` Cloudflare Tunnel.
#
# Tunnel:   home-server
# UUID:     ea0913f0-244a-494b-b35c-8d4842a658d9
# New host: supabase.tableturnerr.com  ->  Kong on http://localhost:48321
#
# IMPORTANT — read this first
# ---------------------------
# When inspected on 2026-05-19, the home server was running cloudflared as a
# *token-based* tunnel (systemd unit calls `cloudflared tunnel run --token ...`)
# and no /etc/cloudflared/config.yml existed. Token-based tunnels manage their
# ingress rules in the Cloudflare dashboard, not in a local YAML file.
#
# Two paths below — use whichever matches your setup:
#
#   PATH A (most likely, current state): Token-based tunnel
#     -> Add the hostname in the Cloudflare Zero Trust dashboard.
#
#   PATH B: If you later migrate to a config.yml-based tunnel, the steps to
#     edit /etc/cloudflared/config.yml are kept at the bottom for reference.
#
# Run on the home server (it will prompt for sudo where needed).
set -euo pipefail

# ---------------------------------------------------------------------------
# PATH A — Token-based tunnel (current setup)
# ---------------------------------------------------------------------------
# 1) Open: https://one.dash.cloudflare.com/  ->  Networks  ->  Tunnels
# 2) Click the `home-server` tunnel  ->  Public Hostname  ->  Add a public hostname
# 3) Fill in:
#       Subdomain: supabase
#       Domain:    tableturnerr.com
#       Path:      (leave empty)
#       Type:      HTTP
#       URL:       localhost:48321
# 4) Expand "Additional application settings"  ->  TLS:
#       No TLS Verify:        ON
#       HTTP Host Header:     supabase.tableturnerr.com
#       Connection timeout:   30
# 5) Save. Cloudflare creates the DNS CNAME automatically.
#
# Verify from any machine:
#   dig +short supabase.tableturnerr.com
#   curl -I https://supabase.tableturnerr.com
#
# No service reload is needed — the running cloudflared picks up new ingress
# rules from the dashboard within a few seconds.

# ---------------------------------------------------------------------------
# PATH B — File-based tunnel (only if /etc/cloudflared/config.yml exists)
# ---------------------------------------------------------------------------
# Run these blocks one at a time and read the output between steps.

# 1) Show the current config so you can verify where to insert the new block.
sudo cat /etc/cloudflared/config.yml

# 2) Back it up.
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak.$(date +%Y%m%d)

# 3) Insert the new ingress block ABOVE the catch-all `- service: http_status:404`.
#
# Option 3a — Manual edit (recommended; you control the indentation):
#
#   sudo nano /etc/cloudflared/config.yml
#
# Paste this block immediately ABOVE the `- service: http_status:404` line,
# matching the existing two-space indentation:
#
#     - hostname: supabase.tableturnerr.com
#       service: http://localhost:48321
#       originRequest:
#         noTLSVerify: true
#         httpHostHeader: supabase.tableturnerr.com
#         connectTimeout: 30s
#
# Option 3b — sed one-liner (assumes the catch-all line starts with two spaces
# and looks exactly like `  - service: http_status:404`). Inspect the file
# from step 1 before trusting this:
#
#   sudo sed -i.bak '/^[[:space:]]*-[[:space:]]*service:[[:space:]]*http_status:404/i\
#     - hostname: supabase.tableturnerr.com\
#       service: http://localhost:48321\
#       originRequest:\
#         noTLSVerify: true\
#         httpHostHeader: supabase.tableturnerr.com\
#         connectTimeout: 30s' /etc/cloudflared/config.yml
#
# After either option, re-run `sudo cat /etc/cloudflared/config.yml` and
# eyeball the result.

# 4) Create the DNS CNAME on the existing tunnel.
sudo cloudflared tunnel route dns home-server supabase.tableturnerr.com

# 5) Validate the new config.
sudo cloudflared tunnel ingress validate --config /etc/cloudflared/config.yml

# 6) Reload (falls back to restart if reload is not supported by the unit).
sudo systemctl reload cloudflared || sudo systemctl restart cloudflared

# 7) Verify the service is healthy.
sudo systemctl status cloudflared --no-pager | head -10

# 8) Smoke-test the hostname.
curl -I https://supabase.tableturnerr.com
