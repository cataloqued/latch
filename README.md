<div align="center">

# Latch

### A self-hosted panel for managing processes across all your systems.

![Self-hosted](https://img.shields.io/badge/self--hosted-fully-7C3AED?style=for-the-badge)
![Multi-VPS](https://img.shields.io/badge/multi--VPS-supported-22C55E?style=for-the-badge)
![Live Logs](https://img.shields.io/badge/live-logs-0EA5E9?style=for-the-badge)
![No Paywall](https://img.shields.io/badge/no_paywall-or_signup-F97316?style=for-the-badge)


</div>

---

## What is Latch?

**Latch is a self-hosted dashboard for viewing and managing your processes across multiple systems.**

Think of it as an **SSH key for your browser**.

Install Latch on a VPS, open the dashboard, and remotely:

* 👀 Monitor your processes
* 🔄 Restart applications
* ⏹️ Stop running processes
* ⚙️ Update process configuration
* 🖥️ Manage multiple machines from one panel



> [!IMPORTANT]
> Latch works like this: your Host => the internet => your router => your device.
> None of your data goes through any Latch infrastructure, there isn't any.

---

##  Get started

```bash
npm install --global latchup
```

Start the panel:

```bash
latch up
```

Latch will start the panel over TLS and print:

* A secure connection URL
* A short, one-time pairing code

Open the URL in your browser, enter the code, and your device is paired.

**That is it.**

Full walkthrough, every command, and troubleshooting: [user-guide.md](user-guide.md).

---

##  Why Latch?

Existing tools force users into a trap. Latch does everything, no sign-in or billing required.

- **PM2** is great but single-host, Node and CLI only
- **Portainer / Coolify / Dokploy** are heavyweight - full PaaS platforms when all you wanted was to see and edit your processes
- **pm2.io** is paid whilst seeing all of your data

Latch is the best of all worlds

✅ **Lightweight**
✅ **Multi-VPS**
✅ **Runtime-agnostic**
✅ **Browser-based**
✅ **Self-hosted**
✅ **No external Latch account required**

Run Node.js, Python, shell scripts, compiled binaries, or anything else your machine can execute.

---

##  Security 

Latch has a simple root of trust:

> **If you can SSH into the machine, you can use Latch. If you cannot, you cannot.**

### Self-hosted by design

The Latch panel runs on infrastructure you control.

Your browser connects to your machine rather than connecting through a hosted Latch backend.

### Device pairing instead of passwords

Run:

```bash
latch up
```

Latch generates a connection URL and a short-lived, one-time code.

Enter the code in the panel to pair your browser securely with the Latch instance.

The SSH login hook can reprint the pairing information whenever you log into the machine.

> [!NOTE]
> Pairing codes are intended for initial device authentication. They are not permanent passwords.

---

##  Multi-VPS management

One machine runs the **Latch Hub**, which hosts the dashboard.

Your other machines run lightweight **Latch Agents** that connect using tokens.


```text
                         ┌─────────────────┐
                         │     Browser     │
                         └────────┬────────┘
                                  │ 
                                  ▼
                         ┌─────────────────┐
                         │  Latch Panel    │
                         │                 │
                         └────────┬────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
        ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
        │                │ │                │ │                │
        │     VPS A      │ │     VPS B      │ │     VPS C      │
        ├────────────────┤ ├────────────────┤ ├────────────────┤
        │   Processes    │ │   Processes    │ │   Processes    │
        └────────────────┘ └────────────────┘ └────────────────┘
```




1. Start the panel
2. Generate an agent token.
3. Join another machine.
4. Manage everything from one dashboard.

**One panel. Every machine. Every process.**

---

##  License

Latch is licensed under [GNU AGPL v3.0](LICENSE).


<div align="center">

### Your machines. Your panel. Your control.

</div>
