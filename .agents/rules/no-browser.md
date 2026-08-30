# Directive: No Browser Automation

## Rule

- **Strict Browser Prohibition:** Never launch the browser subagent (`browser_subagent`), never drive or open browser windows, and never interact with live web pages via automated browser tools.
- **Verification Protocol:** Perform all testing and verification using command-line tools (`npm test`, `npm run validate`, `npm run build`, `tsc`, linters) or request manual user verification.
