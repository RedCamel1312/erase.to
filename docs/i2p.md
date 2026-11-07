# Using erase.to over I2P

I run a separate I2P destination for people who want to reach erase.to through their own router. It opens the same editor and uses the same message store, retrieval limits and expiry rules. The public destination is [vxuja2ta2jwqgp6zxmus2esqkwd3ehw74ggeefyyuzgfqffwwuqa.b32.i2p](http://vxuja2ta2jwqgp6zxmus2esqkwd3ehw74ggeefyyuzgfqffwwuqa.b32.i2p/).

1. Start your I2P router and allow time for it to build tunnels. Use a separate browser profile configured with your own router's HTTP proxy. A common local setting is `127.0.0.1:4444`. Follow the [I2P browser guide](https://i2p.net/en/docs/guides/browser-config/) for your client.
2. Open the base32 address above through that profile. Check the complete hostname before entering anything. A public web gateway can read or replace the page it delivers. A note's link secret belongs only in a browser you trust.
3. Write the note or choose files, set the expiry and create the link. The recipient needs I2P to open a link created on this origin. Keep any additional passphrase on a separate channel. The full sharing link includes the fragment after `#`.

JavaScript, WebAssembly, module workers and a working cryptographic random source are required. Some browsers restrict clipboard access on HTTP origins. The link can also be selected and copied manually. The command-line client has no I2P transport.

## What the destination sees

The browser sends HTTP through the local I2P proxy. I2P authenticates the destination and encrypts the network transport. The tunnel connects to nginx over loopback on the server. Use a router under your own control; a remote browser proxy has access to this HTTP traffic. The frontend accepts its configured base32 origin, with the same protocol and key derivation as the HTTPS client.

The server router handles I2P peer and destination information to deliver streams. Its HTTP tunnel disables destination headers. The local reverse proxy forwards the origin checks, content type and proof headers needed by the API. It drops client destination identifiers, cookies, referers and forwarding headers. The API still sees request timing, packet sizes and the note ID during authorized requests.

I publish the destination alongside the public HTTPS site. Both routes reach the same service, so access through I2P does not conceal who operates it. Traffic correlation, compromised client software, a compromised origin and copies made by a recipient remain relevant. See the [threat model](threat-model.md).

## Hosting a destination

The example targets a dedicated Debian or Ubuntu router with the packaged `i2pd.service`, an existing native erase.to installation and nginx. It uses outbound router connectivity and a server tunnel to the loopback address `127.0.0.1:7382`. Keep that port off public interfaces and forwarding rules.

| File | Installation path |
| --- | --- |
| [Router configuration](../deploy/i2p/i2pd.conf) | `/etc/i2pd/i2pd.conf` |
| [HTTP server tunnel](../deploy/i2p/tunnels.conf) | `/etc/i2pd/tunnels.conf` |
| [systemd drop-in](../deploy/i2p/service.conf) | `/etc/systemd/system/i2pd.service.d/erase.conf` |
| [nginx virtual host](../deploy/nginx-i2p.conf) | Include the rendered file in nginx's HTTP context alongside the native erase.to host |
| [Shared nginx limits](../deploy/nginx-admission.conf) | `/etc/nginx/erase-admission.conf`, loaded once by the main host configuration |

Install i2pd and its signed reseed certificates from a maintained package source. Check the package unit, account, data directory and startup arguments before applying the drop-in. Its `ExecStart` names the two configuration files and the extra tunnel directory explicitly. Check `/etc/i2pd/tunnels.conf.d` for sample or existing tunnels, since i2pd loads every `.conf` there. A router that already serves other applications needs its own configuration review.

The supplied router disables transit, floodfill, inbound transport publication, UPnP, address-book subscriptions, the web console, client proxies and local control interfaces. Reseeding verifies signed router information. The systemd unit uses the distribution's `i2pd` account, protects system files, grants write access to router state and runtime directories, disables process swap and core dumps, and discards normal output. i2pd keeps router keys and network database state on disk. erase.to message packets remain in the separate volatile cache.

### Generate and publish the address

On the first start, leave the nginx listener unconfigured and omit the `hostoverride` line from the tunnel. Check that `/var/lib/i2pd` belongs to the router account and has mode `0700`. Run `systemctl daemon-reload` after installing the drop-in, then start the router. i2pd creates `/var/lib/i2pd/erase-site.dat` on first use. Reuse that file across updates. Losing it changes the destination address, and disclosing it allows another operator to impersonate that destination.

Read **only the public base32 address** with the `keyinfo` program from i2pd-tools. Its default output is the hostname. The file itself contains private keys. [i2pd-tools](https://github.com/PurpleI2P/i2pd-tools)

```sh
sudo -u i2pd keyinfo /var/lib/i2pd/erase-site.dat
```

Replace `__I2P_HOST__` in the tunnel and nginx templates with that exact hostname. A standard address contains 52 lowercase base32 characters followed by `.b32.i2p`. Set `hostoverride` to the public hostname so nginx can verify the request host. The tunnel listens on I2P destination port 80 and forwards to local port 7382. [i2pd server tunnel options](https://docs.i2pd.website/en/latest/user-guide/tunnels/#serverhttp-tunnels)

Append the exact `http://` origin to the application's existing `PUBLIC_ORIGINS` list. Set `VITE_I2P_URL` to the same origin when building the frontend. Both settings are public. The first allows the API to accept this Host and Origin. The second identifies the destination to the browser build. The destination key stays outside the repository, web root and build environment.

After installing the rendered files, run `nginx -t`, reload nginx and restart the dedicated router with its final tunnel configuration. Apply the new API environment and browser build using the normal [deployment procedure](operations.md#updates-rollback-and-incident-handling).

### Verify both ends

On the server, check the service account, identity-file permissions and that nginx listens only on loopback for port 7382. The local address below must use your rendered hostname as the Host. This verifies the local hop.

```sh
I2P_HOST='__I2P_HOST__'
ss -ltn 'sport = :7382'
curl --fail --noproxy '*' -H "Host: $I2P_HOST" http://127.0.0.1:7382/api/config
```

On a separate client with a working local I2P router, fetch the same public configuration through that router. Use the router's actual HTTP proxy port. Clearing `NO_PROXY` for this command keeps a bypass rule from sending the hostname to the system resolver.

```sh
I2P_HOST='__I2P_HOST__'
curl --fail --max-time 120 --noproxy '' --proxy http://127.0.0.1:4444 "http://$I2P_HOST/api/config"
```

Finish in the I2P browser profile with a synthetic one-time note. Create it, open the link, verify the text, then confirm that a second open is unavailable. A slow tunnel may time out on large packages. A failed transfer after an authorized open can already have consumed the retrieval.
