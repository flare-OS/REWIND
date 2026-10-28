# Local website preview

The Node test site listens on `127.0.0.1:8080`. Caddy serves
`rwd.2bd.net` on HTTP/HTTPS and proxies to that local site.

## Run locally

In one PowerShell window:

```powershell
npm start
```

In another PowerShell window:

```powershell
.\tools\caddy.exe run --config .\Caddyfile --adapter caddyfile
```

## Make it reachable from the internet

1. In Windows Defender Firewall, run `allow-web-ports.ps1` from PowerShell as
   Administrator. It allows only Caddy on inbound TCP ports 80 and 443.
2. Reserve this PC's Wi-Fi address `192.168.1.200` in your router's DHCP settings.
3. In the router at `192.168.1.254`, forward **TCP 80 → 192.168.1.200:80** and
   **TCP 443 → 192.168.1.200:443**.
4. Start both processes above. Caddy will request public HTTPS certificates once
   the router and firewall permit external access. The A record currently points
   to the matching public IP `5.49.178.26`; no DNS change is needed while that
   remains your public IP.

The router forwards are still required; DNS alone cannot carry traffic through
the router to this PC.
