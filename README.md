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
