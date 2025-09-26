# Social Threader

Social Threader is a web-based tool that helps you break long text into smaller chunks ideal for social media platforms like Twitter/X, Bluesky, Threads, and Mastodon. It intelligently preserves sentence structures and punctuation while respecting character limits.

You can find the page ready to for threading texts at https://threader.mprlab.com

## Features

- **Multiple Platform Support**: Pre-configured for popular social media character limits
  - Twitter/X (280 characters)
  - Bluesky (300 characters)
  - Threads/Mastodon (500 characters)
  - Custom length option

- **Smart Text Processing**
  - Preserves punctuation with preceding words
  - Maintains quote integrity
  - Optional sentence-aware breaking
  - Intelligent chunk optimization

- **User-Friendly Interface**
  - Real-time character, word, and sentence counting
  - One-click copying for each chunk
  - Visual thread preview
  - Responsive design for mobile and desktop

- **Advanced Features**
  - Optional post enumeration (e.g., 1/5, 2/5, etc.)
  - Custom chunk size support
  - Dynamic font sizing
  - Auto-expanding text areas
  - Inline image support with clipboard-friendly copying

## Usage

1. **Input Text**
   - Paste or type your text in the left panel
   - See real-time statistics for your input

2. **Choose Breaking Method**
   - Select a preset platform button (Twitter, Bluesky, etc.)
   - Or enter a custom character limit
   - Toggle "Break on full sentences" if desired
   - Enable post enumeration if needed

3. **Review and Copy**
   - See your text broken into optimal chunks
   - Each chunk shows character count and other stats
   - Use "Copy" buttons to easily copy individual chunks
   - Visual indicators show copied chunks in order

### Working with Images

- Paste or drag images directly into the editor; each image becomes its own chunk alongside surrounding text.
- Copied image chunks include the PNG data, HTML markup, and accessible alt text so screenshots can be reposted without manual downloads.
- When the browser cannot perform a rich clipboard write, the app falls back to copying plain text so text-only chunks continue to work on restrictive browsers.

## Technical Details

### Architecture

- ES-module entry point at `js/app.js` orchestrates initialization.
- Core text processing lives in `js/core/chunking.js` with `// @ts-check` and JSDoc annotations.
- DOM-facing view models reside in `js/ui/`, coordinated by `ThreaderController`.
- Constants, presets, and user copy live in `js/constants.js` to avoid magic strings.

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile devices
- No build tooling required; open `index.html` directly

### Testing

- Run `npm install` to install the Happy DOM harness along with the Playwright test runner.
- Install browser binaries once per machine with `npx playwright install` (use `npx playwright install --with-deps chromium` on Linux environments that need system packages).
- Execute `npm test` to run the Happy DOM harness (`npm run test:headless`) followed by the Playwright browser suite (`npm run test:browser`). The command mirrors the sequence executed in CI so local runs surface the same failures.
- The Playwright suite (for example `tests/browser.stats.spec.ts`) opens `index.html?test=true`, injects rich text markup, and verifies the live statistics rendered in the UI.
- Continue to use the `?test=true` query flag in a manual browser session to view the in-browser harness reporter.

### Continuous Integration

- `.github/workflows/browser-tests.yml` runs on pull requests and pushes that modify application code or test tooling. The single job executes the Happy DOM harness first and then the Chromium-only Playwright suite, matching the default `npm test` flow.
- The workflow installs Playwright with required operating-system dependencies, caches the browser downloads, and publishes HTML reports, JUnit output, and traces for debugging failed runs.

## Local Installation

1. Clone the repository:
```bash
git clone https://github.com/MarkoPoloResearchLab/social_threader.git
```

2. Install development dependencies for tests:
```bash
npm install
```

3. Install Playwright browser binaries (first run only):
```bash
npx playwright install
```

4. Open `index.html` in a web browser to use the app directly.

The application remains a static HTML/CSS/JS bundle, while the optional tooling supports automated testing.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the need for better thread creation tools
- Built with modern web standards
- Community feedback and contributions welcome

## Contact

MPR Lab Support - [@MprlapSupport](https://twitter.com/MprlabSupport)

Project Link: [https://github.com/MarkoPoloResearchLab/social_threader](https://github.com/YourUsername/social_threader)

---

Made with ❤️ for the social media community
