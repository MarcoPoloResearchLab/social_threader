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

## Technical Details

### Core Functions

- `splitIntoWordsPreservingPunctuation()`: Maintains punctuation with words
- `isSentenceEnd()`: Detects sentence boundaries
- `buildSentenceArray()`: Constructs sentences from words
- `getChunks()`: Main chunking algorithm
- `chunkByLength()`: Handles overflow text

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile devices
- No external dependencies required

## Local Installation

1. Clone the repository:
```bash
git clone https://github.com/MarkoPoloResearchLab/social_threader.git
```

2. Open `index.html` in a web browser

No build process or dependencies required - it's pure HTML, CSS, and JavaScript.

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
