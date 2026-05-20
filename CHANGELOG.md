# Change Log

## 1.0.18

- Line buffer fix: serial data now outputs on complete lines only
- HEX send support: toggle HEX view and send hex bytes (e.g. AA BB CC)
- Send input placeholder changes with view mode
- Added extension icon (ico.png)

## 1.0.17

- Fixed Stop button not switching back to Start UI

## 1.0.16

- Fixed COM port friendly name extraction from PowerShell output

## 1.0.15

- Auto-copy to clipboard on mouse selection in log area

## 1.0.14

- All toolbar buttons converted to inline SVG icons

## 1.0.13

- Log filtering: filter input, OFF/INC/EXC mode toggle, save filter rules

## 1.0.12

- Replaced Text/Hex buttons with SVG toggle; Start/Stop/Clear/TS as SVG icons

## 1.0.11

- Port friendly names via PowerShell Get-PnpDevice

## 1.0.10

- Port dropdown auto-selects first COM port

## 1.0.9

- Removed "-- select --" placeholder from port dropdown

## 1.0.8

- Remove custom baud rate button; custom bauds persisted in globalState

## 1.0.7

- Fixed label/select font contrast using --vscode-foreground with !important

## 1.0.5

- Full serial functionality rewrite: connect, disconnect, receive, send, hex view, timestamp

## 1.0.4

- Clean rewrite: single WebviewViewProvider, inline HTML, type "webview"

## 1.0.0

- Initial fork from Eclipse CDT Cloud Serial Monitor
