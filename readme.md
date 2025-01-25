# Chess App with GenAI

Chess App with GenAI is a web-based application that allows users to play chess against an advanced AI opponent powered by OpenAI's language models. Featuring an interactive chessboard, move validation, and real-time AI move suggestions, this application provides an engaging and challenging experience for chess enthusiasts of all levels.

## Getting Started

To use the AI functionality, you need to obtain an OpenAI API key. Once you have your API key, replace the placeholder `'OPENAI_API_KEY'` in the `index.js` file with your actual key to enable AI move generation.

```javascript
// index.js
const openai = new OpenAI({
    apiKey: 'YOUR_ACTUAL_OPENAI_API_KEY', // Replace with your real key
});
```
