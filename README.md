# Build

## Ubuntu

- Install dependencies: `apt install -y libssl-dev libwebkit2gtk-4.1-dev curl unzip`
- Install nodejs and package manager `pnpm`
```sh
curl -o- https://fnm.vercel.app/install | bash
fnm install 22
node -v # Should print "v22.14.0".
corepack enable pnpm
pnpm -v
```
- Install packages: `pnpm i`
- Create icons: `pnpm tauri icon`
- Build: `pnpm tauri build`

## Other platforms

Follow the Github workflows for macos, and windows builds.

## Trust Assumption

> Your Zcash wallet can show the balance of your address when the last
transaction is older than 1000 blocks.

This should be true regardless of the type of wallet, hot/cold/hw. 1000 blocks
cover any possible chain reorganization which are capped at 100 by full node
software.

## Workflow

1. After the registration period begins and before it ends, create a new wallet
   WB (with a new seed S)
2. Transfer funds from your existing wallet WA to your new wallet WB.
3. Wait until the registration period ends
4. Transfer funds from WB back to WA. This doesn't have to be done right after
   the registration period ends.
5. Wait at least 1 day or 1000 blocks
6. Check the balance on your wallet WA. By virtue of the trust assumption, this
balance can be trusted. Since funds cannot exist at two places, WB must have no
balance at this point
7. Use the seed phrase S of WB in the voting app

> Even if the app is malicious and/or there is a vulnerability that reveals the
> secret key to an attacker, they will have the seed phrase of an empty account.
> The seed phrase of the original wallet was never used in this workflow.

## Note
The Voting app works essentially like a wallet and should not leak any
information that could allow an attacker to steal your funds. However, the
protocol and the app do not have the same level of audit as the Orchard
protocol. Therefore, we suggest using the previous workflow.
